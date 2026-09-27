import { GatewayError } from './stac';
import { persistenceConfig, listUserInquiries } from './inquiries';
import { getCustomerOrder } from './orders';
import { supabaseApiHeaders } from './supabase';
import { analysisBucket, headAnalysisObject, signedCosObjectUrl } from './cos';

export type AnalysisServiceType = 'change-detection' | 'land-cover' | 'feature-extraction' | 'time-series' | 'custom-analysis';
export type AnalysisJobStatus = 'queued' | 'validating' | 'processing' | 'qa' | 'delivered' | 'cancelled' | 'failed';

export interface AnalysisJob {
  id: string;
  userId?: string;
  inquiryId?: string;
  orderId?: string;
  serviceType: AnalysisServiceType;
  status: AnalysisJobStatus;
  inputSpec: Record<string, unknown>;
  outputSpec: Record<string, unknown>;
  workerKey?: string;
  errorMessage?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export type AnalysisInputSource = 'purchased-order' | 'analysis-inquiry' | 'own-upload';

export type AnalysisInputAssetStatus = 'pending' | 'ready' | 'revoked';

export interface AnalysisInputAsset {
  id: string;
  jobId: string;
  fileName: string;
  contentType: string;
  objectKey: string;
  bucket: string;
  sizeBytes?: number;
  expectedSizeBytes?: number;
  sha256?: string;
  status: AnalysisInputAssetStatus;
  createdAt: string;
  completedAt?: string;
  revokedAt?: string;
}

type Row = Record<string, unknown>;

function uuid(value: unknown, field: string) {
  if (typeof value !== 'string' || !/^[0-9a-f-]{20,80}$/i.test(value)) throw new GatewayError(400, `${field} is invalid`);
  return value;
}

function map(row: Row): AnalysisJob {
  return {
    id: String(row.id ?? ''),
    userId: row.user_id == null ? undefined : String(row.user_id),
    inquiryId: row.inquiry_id == null ? undefined : String(row.inquiry_id),
    orderId: row.order_id == null ? undefined : String(row.order_id),
    serviceType: row.service_type as AnalysisServiceType,
    status: row.status as AnalysisJobStatus,
    inputSpec: row.input_spec && typeof row.input_spec === 'object' ? row.input_spec as Record<string, unknown> : {},
    outputSpec: row.output_spec && typeof row.output_spec === 'object' ? row.output_spec as Record<string, unknown> : {},
    workerKey: row.worker_key == null ? undefined : String(row.worker_key),
    errorMessage: row.error_message == null ? undefined : String(row.error_message),
    createdAt: String(row.created_at ?? ''),
    startedAt: row.started_at == null ? undefined : String(row.started_at),
    completedAt: row.completed_at == null ? undefined : String(row.completed_at),
  };
}

async function rest(path: string, init: RequestInit = {}) {
  const { url, key } = persistenceConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { ...supabaseApiHeaders(key), Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers ?? {}) },
  });
  if (!response.ok) throw new GatewayError(502, `analysis persistence failed (${response.status})`);
  return response;
}

function parseSpec(value: unknown, field: string) {
  if (value == null) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new GatewayError(400, `${field} must be an object`);
  if (JSON.stringify(value).length > 32_000) throw new GatewayError(400, `${field} is too large`);
  return value as Record<string, unknown>;
}

export interface AnalysisJobInput {
  inquiryId?: string;
  orderId?: string;
  inputSource?: AnalysisInputSource;
  serviceType: AnalysisServiceType;
  inputSpec: Record<string, unknown>;
}

const deliverables = ['analysis-report', 'geospatial-data', 'report-and-data'] as const;

