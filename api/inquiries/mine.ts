import { requireCustomer, setCustomerCookies } from '../_lib/customer-auth';
import { listUserInquiries } from '../_lib/inquiries';
import { checkRateLimit } from '../_lib/stac';
import { clientIdentity, sendError, setCors, type ApiRequest, type ApiResponse } from '../_lib/http';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });
  try {
    checkRateLimit(clientIdentity(req));
    const session = await requireCustomer(req);
    if (session.refreshed) setCustomerCookies(res, session.refreshed.accessToken, session.refreshed.refreshToken);
    const { user } = session;
    const inquiries = await listUserInquiries(user.id);
    res.status(200).json({ inquiries, source: 'supabase' });
  } catch (error) {
    sendError(res, error);
  }
}
