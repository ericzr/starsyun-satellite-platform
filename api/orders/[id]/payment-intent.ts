import { requireCustomer, setCustomerCookies } from '../../_lib/customer-auth';
import { getCustomerOrder } from '../../_lib/orders';
import { createPaymentIntent } from '../../_lib/payments';
import { checkRateLimit } from '../../_lib/stac';
import { clientIdentity, sendError, setCors, type ApiRequest, type ApiResponse } from '../../_lib/http';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  try {
    checkRateLimit(clientIdentity(req));
    const session = await requireCustomer(req);
    if (session.refreshed) setCustomerCookies(res, session.refreshed.accessToken, session.refreshed.refreshToken);
    const rawId = req.query.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id) return res.status(400).json({ error: 'missing order id' });
    const order = await getCustomerOrder(id, session.user.id);
    if (!order) return res.status(404).json({ error: 'order not found' });
    const body = (req.body ?? {}) as Record<string, unknown>;
    const provider = body.provider == null || body.provider === '' ? 'stripe' : body.provider;
    if (provider !== 'stripe') return res.status(400).json({ error: 'unsupported payment provider' });
    const intent = await createPaymentIntent(order, provider);
    return res.status(200).json({ payment: intent, orderId: order.id });
  } catch (error) {
    sendError(res, error);
  }
}
