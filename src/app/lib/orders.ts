export type ServerOrderStatus = 'pending_payment' | 'paid' | 'fulfillment' | 'delivered' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'processing' | 'paid' | 'refunded' | 'failed';

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
  paymentProvider?: 'stripe';
  paymentIntentId?: string;
  paymentClientSecret?: string;
  paymentCreatedAt?: string;
  createdAt: string;
  paidAt?: string;
  deliveredAt?: string;
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
