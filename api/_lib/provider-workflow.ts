import { GatewayError } from './stac';
import { persistenceConfig } from './inquiries';
import { supabaseApiHeaders } from './supabase';

export type ProviderQuoteStatus = 'requested' | 'quoted' | 'expired' | 'accepted' | 'rejected' | 'cancelled' | 'failed';
export type ProviderOrderStatus = 'pending' | 'quoted' | 'submitted' | 'processing' | 'delivered' | 'cancelled' | 'failed';

export interface ProviderAdapter {
  readonly id: string;
  readonly capabilities: readonly ('search' | 'getProduct' | 'quote' | 'createOrder' | 'getOrderStatus' | 'cancel' | 'getDelivery')[];
}

export interface ProviderQuote {
  id: string;
  inquiryId: string;
  providerId: string;
  externalQuoteId?: string;
  status: ProviderQuoteStatus;
  currency?: string;
  amount?: number;
  validUntil?: string;
  termsVersion?: string;
  requestPayload: Record<string, unknown>;
  responsePayload: Record<string, unknown>;
  idempotencyKey: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderOrder {
  id: string;
  orderId: string;
  orderItemId?: string;
  providerId: string;
  externalOrderId?: string;
  status: ProviderOrderStatus;
  idempotencyKey: string;
  requestPayload: Record<string, unknown>;
  responsePayload: Record<string, unknown>;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

type Row = Record<string, unknown>;

const adapters: readonly ProviderAdapter[] = [
  { id: 'earth-search', capabilities: ['search', 'getProduct'] },
  { id: 'copernicus', capabilities: ['search', 'getProduct'] },
];

const quoteTransitions: Record<ProviderQuoteStatus, ProviderQuoteStatus[]> = {
  requested: ['quoted', 'failed', 'cancelled'], quoted: ['accepted', 'rejected', 'expired', 'failed'], accepted: [], rejected: [], expired: [], cancelled: [], failed: ['requested'],
};
const orderTransitions: Record<ProviderOrderStatus, ProviderOrderStatus[]> = {
  pending: ['quoted', 'submitted', 'failed', 'cancelled'], quoted: ['submitted', 'failed', 'cancelled'], submitted: ['processing', 'failed', 'cancelled'], processing: ['delivered', 'failed', 'cancelled'], delivered: [], cancelled: [], failed: ['pending'],
};

export function providerAdapters() {
  return adapters.map((adapter) => ({ id: adapter.id, capabilities: [...adapter.capabilities] }));
}

function uuid(value: unknown, field: string) {
  if (typeof value !== 'string' || !/^[0-9a-f-]{20,80}$/i.test(value)) throw new GatewayError(400, `${field} is invalid`);
  return value;
}

function text(value: unknown, field: string, min = 1, max = 160) {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max) throw new GatewayError(400, `${field} is invalid`);
  return value.trim();
}

function jsonObject(value: unknown, field: string, max = 32_000) {
  if (value == null) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(value).length > max) throw new GatewayError(400, `${field} is invalid`);
  return value as Record<string, unknown>;
}

function mapQuote(row: Row): ProviderQuote {
  return { id: String(row.id ?? ''), inquiryId: String(row.inquiry_id ?? ''), providerId: String(row.provider_id ?? ''), externalQuoteId: row.external_quote_id == null ? undefined : String(row.external_quote_id), status: row.status as ProviderQuoteStatus, currency: row.currency == null ? undefined : String(row.currency), amount: row.amount == null ? undefined : Number(row.amount), validUntil: row.valid_until == null ? undefined : String(row.valid_until), termsVersion: row.terms_version == null ? undefined : String(row.terms_version), requestPayload: jsonObject(row.request_payload, 'requestPayload'), responsePayload: jsonObject(row.response_payload, 'responsePayload'), idempotencyKey: String(row.idempotency_key ?? ''), lastError: row.last_error == null ? undefined : String(row.last_error), createdAt: String(row.created_at ?? ''), updatedAt: String(row.updated_at ?? '') };
}

