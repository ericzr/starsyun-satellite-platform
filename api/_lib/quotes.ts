import { GatewayError } from './stac';
import { persistenceConfig } from './inquiries';

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'cancelled';
export type QuoteCurrency = 'CNY' | 'USD' | 'EUR' | 'AED';

export interface QuoteInput {
  inquiryId: string;
  currency: QuoteCurrency;
  subtotal: number;
  taxRate: number;
  deliveryDays: number;
  validUntil: string;
  notes: string;
}

export interface QuoteRecord extends QuoteInput {
  id: string;
  quoteNo: string;
  version: number;
  taxAmount: number;
  total: number;
  status: QuoteStatus;
  createdBy: string;
  createdAt: string;
  sentAt?: string;
  acceptedAt?: string;
}

type QuoteRow = Record<string, unknown>;
const MAX_NOTES = 4000;

function uuid(value: unknown, field: string) {
  if (typeof value !== 'string' || !/^[0-9a-f-]{20,80}$/i.test(value)) throw new GatewayError(400, `${field} is invalid`);
  return value;
}

function numberValue(value: unknown, field: string, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new GatewayError(400, `${field} is invalid`);
  return parsed;
}

function dateValue(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new GatewayError(400, 'validUntil must be YYYY-MM-DD');
  if (Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new GatewayError(400, 'validUntil is invalid');
  return value;
}

export function parseQuoteInput(body: unknown): QuoteInput {
  const input = (body ?? {}) as Record<string, unknown>;
  const currency = input.currency;
  if (currency !== 'CNY' && currency !== 'USD' && currency !== 'EUR' && currency !== 'AED') {
    throw new GatewayError(400, 'currency is invalid');
  }
  const notes = typeof input.notes === 'string' ? input.notes.trim() : '';
  if (notes.length > MAX_NOTES) throw new GatewayError(400, 'notes is too long');
  return {
    inquiryId: uuid(input.inquiryId, 'inquiryId'),
    currency,
    subtotal: numberValue(input.subtotal, 'subtotal', 0, 1_000_000_000_000),
    taxRate: numberValue(input.taxRate ?? 0, 'taxRate', 0, 100),
    deliveryDays: Math.floor(numberValue(input.deliveryDays, 'deliveryDays', 1, 365)),
    validUntil: dateValue(input.validUntil),
    notes,
  };
}

function mapQuote(row: QuoteRow): QuoteRecord {
  return {
    id: String(row.id ?? ''),
    quoteNo: String(row.quote_no ?? ''),
    inquiryId: String(row.inquiry_id ?? ''),
    version: Number(row.version ?? 1),
    currency: row.currency as QuoteCurrency,
    subtotal: Number(row.subtotal ?? 0),
    taxRate: Number(row.tax_rate ?? 0),
    taxAmount: Number(row.tax_amount ?? 0),
    total: Number(row.total ?? 0),
    deliveryDays: Number(row.delivery_days ?? 0),
    validUntil: String(row.valid_until ?? ''),
    notes: String(row.notes ?? ''),
    status: row.status as QuoteStatus,
    createdBy: String(row.created_by ?? ''),
    createdAt: String(row.created_at ?? ''),
    sentAt: row.sent_at == null ? undefined : String(row.sent_at),
    acceptedAt: row.accepted_at == null ? undefined : String(row.accepted_at),
  };
}

function quoteNo() {
  return `QT-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
}

async function rest(path: string, init: RequestInit = {}) {
  const { url, key } = persistenceConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) throw new GatewayError(502, `quote persistence failed (${response.status})`);
  return response;
}

async function nextVersion(inquiryId: string) {
  const response = await rest(`quotes?select=version&inquiry_id=eq.${encodeURIComponent(inquiryId)}&order=version.desc&limit=1`);
  const rows = (await response.json()) as QuoteRow[];
  return Number(rows[0]?.version ?? 0) + 1;
}

export async function createQuote(input: QuoteInput, createdBy: string) {
  const version = await nextVersion(input.inquiryId);
  const subtotal = Math.round(input.subtotal * 100) / 100;
  const taxAmount = Math.round(subtotal * input.taxRate) / 100;
  const total = Math.round((subtotal + taxAmount) * 100) / 100;
  const record = {
    id: crypto.randomUUID(),
    quote_no: quoteNo(),
    inquiry_id: input.inquiryId,
    version,
    currency: input.currency,
    subtotal,
    tax_rate: input.taxRate,
    tax_amount: taxAmount,
    total,
    delivery_days: input.deliveryDays,
    valid_until: input.validUntil,
    notes: input.notes,
    status: 'draft' as const,
    created_by: createdBy,
    created_at: new Date().toISOString(),
  };
  const response = await rest('quotes', { method: 'POST', body: JSON.stringify(record), headers: { Prefer: 'return=representation' } });
  const rows = (await response.json()) as QuoteRow[];
  if (!rows[0]) throw new GatewayError(502, 'quote persistence returned no record');
  return mapQuote(rows[0]);
}

export async function listQuotes() {
  const response = await rest('quotes?select=*&order=created_at.desc&limit=500');
  return ((await response.json()) as QuoteRow[]).map(mapQuote);
}

export async function listCustomerQuotes(userId: string) {
  uuid(userId, 'customer id');
  const inquiryResponse = await rest(`inquiries?select=id&user_id=eq.${encodeURIComponent(userId)}&limit=100`);
  const inquiryRows = (await inquiryResponse.json()) as QuoteRow[];
  const inquiryIds = inquiryRows.map((row) => String(row.id)).filter(Boolean);
  if (inquiryIds.length === 0) return [];
  const filter = inquiryIds.join(',');
  const response = await rest(`quotes?select=*&inquiry_id=in.(${encodeURIComponent(filter)})&status=in.(sent,accepted)&order=created_at.desc&limit=100`);
  return ((await response.json()) as QuoteRow[]).map(mapQuote);
}

function canTransition(current: QuoteStatus, next: QuoteStatus, allowAcceptance: boolean) {
  if (current === next) return true;
  if (next === 'accepted') return allowAcceptance && current === 'sent';
  const transitions: Partial<Record<QuoteStatus, QuoteStatus[]>> = {
    draft: ['sent', 'cancelled'],
    sent: ['rejected', 'expired', 'cancelled'],
  };
  return transitions[current]?.includes(next) ?? false;
}

export async function updateQuoteStatus(id: string, status: QuoteStatus, options: { allowAcceptance?: boolean } = {}) {
  uuid(id, 'quote id');
  const currentResponse = await rest(`quotes?id=eq.${encodeURIComponent(id)}&select=*`);
  const currentRows = (await currentResponse.json()) as QuoteRow[];
  if (!currentRows[0]) throw new GatewayError(404, 'quote not found');
  const current = mapQuote(currentRows[0]);
  if (!canTransition(current.status, status, options.allowAcceptance === true)) {
    throw new GatewayError(409, `quote cannot transition from ${current.status} to ${status}`);
  }
  const patch: Record<string, unknown> = { status };
  if (status === 'sent') patch.sent_at = new Date().toISOString();
  if (status === 'accepted') patch.accepted_at = new Date().toISOString();
  const response = await rest(`quotes?id=eq.${encodeURIComponent(id)}&select=*`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
    headers: { Prefer: 'return=representation' },
  });
  const rows = (await response.json()) as QuoteRow[];
  if (!rows[0]) throw new GatewayError(404, 'quote not found');
  return mapQuote(rows[0]);
}

export async function acceptQuote(id: string, userId: string) {
  const quotesResponse = await rest(`quotes?id=eq.${encodeURIComponent(uuid(id, 'quote id'))}&select=*`);
  const quoteRows = (await quotesResponse.json()) as QuoteRow[];
  if (!quoteRows[0]) throw new GatewayError(404, 'quote not found');
  const quote = mapQuote(quoteRows[0]);
  const inquiryResponse = await rest(`inquiries?select=id&user_id=eq.${encodeURIComponent(uuid(userId, 'customer id'))}&id=eq.${encodeURIComponent(quote.inquiryId)}`);
  const inquiryRows = (await inquiryResponse.json()) as QuoteRow[];
  if (!inquiryRows[0]) throw new GatewayError(403, 'quote does not belong to customer');
  if (quote.status === 'accepted') return quote;
  if (quote.status !== 'sent') throw new GatewayError(409, 'quote is not available for acceptance');
  if (quote.validUntil < new Date().toISOString().slice(0, 10)) throw new GatewayError(409, 'quote has expired');
  return updateQuoteStatus(quote.id, 'accepted', { allowAcceptance: true });
}
