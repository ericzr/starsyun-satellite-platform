export type ServerOrderStatus = 'pending_payment' | 'paid' | 'fulfillment' | 'delivered' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'processing' | 'paid' | 'refunded' | 'failed';

export interface ServerOrderItem {
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

export interface ServerOrder {
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
  status: ServerOrderStatus;
  paymentStatus: PaymentStatus;
  paymentProvider?: 'stripe' | 'alipay' | 'paypal' | 'payple' | 'bank-transfer' | 'wallet';
  paymentIntentId?: string;
  paymentClientSecret?: string;
  paymentCreatedAt?: string;
  createdAt: string;
  paidAt?: string;
  deliveredAt?: string;
  items: ServerOrderItem[];
}

export interface DeliveryAsset {
  id: string;
  orderId: string;
  fileName: string;
  contentType: string;
  sizeBytes?: number;
  sha256?: string;
  version: number;
  createdAt: string;
  revokedAt?: string;
}

export interface DeliveryAssetInput {
  objectKey: string;
  fileName: string;
  contentType: string;
  sizeBytes?: number;
  sha256?: string;
}

async function orderApiError(response: Response) {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return new Error(payload?.error || `Order request failed (${response.status})`);
}

export async function loadCustomerOrders() {
  const response = await fetch('/api/orders/mine', { credentials: 'include' });
  if (!response.ok) return [] as ServerOrder[];
  const payload = (await response.json()) as { orders?: ServerOrder[] };
  return Array.isArray(payload.orders) ? payload.orders : [];
}

export async function getCustomerOrder(id: string) {
  const response = await fetch(`/api/orders/${encodeURIComponent(id)}`, { credentials: 'include' });
  if (!response.ok) return null;
  const payload = (await response.json()) as { order?: ServerOrder };
  return payload.order ?? null;
}

export async function loadAdminOrders() {
  const response = await fetch('/api/orders', { credentials: 'include' });
  if (!response.ok) return [] as ServerOrder[];
  const payload = (await response.json()) as { orders?: ServerOrder[] };
  return Array.isArray(payload.orders) ? payload.orders : [];
}

export async function loadDeliveryAssets(orderId: string, includeRevoked = false) {
  const suffix = includeRevoked ? '?includeRevoked=true' : '';
  const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/delivery-assets${suffix}`, { credentials: 'include' });
  if (!response.ok) throw await orderApiError(response);
  const payload = (await response.json()) as { assets?: DeliveryAsset[] };
  return Array.isArray(payload.assets) ? payload.assets : [];
}

export async function createDeliveryAsset(orderId: string, input: DeliveryAssetInput) {
  const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/delivery-assets`, {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
  if (!response.ok) throw await orderApiError(response);
  const payload = (await response.json()) as { asset?: DeliveryAsset };
  if (!payload.asset) throw new Error('Delivery API returned no asset');
  return payload.asset;
}

export async function revokeDeliveryAsset(orderId: string, assetId: string) {
  const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/delivery-assets/${encodeURIComponent(assetId)}`, {
    method: 'DELETE', credentials: 'include',
  });
  if (!response.ok) throw await orderApiError(response);
  const payload = (await response.json()) as { asset?: DeliveryAsset };
  if (!payload.asset) throw new Error('Delivery API returned no asset');
  return payload.asset;
}

export async function updateOrderDeliveryStatus(orderId: string, status: 'fulfillment' | 'delivered') {
  const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/delivery-status`, {
    method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
  });
  if (!response.ok) throw await orderApiError(response);
  const payload = (await response.json()) as { order?: ServerOrder };
  if (!payload.order) throw new Error('Order API returned no order');
  return payload.order;
}

export async function createCustomerPaymentIntent(id: string, provider: 'stripe' = 'stripe') {
  const response = await fetch(`/api/orders/${encodeURIComponent(id)}/payment-intent`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider }),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    payment?: { provider: 'stripe'; paymentIntentId: string; clientSecret: string; amount: number; currency: string };
    error?: string;
  };
  if (!response.ok || !payload.payment) throw new Error(payload.error || 'payment initialization failed');
  return payload.payment;
}
