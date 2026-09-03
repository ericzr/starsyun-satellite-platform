import { GatewayError } from './stac';
import { persistenceConfig } from './inquiries';
import { deliveryBucket, signedCosObjectUrl } from './cos';
import { supabaseApiHeaders } from './supabase';

export interface DeliveryAssetInput {
  objectKey: string;
  fileName: string;
  contentType: string;
  sizeBytes?: number;
  sha256?: string;
}

export interface DeliveryAssetRecord extends DeliveryAssetInput {
  id: string;
  orderId: string;
  bucket: string;
  version: number;
  createdBy: string;
  createdAt: string;
  revokedAt?: string;
}

type Row = Record<string, unknown>;

function uuid(value: unknown, field: string) {
  if (typeof value !== 'string' || !/^[0-9a-f-]{20,80}$/i.test(value)) throw new GatewayError(400, `${field} is invalid`);
  return value;
}

function text(value: unknown, field: string, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new GatewayError(400, `${field} is invalid`);
  return value.trim();
}

export function parseDeliveryAssetInput(body: unknown): DeliveryAssetInput {
  const input = (body ?? {}) as Record<string, unknown>;
  const objectKey = text(input.objectKey, 'objectKey', 1024);
  if (objectKey.startsWith('/') || objectKey.includes('..') || [...objectKey].some((character) => character.charCodeAt(0) < 0x20)) throw new GatewayError(400, 'objectKey is invalid');
  const fileName = text(input.fileName, 'fileName', 255);
  const contentType = typeof input.contentType === 'string' && input.contentType.trim() ? input.contentType.trim().slice(0, 160) : 'application/octet-stream';
  const sizeBytes = input.sizeBytes == null || input.sizeBytes === '' ? undefined : Number(input.sizeBytes);
  if (sizeBytes != null && (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0)) throw new GatewayError(400, 'sizeBytes is invalid');
  const sha256 = input.sha256 == null || input.sha256 === '' ? undefined : text(input.sha256, 'sha256', 64).toLowerCase();
  if (sha256 && !/^[0-9a-f]{64}$/.test(sha256)) throw new GatewayError(400, 'sha256 is invalid');
  return { objectKey, fileName, contentType, sizeBytes, sha256 };
}

function map(row: Row): DeliveryAssetRecord {
  return {
    id: String(row.id ?? ''), orderId: String(row.order_id ?? ''), objectKey: String(row.object_key ?? ''), bucket: String(row.bucket ?? 'starsyun-delivery'),
    fileName: String(row.file_name ?? ''), contentType: String(row.content_type ?? 'application/octet-stream'),
    sizeBytes: row.size_bytes == null ? undefined : Number(row.size_bytes), sha256: row.sha256 == null ? undefined : String(row.sha256),
    version: Number(row.version ?? 1), createdBy: String(row.created_by ?? ''), createdAt: String(row.created_at ?? ''),
    revokedAt: row.revoked_at == null ? undefined : String(row.revoked_at),
  };
}

async function rest(path: string, init: RequestInit = {}) {
  const { url, key } = persistenceConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...supabaseApiHeaders(key), Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers ?? {}) } });
  if (!response.ok) throw new GatewayError(502, `delivery persistence failed (${response.status})`);
  return response;
}

export async function createDeliveryAsset(orderId: string, input: DeliveryAssetInput, createdBy: string) {
  uuid(orderId, 'order id');
  const record = { id: crypto.randomUUID(), order_id: orderId, object_key: input.objectKey, bucket: deliveryBucket(), file_name: input.fileName, content_type: input.contentType, size_bytes: input.sizeBytes ?? null, sha256: input.sha256 ?? null, created_by: createdBy, created_at: new Date().toISOString() };
  const response = await rest('delivery_assets', { method: 'POST', body: JSON.stringify(record), headers: { Prefer: 'return=representation' } });
  const rows = (await response.json()) as Row[];
  if (!rows[0]) throw new GatewayError(502, 'delivery persistence returned no record');
  return map(rows[0]);
}

export async function listDeliveryAssets(orderId: string, includeRevoked = false) {
  uuid(orderId, 'order id');
  const revoked = includeRevoked ? '' : '&revoked_at=is.null';
  const response = await rest(`delivery_assets?select=*&order_id=eq.${encodeURIComponent(orderId)}${revoked}&order=created_at.desc&limit=100`);
  return ((await response.json()) as Row[]).map(map);
}

export async function getDeliveryAsset(orderId: string, assetId: string) {
  uuid(orderId, 'order id'); uuid(assetId, 'delivery asset id');
  const response = await rest(`delivery_assets?select=*&id=eq.${encodeURIComponent(assetId)}&order_id=eq.${encodeURIComponent(orderId)}&limit=1`);
  const rows = (await response.json()) as Row[];
  return rows[0] ? map(rows[0]) : null;
}

export async function revokeDeliveryAsset(orderId: string, assetId: string) {
  const asset = await getDeliveryAsset(orderId, assetId);
  if (!asset) throw new GatewayError(404, 'delivery asset not found');
  const response = await rest(`delivery_assets?id=eq.${encodeURIComponent(assetId)}&order_id=eq.${encodeURIComponent(orderId)}&select=*`, { method: 'PATCH', body: JSON.stringify({ revoked_at: new Date().toISOString() }), headers: { Prefer: 'return=representation' } });
  const rows = (await response.json()) as Row[];
  if (!rows[0]) throw new GatewayError(404, 'delivery asset not found');
  return map(rows[0]);
}

export async function issueDeliveryDownload(asset: DeliveryAssetRecord, orderId: string, userId: string, requestId?: string) {
  if (asset.bucket !== deliveryBucket()) throw new GatewayError(409, 'delivery asset bucket is not configured for this service');
  const { url, expiresAt } = signedCosObjectUrl(asset.objectKey);
  const { url: supabaseUrl, key } = persistenceConfig();
  const auditResponse = await fetch(`${supabaseUrl}/rest/v1/delivery_downloads`, { method: 'POST', headers: { ...supabaseApiHeaders(key), 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ id: crypto.randomUUID(), delivery_asset_id: asset.id, order_id: orderId, user_id: userId, expires_at: expiresAt, request_id: requestId ?? null }) });
  if (!auditResponse.ok) throw new GatewayError(502, `delivery audit persistence failed (${auditResponse.status})`);
  return { url, expiresAt };
}
