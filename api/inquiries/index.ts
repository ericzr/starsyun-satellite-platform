import { buildInquiry, insertInquiry, listInquiries, parseInquiryInput } from '../_lib/inquiries';
import { requireAdmin } from '../_lib/admin-auth';
import { requireCustomer, setCustomerCookies } from '../_lib/customer-auth';
import { GatewayError } from '../_lib/stac';
import { checkRateLimit } from '../_lib/stac';
import { clientIdentity, sendError, setCors, type ApiRequest, type ApiResponse } from '../_lib/http';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

  try {
    checkRateLimit(clientIdentity(req));
    if (req.method === 'GET') {
      requireAdmin(req);
      const inquiries = await listInquiries();
      return res.status(200).json({ inquiries, source: 'supabase' });
    }
    let userId: string | undefined;
    try {
      const session = await requireCustomer(req);
      userId = session.user.id;
      if (session.refreshed) setCustomerCookies(res, session.refreshed.accessToken, session.refreshed.refreshToken);
    } catch (error) {
      if (!(error instanceof GatewayError) || (error.status !== 401 && error.status !== 503)) throw error;
    }
    const record = await insertInquiry({ ...buildInquiry(parseInquiryInput(req.body)), userId });
    res.status(201).json({ inquiry: record, persisted: true });
  } catch (error) {
    sendError(res, error);
  }
}
