import { createHmac, timingSafeEqual } from 'node:crypto';
import { updatePaymentFromWebhook } from '../_lib/payments';
import { GatewayError } from '../_lib/stac';
import { sendError, type ApiRequest, type ApiResponse } from '../_lib/http';

export const config = { api: { bodyParser: false } };

type StreamRequest = ApiRequest & {
  on?: (event: 'data' | 'end' | 'error', callback: (arg?: unknown) => void) => void;
};

async function rawBody(req: StreamRequest) {
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  if (!req.on) throw new GatewayError(400, 'raw webhook body is required');
  return await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on?.('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(typeof chunk === 'string' ? chunk : String(chunk ?? ''))));
    req.on?.('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on?.('error', reject);
  });
}

function verifySignature(payload: string, header: string | undefined, secret: string) {
  if (!header) throw new GatewayError(400, 'stripe signature is required');
  const parts = Object.fromEntries(header.split(',').map((part) => {
    const [key, value] = part.split('=', 2);
    return [key, value];
  }));
  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) throw new GatewayError(400, 'stripe signature has expired');
  const expected = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  const received = parts.v1 || '';
  const valid = received.length === expected.length && timingSafeEqual(Buffer.from(received), Buffer.from(expected));
  if (!valid) throw new GatewayError(400, 'stripe signature is invalid');
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  try {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new GatewayError(503, 'stripe webhook is not configured');
    const payload = await rawBody(req as StreamRequest);
    const signature = req.headers['stripe-signature'];
    verifySignature(payload, Array.isArray(signature) ? signature[0] : signature, secret);
    const event = JSON.parse(payload) as {
      type?: string;
      id?: string;
      data?: { object?: { id?: string; amount_received?: number; amount?: number; currency?: string; metadata?: { order_id?: string } } };
    };
    const object = event.data?.object;
    const orderId = object?.metadata?.order_id;
    const paymentIntentId = object?.id;
    if (!orderId || !paymentIntentId) return res.status(200).json({ received: true, ignored: true });
    if (event.type === 'payment_intent.succeeded') {
      await updatePaymentFromWebhook(orderId, paymentIntentId, true, event.id, object.amount_received ?? object.amount, object.currency);
    } else if (event.type === 'payment_intent.payment_failed') {
      await updatePaymentFromWebhook(orderId, paymentIntentId, false, event.id, object.amount_received ?? object.amount, object.currency);
    }
    return res.status(200).json({ received: true });
  } catch (error) {
    sendError(res, error);
  }
}
