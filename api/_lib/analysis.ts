import { GatewayError } from './stac';
import { persistenceConfig, listUserInquiries } from './inquiries';
import { getCustomerOrder } from './orders';
import { supabaseApiHeaders } from './supabase';

export type AnalysisServiceType = 'change-detection' | 'land-cover' | 'feature-extraction' | 'time-series' | 'custom-analysis';
export type AnalysisJobStatus = 'queued' | 'validating' | 'processing' | 'qa' | 'delivered' | 'cancelled' | 'failed';

export interface AnalysisJob {
  id: string;
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

type Row = Record<string, unknown>;

function uuid(value: unknown, field: string) {
  if (typeof value !== 'string' || !/^[0-9a-f-]{20,80}$/i.test(value)) throw new GatewayError(400, `${field} is invalid`);
  return value;
}

function map(row: Row): AnalysisJob {
  return {
    id: String(row.id ?? ''),
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
  serviceType: AnalysisServiceType;
  inputSpec: Record<string, unknown>;
  outputSpec: Record<string, unknown>;
}

export function parseAnalysisJobInput(body: unknown): AnalysisJobInput {
  const input = (body ?? {}) as Record<string, unknown>;
  const serviceType = input.serviceType;
  if (serviceType !== 'change-detection' && serviceType !== 'land-cover' && serviceType !== 'feature-extraction' && serviceType !== 'time-series' && serviceType !== 'custom-analysis') throw new GatewayError(400, 'serviceType is invalid');
  const inquiryId = input.inquiryId == null || input.inquiryId === '' ? undefined : uuid(input.inquiryId, 'inquiryId');
  const orderId = input.orderId == null || input.orderId === '' ? undefined : uuid(input.orderId, 'orderId');
  if (!inquiryId && !orderId) throw new GatewayError(400, 'inquiryId or orderId is required');
  return { inquiryId, orderId, serviceType, inputSpec: parseSpec(input.inputSpec, 'inputSpec'), outputSpec: parseSpec(input.outputSpec, 'outputSpec') };
}

export async function createAnalysisJob(userId: string, input: AnalysisJobInput) {
  uuid(userId, 'customer id');
  if (input.inquiryId) {
    const inquiries = await listUserInquiries(userId);
    if (!inquiries.some((inquiry) => inquiry.id === input.inquiryId)) throw new GatewayError(404, 'inquiry not found');
  }
  if (input.orderId) {
    const order = await getCustomerOrder(input.orderId, userId);
    if (!order) throw new GatewayError(404, 'order not found');
    if (!['paid', 'fulfillment', 'delivered'].includes(order.status)) throw new GatewayError(409, 'order is not ready for analysis');
  }
  const record = { id: crypto.randomUUID(), inquiry_id: input.inquiryId ?? null, order_id: input.orderId ?? null, service_type: input.serviceType, status: 'queued', input_spec: input.inputSpec, output_spec: input.outputSpec, created_at: new Date().toISOString() };
  const response = await rest('analysis_jobs', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(record) });
  const rows = (await response.json()) as Row[];
  if (!rows[0]) throw new GatewayError(502, 'analysis persistence returned no job');
  return map(rows[0]);
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
