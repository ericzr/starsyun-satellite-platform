import { requireCustomer, setCustomerCookies } from '../_lib/customer-auth';
import { getCustomerOrder } from '../_lib/orders';
import { holdOrderFromWallet, parseWalletOperation } from '../_lib/wallet';
import { checkRateLimit } from '../_lib/stac';
import { clientIdentity, sendError, setCors, type ApiRequest, type ApiResponse } from '../_lib/http';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  try {
    checkRateLimit(clientIdentity(req));
    const session = await requireCustomer(req);
    if (session.refreshed) setCustomerCookies(res, session.refreshed.accessToken, session.refreshed.refreshToken);
    const input = parseWalletOperation(req.body);
    if (input.direction !== 'hold' || input.referenceType !== 'order') return res.status(400).json({ error: 'only order holds are supported here' });
    const order = await getCustomerOrder(input.referenceId, session.user.id);
    if (!order) return res.status(404).json({ error: 'order not found' });
    if (order.currency !== input.currency || Math.abs(order.total - input.amount) > 0.01) return res.status(409).json({ error: 'hold does not match the order total' });
    // A retry after a successful hold sees a paid wallet order. Let the RPC
    // validate the same idempotency key instead of turning a safe retry into a
    // false conflict. Any other paid/cancelled state remains rejected there.
    if (order.status !== 'pending_payment' && !(order.status === 'paid' && order.paymentProvider === 'wallet')) {
      return res.status(409).json({ error: 'order is not awaiting a wallet hold' });
    }
    // The database RPC performs the balance check, ledger insert, order update,
    // and audit event atomically. The pre-checks above only provide fast UX errors.
    const rawRequestId = req.headers['x-request-id'];
    const requestId = Array.isArray(rawRequestId) ? rawRequestId[0] : rawRequestId;
    return res.status(201).json(await holdOrderFromWallet(session.user.id, input, requestId));
  } catch (error) {
    sendError(res, error);
  }
}
