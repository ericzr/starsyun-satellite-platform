import { GatewayError } from './stac';
import { persistenceConfig } from './inquiries';
import type { QuoteRecord } from './quotes';
import { supabaseApiHeaders } from './supabase';

export type OrderStatus = 'pending_payment' | 'paid' | 'fulfillment' | 'delivered' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'processing' | 'paid' | 'refunded' | 'failed';
export type PaymentProvider = 'stripe' | 'alipay' | 'paypal' | 'payple' | 'bank-transfer' | 'wallet';

export interface OrderItemRecord {
  id: string;
  orderId: string;
  providerProductId?: string;
  providerId?: string;
  externalProductId?: string;
  itemType: string;
  quantity: number;
  unitPrice: number;
  currency: string;
  productSnapshot: Record<string, unknown>;
  licenseSnapshot: Record<string, unknown>;
  createdAt: string;
}

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
  items: OrderItemRecord[];
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
    items: Array.isArray(row.items) ? row.items as OrderItemRecord[] : [],
  };
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function mapOrderItem(row: Row): OrderItemRecord {
  return {
    id: String(row.id ?? ''),
    orderId: String(row.order_id ?? ''),
    providerProductId: row.provider_product_id == null ? undefined : String(row.provider_product_id),
    providerId: row.provider_id == null ? undefined : String(row.provider_id),
    externalProductId: row.external_product_id == null ? undefined : String(row.external_product_id),
    itemType: String(row.item_type ?? 'quote'),
    quantity: Number(row.quantity ?? 1),
    unitPrice: Number(row.unit_price ?? 0),
    currency: String(row.currency ?? 'CNY'),
    productSnapshot: jsonObject(row.product_snapshot),
    licenseSnapshot: jsonObject(row.license_snapshot),
    createdAt: String(row.created_at ?? ''),
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

async function transition(orderId: string, status: OrderStatus, actorType: 'admin' | 'customer' | 'system' = 'admin', actorId = 'system', requestId?: string) {
  const { url, key } = persistenceConfig();
  const response = await fetch(`${url}/rest/v1/rpc/transition_order`, {
    method: 'POST',
    headers: { ...supabaseApiHeaders(key), Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_order_id: orderId, p_to_status: status, p_actor_type: actorType, p_actor_id: actorId, p_request_id: requestId ?? null, p_payload: {} }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    if (response.status === 400 || response.status === 404) throw new GatewayError(409, detail.includes('not found') ? 'order not found' : 'invalid order status transition');
    throw new GatewayError(502, `order transition failed (${response.status})`);
  }
  const rows = (await response.json()) as Row[];
  if (!rows[0]) throw new GatewayError(404, 'order not found');
  return (await hydrateOrders([mapOrder(rows[0])]))[0];
}

async function existingOrder(quoteId: string) {
  const response = await rest(`orders?select=*&quote_id=eq.${encodeURIComponent(quoteId)}&limit=1`);
  const rows = (await response.json()) as Row[];
  return rows[0] ? mapOrder(rows[0]) : null;
}

async function orderItems(orderIds: string[]) {
  if (orderIds.length === 0) return new Map<string, OrderItemRecord[]>();
  try {
    const response = await rest(`order_items?select=*&order_id=in.(${encodeURIComponent(orderIds.join(','))})&order=created_at.asc&limit=2000`);
    const grouped = new Map<string, OrderItemRecord[]>();
    for (const row of (await response.json()) as Row[]) {
      const item = mapOrderItem(row);
      const current = grouped.get(item.orderId) ?? [];
      current.push(item);
      grouped.set(item.orderId, current);
    }
    return grouped;
  } catch {
    // Keep the order header readable while an older deployment is migrating
    // the order_items table. New orders will backfill the item when available.
    return new Map<string, OrderItemRecord[]>();
  }
}

async function hydrateOrders(orders: OrderRecord[]) {
  const grouped = await orderItems(orders.map((order) => order.id));
  return orders.map((order) => ({ ...order, items: grouped.get(order.id) ?? order.items }));
}

async function quoteInquirySnapshot(inquiryId: string) {
  try {
    const response = await rest(`inquiries?select=type,product_name,region,area_km2,expect_res&id=eq.${encodeURIComponent(inquiryId)}&limit=1`);
    const rows = (await response.json()) as Row[];
    return rows[0] ?? {};
  } catch {
    return {};
  }
}

async function ensureQuoteOrderItem(order: OrderRecord, quote: QuoteRecord) {
  try {
    const existing = await rest(`order_items?select=id&order_id=eq.${encodeURIComponent(order.id)}&item_type=eq.quote&limit=1`);
    if (((await existing.json()) as Row[]).length > 0) return;
    const inquiry = await quoteInquirySnapshot(quote.inquiryId);
    await rest('order_items', {
      method: 'POST',
      body: JSON.stringify({
        id: crypto.randomUUID(),
        order_id: order.id,
        item_type: 'quote',
        quantity: 1,
        unit_price: quote.subtotal,
        currency: quote.currency,
        product_snapshot: {
          productName: inquiry.product_name ?? null,
          type: inquiry.type ?? null,
          region: inquiry.region ?? null,
          areaKm2: inquiry.area_km2 ?? null,
          expectedResolution: inquiry.expect_res ?? null,
          quoteNo: quote.quoteNo,
        },
        license_snapshot: {},
        created_at: new Date().toISOString(),
      }),
      headers: { Prefer: 'return=minimal' },
    });
  } catch {
    // Item support is additive. Do not turn a valid accepted quote into a
    // failed order solely while a rolling deployment is applying migration 009.
  }
}

export async function createOrderFromQuote(quote: QuoteRecord, userId: string) {
  validId(userId, 'customer id');
  if (quote.status !== 'accepted') throw new GatewayError(409, 'quote must be accepted before ordering');
  const current = await existingOrder(quote.id);
  if (current) {
    await ensureQuoteOrderItem(current, quote);
    return (await hydrateOrders([current]))[0];
  }
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
    const order = mapOrder(rows[0]);
    await ensureQuoteOrderItem(order, quote);
    return (await hydrateOrders([order]))[0];
  } catch (error) {
    if (error instanceof GatewayError && error.status === 409) {
      const duplicate = await existingOrder(quote.id);
      if (duplicate) {
        await ensureQuoteOrderItem(duplicate, quote);
        return (await hydrateOrders([duplicate]))[0];
      }
    }
    throw error;
  }
}

export async function listCustomerOrders(userId: string) {
  validId(userId, 'customer id');
  const response = await rest(`orders?select=*&user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=100`);
  return hydrateOrders(((await response.json()) as Row[]).map(mapOrder));
}

export async function getCustomerOrder(orderId: string, userId: string) {
  validId(orderId, 'order id');
  validId(userId, 'customer id');
  const response = await rest(`orders?select=*&id=eq.${encodeURIComponent(orderId)}&user_id=eq.${encodeURIComponent(userId)}&limit=1`);
  const rows = (await response.json()) as Row[];
  if (!rows[0]) return null;
  return (await hydrateOrders([mapOrder(rows[0])]))[0];
}

/** Server-side order lookup used by the admin delivery workflow. */
export async function getOrderById(orderId: string) {
  validId(orderId, 'order id');
  const response = await rest(`orders?select=*&id=eq.${encodeURIComponent(orderId)}&limit=1`);
  const rows = (await response.json()) as Row[];
  return rows[0] ? (await hydrateOrders([mapOrder(rows[0])]))[0] : null;
}

export async function listOrders() {
  const response = await rest('orders?select=*&order=created_at.desc&limit=500');
  return hydrateOrders(((await response.json()) as Row[]).map(mapOrder));
}

/** Only fulfillment-safe transitions are exposed to administrators. */
export async function updateOrderDeliveryStatus(orderId: string, next: 'fulfillment' | 'delivered', actorId = 'system', requestId?: string) {
  const current = await getOrderById(orderId);
  if (!current) throw new GatewayError(404, 'order not found');
  if (current.status === 'cancelled' || current.status === 'pending_payment') {
    throw new GatewayError(409, `order cannot transition from ${current.status}`);
  }
  if (next === 'fulfillment' && current.status === 'delivered') return current;
  if (next === 'delivered' && !['paid', 'fulfillment', 'delivered'].includes(current.status)) {
    throw new GatewayError(409, `order cannot transition from ${current.status}`);
  }
  return transition(orderId, next, 'admin', actorId, requestId);
}

export async function cancelCustomerOrder(orderId: string, userId: string, requestId?: string) {
  const current = await getCustomerOrder(orderId, userId);
  if (!current) throw new GatewayError(404, 'order not found');
  if (current.status !== 'pending_payment') throw new GatewayError(409, 'paid or fulfilled orders require a refund review before cancellation');
  return transition(orderId, 'cancelled', 'customer', userId, requestId);
}
