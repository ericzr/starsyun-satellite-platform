import { setCustomerCookies, signUpCustomer } from '../_lib/customer-auth';
import { checkRateLimit } from '../_lib/stac';
import { clientIdentity, sendError, setCors, type ApiRequest, type ApiResponse } from '../_lib/http';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  try {
    checkRateLimit(clientIdentity(req));
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.email !== 'string' || typeof body.password !== 'string' || typeof body.name !== 'string') {
      return res.status(400).json({ error: 'name, email and password are required' });
    }
    if (body.password.length < 6) return res.status(400).json({ error: 'password must be at least 6 characters' });
    const session = await signUpCustomer({
      email: body.email,
      password: body.password,
      name: body.name,
      phone: typeof body.phone === 'string' ? body.phone : undefined,
      company: typeof body.company === 'string' ? body.company : undefined,
    });
    setCustomerCookies(res, session.accessToken, session.refreshToken);
    res.status(session.accessToken ? 201 : 202).json({ user: session.user, confirmationRequired: !session.accessToken });
  } catch (error) {
    sendError(res, error);
  }
}
