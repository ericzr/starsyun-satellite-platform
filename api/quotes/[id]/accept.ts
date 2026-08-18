import { requireCustomer, setCustomerCookies } from '../../_lib/customer-auth';
import { acceptQuote } from '../../_lib/quotes';
import { createOrderFromQuote } from '../../_lib/orders';
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
    if (!id) return res.status(400).json({ error: 'missing quote id' });
    const quote = await acceptQuote(id, session.user.id);
    const order = await createOrderFromQuote(quote, session.user.id);
    res.status(200).json({ quote, order, persisted: true });
  } catch (error) {
    sendError(res, error);
  }
}