function analysisInputSpec(value: unknown) {
  const spec = parseSpec(value, 'inputSpec');
  const objective = typeof spec.objective === 'string' ? spec.objective.trim() : '';
  if (objective.length < 5) throw new GatewayError(400, 'analysis objective is required');
  if (objective.length > 2000) throw new GatewayError(400, 'analysis objective is too long');
  const requestedDeliverable = spec.requestedDeliverable;
  if (!deliverables.includes(requestedDeliverable as (typeof deliverables)[number])) {
    throw new GatewayError(400, 'requestedDeliverable is invalid');
  }
  const analysisFocus = typeof spec.analysisFocus === 'string' ? spec.analysisFocus.trim() : '';
  if (analysisFocus.length > 240) throw new GatewayError(400, 'analysisFocus is too long');
  const targetClasses = Array.isArray(spec.targetClasses)
    ? spec.targetClasses.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean).slice(0, 20)
    : [];
  if (targetClasses.some((item) => item.length > 80)) throw new GatewayError(400, 'targetClasses is invalid');
  const timeRange = spec.timeRange == null ? {} : parseSpec(spec.timeRange, 'timeRange');
  const start = typeof timeRange.start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(timeRange.start) ? timeRange.start : undefined;
  const end = typeof timeRange.end === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(timeRange.end) ? timeRange.end : undefined;
  if (timeRange.start != null && !start) throw new GatewayError(400, 'timeRange.start is invalid');
  if (timeRange.end != null && !end) throw new GatewayError(400, 'timeRange.end is invalid');
  if (start && end && start > end) throw new GatewayError(400, 'timeRange is reversed');
  return { objective, requestedDeliverable, analysisFocus, targetClasses, timeRange: { start, end } };
}

export function parseAnalysisJobInput(body: unknown): AnalysisJobInput {
  const input = (body ?? {}) as Record<string, unknown>;
  const serviceType = input.serviceType;
  if (serviceType !== 'change-detection' && serviceType !== 'land-cover' && serviceType !== 'feature-extraction' && serviceType !== 'time-series' && serviceType !== 'custom-analysis') throw new GatewayError(400, 'serviceType is invalid');
  const inquiryId = input.inquiryId == null || input.inquiryId === '' ? undefined : uuid(input.inquiryId, 'inquiryId');
  const orderId = input.orderId == null || input.orderId === '' ? undefined : uuid(input.orderId, 'orderId');
  const inputSource = input.inputSource == null || input.inputSource === ''
    ? (orderId ? 'purchased-order' : inquiryId ? 'analysis-inquiry' : undefined)
    : input.inputSource;
  if (inputSource !== 'purchased-order' && inputSource !== 'analysis-inquiry' && inputSource !== 'own-upload') {
    throw new GatewayError(400, 'inputSource is invalid');
  }
  if (inputSource === 'own-upload' && (inquiryId || orderId)) {
    throw new GatewayError(400, 'own-upload jobs cannot include an order or inquiry');
  }
  if (inputSource !== 'own-upload' && ((!inquiryId && !orderId) || (inquiryId && orderId))) {
    throw new GatewayError(400, 'exactly one inquiryId or orderId is required');
  }
  return { inquiryId, orderId, inputSource, serviceType, inputSpec: analysisInputSpec(input.inputSpec) };
}

export async function createAnalysisJob(userId: string, input: AnalysisJobInput) {
  uuid(userId, 'customer id');
  if (input.inquiryId) {
    const inquiries = await listUserInquiries(userId);
    const inquiry = inquiries.find((item) => item.id === input.inquiryId);
    if (!inquiry) throw new GatewayError(404, 'inquiry not found');
    if (inquiry.type !== 'analysis') {
      throw new GatewayError(409, 'only an analysis inquiry can be used as an analysis input');
    }
  }
  if (input.orderId) {
    const order = await getCustomerOrder(input.orderId, userId);
    if (!order) throw new GatewayError(404, 'order not found');
    if (!['paid', 'fulfillment', 'delivered'].includes(order.status)) throw new GatewayError(409, 'order is not ready for analysis');
  }
  const record = { id: crypto.randomUUID(), user_id: userId, inquiry_id: input.inquiryId ?? null, order_id: input.orderId ?? null, service_type: input.serviceType, status: 'queued', input_spec: { ...input.inputSpec, inputSource: input.inputSource ?? (input.orderId ? 'purchased-order' : 'analysis-inquiry') }, output_spec: {}, created_at: new Date().toISOString() };
  const response = await rest('analysis_jobs', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(record) });
  const rows = (await response.json()) as Row[];
  if (!rows[0]) throw new GatewayError(502, 'analysis persistence returned no job');
  return map(rows[0]);
}