function mapOrder(row: Row): ProviderOrder {
  return { id: String(row.id ?? ''), orderId: String(row.order_id ?? ''), orderItemId: row.order_item_id == null ? undefined : String(row.order_item_id), providerId: String(row.provider_id ?? ''), externalOrderId: row.external_order_id == null ? undefined : String(row.external_order_id), status: row.status as ProviderOrderStatus, idempotencyKey: String(row.idempotency_key ?? ''), requestPayload: jsonObject(row.request_payload, 'requestPayload'), responsePayload: jsonObject(row.response_payload, 'responsePayload'), lastError: row.last_error == null ? undefined : String(row.last_error), createdAt: String(row.created_at ?? ''), updatedAt: String(row.updated_at ?? '') };
}

async function rest(path: string, init: RequestInit = {}) {
  const { url, key } = persistenceConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...supabaseApiHeaders(key), Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers ?? {}) } });
  if (!response.ok) {
    if (response.status === 409) throw new GatewayError(409, 'provider operation already exists');
    throw new GatewayError(502, `provider persistence failed (${response.status})`);
  }
  return response;
}

async function providerIsUsable(providerId: string) {
  const response = await rest(`data_sources?select=id,status&id=eq.${encodeURIComponent(providerId)}&limit=1`);
  const rows = (await response.json()) as Row[];
  if (!rows[0]) throw new GatewayError(404, 'provider is not registered');
  if (!['enabled', 'configured'].includes(String(rows[0].status))) throw new GatewayError(409, 'provider is not enabled');
}

export interface ProviderQuoteInput {
  inquiryId: string;
  providerId: string;
  idempotencyKey: string;
  requestPayload: Record<string, unknown>;
}

export function parseProviderQuoteInput(body: unknown): ProviderQuoteInput {
  const input = (body ?? {}) as Record<string, unknown>;
  const idempotencyKey = text(input.idempotencyKey, 'idempotencyKey', 8, 160);
  if (!/^[A-Za-z0-9._:-]+$/.test(idempotencyKey)) throw new GatewayError(400, 'idempotencyKey is invalid');
  return { inquiryId: uuid(input.inquiryId, 'inquiryId'), providerId: text(input.providerId, 'providerId', 2, 80), idempotencyKey, requestPayload: jsonObject(input.requestPayload, 'requestPayload') };
}

export async function createProviderQuote(input: ProviderQuoteInput) {
  await providerIsUsable(input.providerId);
  const existingResponse = await rest(`provider_quotes?select=*&idempotency_key=eq.${encodeURIComponent(input.idempotencyKey)}&limit=1`);
  const existing = (await existingResponse.json()) as Row[];
  if (existing[0]) return mapQuote(existing[0]);
  const record = { id: crypto.randomUUID(), inquiry_id: input.inquiryId, provider_id: input.providerId, status: 'requested', request_payload: input.requestPayload, response_payload: {}, idempotency_key: input.idempotencyKey, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  const response = await rest('provider_quotes', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(record) });
  const rows = (await response.json()) as Row[];
  if (!rows[0]) throw new GatewayError(502, 'provider quote persistence returned no record');
  return mapQuote(rows[0]);
}

export async function listProviderQuotes() {
  const response = await rest('provider_quotes?select=*&order=created_at.desc&limit=500');
  return ((await response.json()) as Row[]).map(mapQuote);
}

