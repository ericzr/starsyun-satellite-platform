import { requireAdmin } from '../_lib/admin-auth';
import { createQuote, listQuotes, parseQuoteInput } from '../_lib/quotes';
import { checkRateLimit } from '../_lib/stac';
import { clientIdentity, sendError, setCors, type ApiRequest, type ApiResponse } from '../_lib/http';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });
  try {
    checkRateLimit(clientIdentity(req));
    const admin = requireAdmin(req);
    if (req.method === 'GET') return res.status(200).json({ quotes: await listQuotes(), source: 'supabase' });
    const quote = await createQuote(parseQuoteInput(req.body), admin.email);
    res.status(201).json({ quote, persisted: true });
  } catch (error) {
    sendError(res, error);
  }
}
