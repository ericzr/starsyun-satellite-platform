import { requireCustomer, setCustomerCookies } from '../_lib/customer-auth';
import { listWalletTransactions, type WalletCurrency } from '../_lib/wallet';
import { checkRateLimit } from '../_lib/stac';
import { clientIdentity, sendError, setCors, type ApiRequest, type ApiResponse } from '../_lib/http';

function requestedCurrency(value: unknown): WalletCurrency {
  return value === 'USD' || value === 'EUR' || value === 'AED' ? value : 'CNY';
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });
  try {
    checkRateLimit(clientIdentity(req));
    const session = await requireCustomer(req);
    if (session.refreshed) setCustomerCookies(res, session.refreshed.accessToken, session.refreshed.refreshToken);
    const rawCurrency = req.query.currency;
    const accountCurrency = requestedCurrency(Array.isArray(rawCurrency) ? rawCurrency[0] : rawCurrency);
    return res.status(200).json({ ...(await listWalletTransactions(session.user.id, accountCurrency)), source: 'supabase' });
  } catch (error) {
    sendError(res, error);
  }
}
