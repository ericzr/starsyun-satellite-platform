import { requireAdmin } from '../_lib/admin-auth';
import { requireCustomer, setCustomerCookies } from '../_lib/customer-auth';
import { sendError, setCors, type ApiRequest, type ApiResponse } from '../_lib/http';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });
  try {
    res.status(200).json({ user: requireAdmin(req) });
  } catch (error) {
    try {
      const session = await requireCustomer(req);
      if (session.refreshed) setCustomerCookies(res, session.refreshed.accessToken, session.refreshed.refreshToken);
      res.status(200).json({ user: session.user });
    } catch (customerError) {
      sendError(res, customerError ?? error);
    }
  }
}
