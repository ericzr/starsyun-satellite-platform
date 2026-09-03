import { GatewayError } from './stac';
import { persistenceConfig } from './inquiries';
import type { QuoteRecord } from './quotes';
import { supabaseApiHeaders } from './supabase';

export type OrderStatus = 'pending_payment' | 'paid' | 'fulfillment' | 'delivered' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'processing' | 'paid' | 'refunded' | 'failed';
export type PaymentProvider = 'stripe';

export interface OrderRecord {
  id: string;
  orderNo: string;
  quoteId: string;
  quoteNo: string;
  inquiryId: string;
  userId: string;
  currency: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  deliveryDays: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentProvider?: PaymentProvider;
  paymentIntentId?: string;
  paymentClientSecret?: string;
  paymentCreatedAt?: string;
  createdAt: string;
  paidAt?: string;
  deliveredAt?: string;
}

type Row = Record<string, unknown>;

function validId(value: string, field: string) {
  if (!/^[0-9a-f-]{20,80}$/i.test(value)) throw new GatewayError(400, `${field} is invalid`);
  return value;
}

function mapOrder(row: Row): OrderRecord {
  return {
    id: String(row.id ?? ''),
    orderNo: String(row.order_no ?? ''),
    quoteId: String(row.quote_id ?? ''),
    quoteNo: String(row.quote_no ?? ''),
    inquiryId: String(row.inquiry_id ?? ''),
    userId: String(row.user_id ?? ''),
    currency: String(row.currency ?? 'CNY'),
    subtotal: Number(row.subtotal ?? 0),
    taxAmount: Number(row.tax_amount ?? 0),
    total: Number(row.total ?? 0),
    deliveryDays: Number(row.delivery_days ?? 0),
    status: row.status as OrderStatus,
    paymentStatus: row.payment_status as PaymentStatus,
    paymentProvider: row.payment_provider == null ? undefined : row.payment_provider as PaymentProvider,
    paymentIntentId: row.payment_intent_id == null ? undefined : String(row.payment_intent_id),
    paymentClientSecret: row.payment_client_secret == null ? undefined : String(row.payment_client_secret),
    paymentCreatedAt: row.payment_created_at == null ? undefined : String(row.payment_created_at),
    createdAt: String(row.created_at ?? ''),
    paidAt: row.paid_at == null ? undefined : String(row.paid_at),
    deliveredAt: row.delivered_at == null ? undefined : String(row.delivered_at),
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
  if (!response.ok) {
    if (response.status === 409) throw new GatewayError(409, 'order already exists');
    throw new GatewayError(502, `order persistence failed (${response.status})`);
  }
  return response;
}

async function existingOrder(quoteId: string) {
  const response = await rest(`orders?select=*&quote_id=eq.${encodeURIComponent(quoteId)}&limit=1`);
  const rows = (await response.json()) as Row[];
  return rows[0] ? mapOrder(rows[0]) : null;
}

export async function createOrderFromQuote(quote: QuoteRecord, userId: string) {
  validId(userId, 'customer id');
  if (quote.status !== 'accepted') throw new GatewayError(409, 'quote must be accepted before ordering');
  const current = await existingOrder(quote.id);
  if (current) return current;
  const year = new Date().getFullYear();
  const record = {
    id: crypto.randomUUID(),
    order_no: `ORD-${year}-${Math.floor(100000 + Math.random() * 900000)}`,
    quote_id: quote.id,
    quote_no: quote.quoteNo,
    inquiry_id: quote.inquiryId,
    user_id: userId,
    currency: quote.currency,
    subtotal: quote.subtotal,
    tax_amount: quote.taxAmount,
    total: quote.total,
    delivery_days: quote.deliveryDays,
    status: 'pending_payment',
    payment_status: 'unpaid',
    created_at: new Date().toISOString(),
  };
  try {
    const response = await rest('orders', { method: 'POST', body: JSON.stringify(record), headers: { Prefer: 'return=representation' } });
    const rows = (await response.json()) as Row[];
    if (!rows[0]) throw new GatewayError(502, 'order persistence returned no record');
    return mapOrder(rows[0]);
  } catch (error) {
    if (error instanceof GatewayError && error.status === 409) {
      const duplicate = await existingOrder(quote.id);
      if (duplicate) return duplicate;
    }
    throw error;
  }
}

export async function listCustomerOrders(userId: string) {
  validId(userId, 'customer id');
  const response = await rest(`orders?select=*&user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=100`);
  return ((await response.json()) as Row[]).map(mapOrder);
}

export async function getCustomerOrder(orderId: string, userId: string) {
  validId(orderId, 'order id');
  validId(userId, 'customer id');
  const response = await rest(`orders?select=*&id=eq.${encodeURIComponent(orderId)}&user_id=eq.${encodeURIComponent(userId)}&limit=1`);
  const rows = (await response.json()) as Row[];
  return rows[0] ? mapOrder(rows[0]) : null;
}

/** Server-side order lookup used by the admin delivery workflow. */
export async function getOrderById(orderId: string) {
  validId(orderId, 'order id');
  const response = await rest(`orders?select=*&id=eq.${encodeURIComponent(orderId)}&limit=1`);
  const rows = (await response.json()) as Row[];
  return rows[0] ? mapOrder(rows[0]) : null;
}

export async function listOrders() {
  const response = await rest('orders?select=*&order=created_at.desc&limit=500');
  return ((await response.json()) as Row[]).map(mapOrder);
}

/** Only fulfillment-safe transitions are exposed to administrators. */
export async function updateOrderDeliveryStatus(orderId: string, next: 'fulfillment' | 'delivered') {
  const current = await getOrderById(orderId);
  if (!current) throw new GatewayError(404, 'order not found');
  if (current.status === 'cancelled' || current.status === 'pending_payment') {
    throw new GatewayError(409, `order cannot transition from ${current.status}`);
  }
  if (next === 'fulfillment' && current.status === 'delivered') return current;
  if (next === 'delivered' && !['paid', 'fulfillment', 'delivered'].includes(current.status)) {
    throw new GatewayError(409, `order cannot transition from ${current.status}`);
  }
  const patch: Record<string, unknown> = { status: next };
  if (next === 'delivered') patch.delivered_at = current.deliveredAt ?? new Date().toISOString();
  const response = await rest(`orders?id=eq.${encodeURIComponent(orderId)}&select=*`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
    headers: { Prefer: 'return=representation' },
  });
  const rows = (await response.json()) as Row[];
  if (!rows[0]) throw new GatewayError(404, 'order not found');
  return mapOrder(rows[0]);
}
