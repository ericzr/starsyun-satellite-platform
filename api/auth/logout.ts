import { clearAdminCookie, setAuthCookie } from '../_lib/admin-auth';
import { clearCustomerCookieValues } from '../_lib/customer-auth';
import { sendError, setCors, type ApiRequest, type ApiResponse } from '../_lib/http';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  try {
    setAuthCookie(res, [clearAdminCookie(), ...clearCustomerCookieValues()]);
    res.status(204).end();
  } catch (error) {
    sendError(res, error);
  }
}
