import { isConfiguredAdminEmail, issueAdminCookie, setAuthCookie, verifyAdminCredentials } from '../_lib/admin-auth';
import { setCustomerCookies, signInCustomer } from '../_lib/customer-auth';
import { sendError, setCors, type ApiRequest, type ApiResponse } from '../_lib/http';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.email !== 'string' || typeof body.password !== 'string') {
      return res.status(400).json({ error: 'email and password are required' });
    }
    if (isConfiguredAdminEmail(body.email)) {
      const user = verifyAdminCredentials(body.email, body.password);
      setAuthCookie(res, issueAdminCookie(user.email));
      return res.status(200).json({ user });
    }
    const session = await signInCustomer(body.email, body.password);
    setCustomerCookies(res, session.accessToken, session.refreshToken);
    res.status(200).json({ user: session.user });
  } catch (error) {
    sendError(res, error);
  }
}