export async function getCustomerAnalysisJob(id: string, userId: string) {
  uuid(id, 'job id');
  uuid(userId, 'customer id');
  const response = await rest(`analysis_jobs?select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
  const rows = (await response.json()) as Row[];
  if (!rows[0]) throw new GatewayError(404, 'analysis job not found');
  const job = map(rows[0]);
  if (job.inquiryId) {
    const inquiries = await listUserInquiries(userId);
    if (!inquiries.some((item) => item.id === job.inquiryId)) throw new GatewayError(404, 'analysis job not found');
  } else if (job.orderId) {
    if (!(await getCustomerOrder(job.orderId, userId))) throw new GatewayError(404, 'analysis job not found');
  } else if (job.userId !== userId || job.inputSpec.inputSource !== 'own-upload') {
    throw new GatewayError(404, 'analysis job not found');
  }
  return job;
}

function safeFileName(value: unknown) {
  if (typeof value !== 'string' || !value.trim() || value.length > 255) throw new GatewayError(400, 'fileName is invalid');
  const fileName = value.trim().split(/[\\/]/u).pop() ?? '';
  if (!fileName || fileName === '.' || fileName === '..' || [...fileName].some((character) => character.charCodeAt(0) < 0x20)) throw new GatewayError(400, 'fileName is invalid');
  return fileName;
}

function inputContentType(value: unknown, fileName: string) {
  const contentType = typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : '';
  const extension = fileName.toLowerCase().split('.').pop() || '';
  const allowed = new Set([
    'image/tiff', 'image/geotiff', 'application/octet-stream', 'application/geo+json',
    'application/json', 'application/zip', 'application/x-zip-compressed',
    'application/vnd.google-earth.kml+xml', 'application/vnd.google-earth.kmz',
  ]);
  const extensionAllowed = ['tif', 'tiff', 'cog', 'geojson', 'json', 'zip', 'kml', 'kmz'].includes(extension);
  if ((!contentType || !allowed.has(contentType)) && !extensionAllowed) throw new GatewayError(400, 'unsupported analysis input format');
  return contentType || (extension === 'geojson' ? 'application/geo+json' : 'application/octet-stream');
}

function maxUploadBytes() {
  const configured = Number(process.env.COS_UPLOAD_MAX_BYTES || 5 * 1024 * 1024 * 1024);
  return Number.isSafeInteger(configured) && configured > 0 ? Math.min(configured, 20 * 1024 * 1024 * 1024) : 5 * 1024 * 1024 * 1024;
}

export interface AnalysisInputUploadRequest {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sha256?: string;
}

export function parseAnalysisInputUpload(body: unknown): AnalysisInputUploadRequest {
  const input = (body ?? {}) as Record<string, unknown>;
  const fileName = safeFileName(input.fileName);
  const contentType = inputContentType(input.contentType, fileName);
  const sizeBytes = Number(input.sizeBytes);
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > maxUploadBytes()) throw new GatewayError(400, 'sizeBytes is invalid or exceeds the upload limit');
  const sha256 = input.sha256 == null || input.sha256 === '' ? undefined : String(input.sha256).trim().toLowerCase();
  if (sha256 && !/^[0-9a-f]{64}$/u.test(sha256)) throw new GatewayError(400, 'sha256 is invalid');
  return { fileName, contentType, sizeBytes, sha256 };
}

function mapInputAsset(row: Row): AnalysisInputAsset {
  return {
    id: String(row.id ?? ''), jobId: String(row.job_id ?? ''), fileName: String(row.file_name ?? ''),
    contentType: String(row.content_type ?? 'application/octet-stream'), objectKey: String(row.object_key ?? ''),
    bucket: String(row.bucket ?? ''), sizeBytes: row.size_bytes == null ? undefined : Number(row.size_bytes),
    expectedSizeBytes: row.expected_size_bytes == null ? undefined : Number(row.expected_size_bytes),
    sha256: row.sha256 == null ? undefined : String(row.sha256), status: row.status as AnalysisInputAssetStatus,
    createdAt: String(row.created_at ?? ''), completedAt: row.completed_at == null ? undefined : String(row.completed_at),
    revokedAt: row.revoked_at == null ? undefined : String(row.revoked_at),
  };
}

export async function listAnalysisInputAssets(jobId: string, userId: string) {
  await getCustomerAnalysisJob(jobId, userId);
  const response = await rest(`analysis_input_assets?select=*&job_id=eq.${encodeURIComponent(jobId)}&order=created_at.asc&limit=100`);
  return ((await response.json()) as Row[]).map(mapInputAsset);
}

export async function createAnalysisInputUpload(jobId: string, userId: string, input: AnalysisInputUploadRequest) {
  const job = await getCustomerAnalysisJob(jobId, userId);
  if (job.inputSpec.inputSource !== 'own-upload') throw new GatewayError(409, 'this analysis job does not accept own imagery');
  if (['delivered', 'cancelled'].includes(job.status)) throw new GatewayError(409, 'analysis job is closed');
  const existing = await listAnalysisInputAssets(jobId, userId);
  if (existing.filter((asset) => asset.status !== 'revoked').length >= 10) throw new GatewayError(409, 'analysis job accepts at most 10 input files');
  const assetId = crypto.randomUUID();
  const objectKey = `analysis-input/${userId}/${jobId}/${assetId}/${input.fileName}`;
  const record = {
    id: assetId, job_id: jobId, user_id: userId, bucket: analysisBucket(), object_key: objectKey,
    file_name: input.fileName, content_type: input.contentType, expected_size_bytes: input.sizeBytes,
    sha256: input.sha256 ?? null, status: 'pending', created_at: new Date().toISOString(),
  };
  const response = await rest('analysis_input_assets', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(record) });
  const rows = (await response.json()) as Row[];
  if (!rows[0]) throw new GatewayError(502, 'analysis input persistence returned no asset');
  const signed = signedCosObjectUrl(objectKey, 900, 'PUT', 'analysis');
  return { asset: mapInputAsset(rows[0]), upload: { method: 'PUT', url: signed.url, expiresAt: signed.expiresAt, headers: { 'Content-Type': input.contentType } } };
}

export async function completeAnalysisInputUpload(jobId: string, assetId: string, userId: string) {
  const job = await getCustomerAnalysisJob(jobId, userId);
  if (job.inputSpec.inputSource !== 'own-upload') throw new GatewayError(409, 'this analysis job does not accept own imagery');
  uuid(assetId, 'asset id');
  const response = await rest(`analysis_input_assets?select=*&id=eq.${encodeURIComponent(assetId)}&job_id=eq.${encodeURIComponent(jobId)}&user_id=eq.${encodeURIComponent(userId)}&limit=1`);
  const rows = (await response.json()) as Row[];
  if (!rows[0]) throw new GatewayError(404, 'analysis input asset not found');
  const current = mapInputAsset(rows[0]);
  if (current.status === 'revoked') throw new GatewayError(409, 'analysis input asset is revoked');
  if (current.status === 'ready') return current;
  const remote = await headAnalysisObject(current.objectKey);
  if (current.expectedSizeBytes != null && remote.sizeBytes != null && current.expectedSizeBytes !== remote.sizeBytes) throw new GatewayError(409, 'uploaded file size does not match the declared size');
  const updated = await rest(`analysis_input_assets?id=eq.${encodeURIComponent(assetId)}&job_id=eq.${encodeURIComponent(jobId)}&user_id=eq.${encodeURIComponent(userId)}&select=*`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ size_bytes: remote.sizeBytes ?? current.expectedSizeBytes ?? null, status: 'ready', completed_at: new Date().toISOString() }) });
  const updatedRows = (await updated.json()) as Row[];
  if (!updatedRows[0]) throw new GatewayError(502, 'analysis input completion returned no asset');
  return mapInputAsset(updatedRows[0]);
}

export async function listCustomerAnalysisJobs(userId: string) {
  uuid(userId, 'customer id');
  const inquiries = await listUserInquiries(userId);
  const inquiryIds = inquiries.map((inquiry) => inquiry.id).filter(Boolean);
  const { url, key } = persistenceConfig();
  const requests: Promise<Response>[] = [];
  if (inquiryIds.length) requests.push(fetch(`${url}/rest/v1/analysis_jobs?select=*&inquiry_id=in.(${encodeURIComponent(inquiryIds.join(','))})&order=created_at.desc&limit=100`, { headers: { ...supabaseApiHeaders(key), Accept: 'application/json' } }));
  const ordersResponse = await rest(`orders?select=id&user_id=eq.${encodeURIComponent(userId)}&limit=100`);
  const orders = (await ordersResponse.json()) as Row[];
  const orderIds = orders.map((order) => String(order.id)).filter(Boolean);
  if (orderIds.length) requests.push(fetch(`${url}/rest/v1/analysis_jobs?select=*&order_id=in.(${encodeURIComponent(orderIds.join(','))})&order=created_at.desc&limit=100`, { headers: { ...supabaseApiHeaders(key), Accept: 'application/json' } }));
  requests.push(fetch(`${url}/rest/v1/analysis_jobs?select=*&user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=100`, { headers: { ...supabaseApiHeaders(key), Accept: 'application/json' } }));
  const rows = (await Promise.all(requests)).flatMap(async (response) => {
    if (!response.ok) throw new GatewayError(502, `analysis persistence failed (${response.status})`);
    return (await response.json()) as Row[];
  });
  const resolved = (await Promise.all(rows)).flat();
  return [...new Map(resolved.map((row) => [String(row.id), map(row)])).values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function listAnalysisJobs() {
  const response = await rest('analysis_jobs?select=*&order=created_at.desc&limit=500');
  return ((await response.json()) as Row[]).map(map);
}

const transitions: Record<AnalysisJobStatus, AnalysisJobStatus[]> = {
  queued: ['validating', 'cancelled'], validating: ['queued', 'processing', 'failed', 'cancelled'], processing: ['qa', 'failed', 'cancelled'], qa: ['delivered', 'failed'], delivered: [], cancelled: [], failed: ['queued'],
};

export async function updateAnalysisJobStatus(id: string, status: AnalysisJobStatus, patch: { outputSpec?: Record<string, unknown>; workerKey?: string; errorMessage?: string } = {}) {
  uuid(id, 'job id');
  const response = await rest(`analysis_jobs?select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
  const rows = (await response.json()) as Row[];
  if (!rows[0]) throw new GatewayError(404, 'analysis job not found');
  const current = map(rows[0]);
  if (current.status !== status && !transitions[current.status].includes(status)) throw new GatewayError(409, `analysis job cannot transition from ${current.status}`);
  const update: Record<string, unknown> = { status };
  if (status === 'processing' && !current.startedAt) update.started_at = new Date().toISOString();
  if (['delivered', 'cancelled', 'failed'].includes(status)) update.completed_at = current.completedAt ?? new Date().toISOString();
  if (patch.outputSpec) {
    if (JSON.stringify(patch.outputSpec).length > 32_000) throw new GatewayError(400, 'outputSpec is too large');
    update.output_spec = patch.outputSpec;
  }
  if (patch.workerKey) update.worker_key = patch.workerKey;
  if (patch.errorMessage !== undefined) update.error_message = patch.errorMessage;
  const updated = await rest(`analysis_jobs?id=eq.${encodeURIComponent(id)}&select=*`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(update) });
  const updatedRows = (await updated.json()) as Row[];
  if (!updatedRows[0]) throw new GatewayError(404, 'analysis job not found');
  return map(updatedRows[0]);
}
