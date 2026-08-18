import { requireAdmin } from '../_lib/admin-auth';
import { updateQuoteStatus, type QuoteStatus } from '../_lib/quotes';
import { checkRateLimit } from '../_lib/stac';
import { clientIdentity, sendError, setCors, type ApiRequest, type ApiResponse } from '../_lib/http';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'method not allowed' });
  try {
    checkRateLimit(clientIdentity(req));
    requireAdmin(req);
    const rawId = req.query.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const status = (req.body as { status?: unknown } | undefined)?.status;
    if (!id) return res.status(400).json({ error: 'missing quote id' });
    if (status !== 'draft' && status !== 'sent' && status !== 'accepted' && status !== 'rejected' && status !== 'expired' && status !== 'cancelled') {
      return res.status(400).json({ error: 'status is invalid' });
    }
    res.status(200).json({ quote: await updateQuoteStatus(id, status as QuoteStatus), persisted: true });
  } catch (error) {
    sendError(res, error);
  }
}
