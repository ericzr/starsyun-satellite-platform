import { GatewayError } from './stac';
import { persistenceConfig } from './inquiries';
import type { OrderRecord, PaymentProvider } from './orders';
import { supabaseApiHeaders } from './supabase';

export interface PaymentIntentResult {
  provider: PaymentProvider;
  paymentIntentId: string;
  clientSecret: string;
  amount: number;
  currency: string;
}

function stripeConfig() {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new GatewayError(503, 'stripe payment is not configured');
  return { secret };
}

function minorUnitAmount(order: OrderRecord) {
  const amount = Math.round(order.total * 100);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new GatewayError(400, 'order total is invalid for payment');
  return amount;
}

async function stripePaymentIntent(order: OrderRecord): Promise<PaymentIntentResult> {
  const { secret } = stripeConfig();
  const amount = minorUnitAmount(order);
  const params = new URLSearchParams({
    amount: String(amount),
    currency: order.currency.toLowerCase(),
    'payment_method_types[]': 'card',
    'metadata[order_id]': order.id,
    'metadata[order_no]': order.orderNo,
  });
  const response = await fetch('https://api.stripe.com/v1/payment_intents', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': `starsyun-order-${order.id}`,
    },
    body: params,
  });
  const payload = (await response.json().catch(() => ({}))) as { id?: string; client_secret?: string; error?: { message?: string } };
  if (!response.ok || !payload.id || !payload.client_secret) {
    throw new GatewayError(response.status === 400 ? 400 : 502, payload.error?.message || 'stripe payment intent creation failed');
  }
  return {
    provider: 'stripe',
    paymentIntentId: payload.id,
    clientSecret: payload.client_secret,
    amount,
    currency: order.currency,
  };
}

async function patchOrderPayment(orderId: string, intent: PaymentIntentResult) {
  const { url, key } = persistenceConfig();
  const response = await fetch(`${url}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&select=*`, {
    method: 'PATCH',
    headers: {
      ...supabaseApiHeaders(key),
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      payment_provider: intent.provider,
      payment_intent_id: intent.paymentIntentId,
      payment_client_secret: intent.clientSecret,
      payment_status: 'processing',
      payment_created_at: new Date().toISOString(),
    }),
  });
  if (!response.ok) throw new GatewayError(502, `order payment state persistence failed (${response.status})`);
}

export async function createPaymentIntent(order: OrderRecord, provider: PaymentProvider = 'stripe') {
  if (order.status !== 'pending_payment' || !['unpaid', 'failed'].includes(order.paymentStatus)) {
    throw new GatewayError(409, 'order is not payable');
  }
  if (order.paymentProvider === provider && order.paymentIntentId && order.paymentClientSecret) {
    return {
      provider,
      paymentIntentId: order.paymentIntentId,
      clientSecret: order.paymentClientSecret,
      amount: minorUnitAmount(order),
      currency: order.currency,
    } satisfies PaymentIntentResult;
  }
  const intent = provider === 'stripe' ? await stripePaymentIntent(order) : null;
  if (!intent) throw new GatewayError(400, 'unsupported payment provider');
  await patchOrderPayment(order.id, intent);
  return intent;
}

export async function updatePaymentFromWebhook(orderId: string, paymentIntentId: string, succeeded: boolean) {
  const { url, key } = persistenceConfig();
  const stateFilter = succeeded
    ? '&status=eq.pending_payment&payment_status=in.(unpaid,processing,failed)'
    : '&status=eq.pending_payment&payment_status=eq.processing';
  const query = `id=eq.${encodeURIComponent(orderId)}&payment_intent_id=eq.${encodeURIComponent(paymentIntentId)}${stateFilter}&select=id`;
  const body = succeeded
    ? { payment_status: 'paid', status: 'paid', paid_at: new Date().toISOString() }
    : { payment_status: 'failed', status: 'pending_payment' };
  const response = await fetch(`${url}/rest/v1/orders?${query}`, {
    method: 'PATCH',
    headers: {
      ...supabaseApiHeaders(key),
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new GatewayError(502, `order payment status persistence failed (${response.status})`);
  const rows = (await response.json().catch(() => [])) as Array<Record<string, unknown>>;
  return rows.length > 0;
}