export async function updateProviderQuote(id: string, status: ProviderQuoteStatus, patch: { amount?: number; currency?: string; externalQuoteId?: string; validUntil?: string; termsVersion?: string; responsePayload?: Record<string, unknown>; lastError?: string } = {}) {
  uuid(id, 'provider quote id');
  const currentResponse = await rest(`provider_quotes?select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
  const currentRows = (await currentResponse.json()) as Row[];
  if (!currentRows[0]) throw new GatewayError(404, 'provider quote not found');
  const current = mapQuote(currentRows[0]);
  if (current.status !== status && !quoteTransitions[current.status].includes(status)) throw new GatewayError(409, `provider quote cannot transition from ${current.status}`);
  const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (patch.amount !== undefined) update.amount = patch.amount;
  if (patch.currency !== undefined) {
    if (!['CNY', 'USD', 'EUR', 'AED'].includes(patch.currency)) throw new GatewayError(400, 'currency is invalid');
    update.currency = patch.currency;
  }
  if (patch.externalQuoteId !== undefined) update.external_quote_id = patch.externalQuoteId;
  if (patch.validUntil !== undefined) update.valid_until = patch.validUntil;
  if (patch.termsVersion !== undefined) update.terms_version = patch.termsVersion;
  if (patch.responsePayload !== undefined) update.response_payload = patch.responsePayload;
  if (patch.lastError !== undefined) update.last_error = patch.lastError;
  const response = await rest(`provider_quotes?id=eq.${encodeURIComponent(id)}&select=*`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(update) });
  const rows = (await response.json()) as Row[];
  if (!rows[0]) throw new GatewayError(404, 'provider quote not found');
  return mapQuote(rows[0]);
}

export async function listProviderOrders() {
  const response = await rest('provider_orders?select=*&order=created_at.desc&limit=500');
  return ((await response.json()) as Row[]).map(mapOrder);
}

export interface ProviderOrderInput {
  orderId: string;
  orderItemId?: string;
  providerId: string;
  idempotencyKey: string;
  requestPayload: Record<string, unknown>;
}

export function parseProviderOrderInput(body: unknown): ProviderOrderInput {
  const input = (body ?? {}) as Record<string, unknown>;
  const idempotencyKey = text(input.idempotencyKey, 'idempotencyKey', 8, 160);
  if (!/^[A-Za-z0-9._:-]+$/.test(idempotencyKey)) throw new GatewayError(400, 'idempotencyKey is invalid');
  return { orderId: uuid(input.orderId, 'orderId'), orderItemId: input.orderItemId == null || input.orderItemId === '' ? undefined : uuid(input.orderItemId, 'orderItemId'), providerId: text(input.providerId, 'providerId', 2, 80), idempotencyKey, requestPayload: jsonObject(input.requestPayload, 'requestPayload') };
}

export async function createProviderOrder(input: ProviderOrderInput) {
  await providerIsUsable(input.providerId);
  const orderResponse = await rest(`orders?select=id,status,payment_status&id=eq.${encodeURIComponent(input.orderId)}&limit=1`);
  const orderRows = (await orderResponse.json()) as Row[];
  if (!orderRows[0]) throw new GatewayError(404, 'order not found');
  if (!['paid', 'fulfillment'].includes(String(orderRows[0].status))) throw new GatewayError(409, 'order is not ready for provider fulfillment');
  const existingResponse = await rest(`provider_orders?select=*&idempotency_key=eq.${encodeURIComponent(input.idempotencyKey)}&limit=1`);
  const existing = (await existingResponse.json()) as Row[];
  if (existing[0]) return mapOrder(existing[0]);
  const record = { id: crypto.randomUUID(), order_id: input.orderId, order_item_id: input.orderItemId ?? null, provider_id: input.providerId, status: 'pending', idempotency_key: input.idempotencyKey, request_payload: input.requestPayload, response_payload: {}, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  const response = await rest('provider_orders', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(record) });
  const rows = (await response.json()) as Row[];
  if (!rows[0]) throw new GatewayError(502, 'provider order persistence returned no record');
  return mapOrder(rows[0]);
}

export async function updateProviderOrder(id: string, status: ProviderOrderStatus, patch: { externalOrderId?: string; responsePayload?: Record<string, unknown>; lastError?: string } = {}) {
  uuid(id, 'provider order id');
  const currentResponse = await rest(`provider_orders?select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
  const currentRows = (await currentResponse.json()) as Row[];
  if (!currentRows[0]) throw new GatewayError(404, 'provider order not found');
  const current = mapOrder(currentRows[0]);
  if (current.status !== status && !orderTransitions[current.status].includes(status)) throw new GatewayError(409, `provider order cannot transition from ${current.status}`);
  const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (patch.externalOrderId !== undefined) update.external_order_id = patch.externalOrderId;
  if (patch.responsePayload !== undefined) update.response_payload = patch.responsePayload;
  if (patch.lastError !== undefined) update.last_error = patch.lastError;
  const response = await rest(`provider_orders?id=eq.${encodeURIComponent(id)}&select=*`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(update) });
  const rows = (await response.json()) as Row[];
  if (!rows[0]) throw new GatewayError(404, 'provider order not found');
  return mapOrder(rows[0]);
}
