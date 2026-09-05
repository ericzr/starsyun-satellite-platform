import { GatewayError } from './stac';
import { persistenceConfig } from './inquiries';
import { supabaseApiHeaders } from './supabase';

type Row = Record<string, unknown>;

export interface PublicDownloadRecord {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  provider: string;
  fileFormat: string;
  sourceUrl: string;
  requestedAt: string;
}

export interface PublicDownloadInput {
  productId: string;
  productCode: string;
  productName: string;
  provider?: string;
  fileFormat?: string;
  sourceUrl: string;
}

function text(value: unknown, field: string, max: number, required = true) {
  if (value == null && !required) return '';
  if (typeof value !== 'string') throw new GatewayError(400, `${field} is invalid`);
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > max) throw new GatewayError(400, `${field} is invalid`);
  return normalized;
}

function validUserId(value: string) {
  if (!/^[0-9a-f-]{20,80}$/iu.test(value)) throw new GatewayError(400, 'customer id is invalid');
  return value;
}

function validSourceUrl(value: unknown) {
  const sourceUrl = text(value, 'sourceUrl', 2_000);
  try {
    const url = new URL(sourceUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('unsupported protocol');
    return url.toString();
  } catch {
    throw new GatewayError(400, 'sourceUrl is invalid');
  }
}

function recordFromRow(row: Row): PublicDownloadRecord {
  return {
    id: String(row.id ?? ''),
    productId: String(row.product_id ?? ''),
    productCode: String(row.product_code ?? ''),
    productName: String(row.product_name ?? ''),
    provider: String(row.provider ?? ''),
    fileFormat: String(row.file_format ?? ''),
    sourceUrl: String(row.source_url ?? ''),
    requestedAt: String(row.requested_at ?? row.created_at ?? ''),
  };
}

async function rest(path: string, init: RequestInit = {}) {
  const { url, key } = persistenceConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      ...supabaseApiHeaders(key),
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) throw new GatewayError(502, `public download persistence failed (${response.status})`);
  return response;
}

export function parsePublicDownloadInput(body: unknown): PublicDownloadInput {
  const input = (body ?? {}) as Record<string, unknown>;
  return {
    productId: text(input.productId, 'productId', 300),
    productCode: text(input.productCode, 'productCode', 300),
    productName: text(input.productName, 'productName', 600),
    provider: text(input.provider, 'provider', 200, false),
    fileFormat: text(input.fileFormat, 'fileFormat', 200, false),
    sourceUrl: validSourceUrl(input.sourceUrl),
  };
}

export async function recordPublicDownload(userId: string, input: PublicDownloadInput) {
  validUserId(userId);
  const now = new Date().toISOString();
  const response = await rest('public_downloads', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      id: crypto.randomUUID(),
      user_id: userId,
      product_id: input.productId,
      product_code: input.productCode,
      product_name: input.productName,
      provider: input.provider || '',
      file_format: input.fileFormat || '',
      source_url: input.sourceUrl,
      requested_at: now,
      created_at: now,
    }),
  });
  const rows = (await response.json()) as Row[];
  if (!rows[0]) throw new GatewayError(502, 'public download persistence returned no record');
  return recordFromRow(rows[0]);
}

export async function listCustomerPublicDownloads(userId: string) {
  validUserId(userId);
  const response = await rest(`public_downloads?select=*&user_id=eq.${encodeURIComponent(userId)}&order=requested_at.desc&limit=200`);
  return ((await response.json()) as Row[]).map(recordFromRow);
}
