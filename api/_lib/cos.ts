import { createHmac, createHash } from 'node:crypto';
import { GatewayError } from './stac';

function rfc3986(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function config() {
  const secretId = process.env.COS_SECRET_ID?.trim();
  const secretKey = process.env.COS_SECRET_KEY?.trim();
  const bucket = process.env.COS_DELIVERY_BUCKET?.trim();
  const region = process.env.COS_REGION?.trim();
  if (!secretId || !secretKey || !bucket || !region) {
    throw new GatewayError(503, 'COS delivery storage is not configured');
  }
  const ttl = Math.max(60, Math.min(86_400, Number(process.env.COS_SIGNED_URL_TTL_SECONDS || 900)));
  return { secretId, secretKey, bucket, region, ttl };
}

/** The delivery bucket is intentionally server-only; it is never sent to the browser. */
export function deliveryBucket() {
  return config().bucket;
}

function sha1(value: string) {
  return createHash('sha1').update(value).digest('hex');
}

function hmac(key: string, value: string) {
  return createHmac('sha1', key).update(value).digest('hex');
}

type SignedUrlMethod = 'GET' | 'HEAD';

export type CosObjectMetadata = {
  sizeBytes?: number;
  contentType?: string;
  etag?: string;
  lastModified?: string;
};

export function signedCosObjectUrl(objectKey: string, requestedTtl?: number, method: SignedUrlMethod = 'GET') {
  const { secretId, secretKey, bucket, region, ttl } = config();
  // COS uses the decoded object key in the canonical pathname while the
  // browser URL itself must be percent-encoded. This mirrors the official
  // cos-nodejs-sdk-v5 signer and keeps keys containing spaces/unicode valid.
  const safeKey = objectKey.split('/').map(rfc3986).join('/');
  const host = `${bucket}.cos.${region}.myqcloud.com`;
  const now = Math.floor(Date.now() / 1000) - 1;
  const expires = now + Math.max(60, Math.min(ttl, requestedTtl ?? ttl));
  const keyTime = `${now};${expires}`;
  const signKey = hmac(secretKey, keyTime);
  // COS Signature V5 canonical request: method, URI, query parameters,
  // canonical headers, each separated by exactly one newline. The previous
  // implementation inserted an extra blank line and encoded the Host value,
  // which makes otherwise valid URLs fail against private buckets.
  const httpString = `${method.toLowerCase()}\n/${objectKey}\n\nhost=${rfc3986(host)}\n`;
  const stringToSign = `sha1\n${keyTime}\n${sha1(httpString)}\n`;
  const signature = hmac(signKey, stringToSign);
  const query = new URLSearchParams({
    'q-sign-algorithm': 'sha1',
    'q-ak': secretId,
    'q-sign-time': keyTime,
    'q-key-time': keyTime,
    'q-header-list': 'host',
    'q-url-param-list': '',
    'q-signature': signature,
  });
  return { url: `https://${host}/${safeKey}?${query.toString()}`, expiresAt: new Date(expires * 1000).toISOString() };
}

/**
 * Confirm an administrator-entered object key exists before it is attached to
 * an order. The signed request remains server-side and never exposes COS
 * credentials or a long-lived object URL to the browser.
 */
export async function headDeliveryObject(objectKey: string): Promise<CosObjectMetadata> {
  const { url } = signedCosObjectUrl(objectKey, 60, 'HEAD');
  let response: Response;
  try {
    response = await fetch(url, { method: 'HEAD', redirect: 'error', signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new GatewayError(502, 'delivery object verification failed');
  }
  if (response.status === 404) throw new GatewayError(404, 'delivery object was not found in COS');
  if (!response.ok) throw new GatewayError(502, `delivery object verification failed (${response.status})`);
  const contentLengthHeader = response.headers.get('content-length');
  const contentLength = contentLengthHeader == null ? Number.NaN : Number(contentLengthHeader);
  return {
    sizeBytes: Number.isSafeInteger(contentLength) && contentLength >= 0 ? contentLength : undefined,
    contentType: response.headers.get('content-type') || undefined,
    etag: response.headers.get('etag') || undefined,
    lastModified: response.headers.get('last-modified') || undefined,
  };
}
