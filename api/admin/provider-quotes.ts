import { requireAdmin } from '../_lib/admin-auth';
import { createProviderQuote, listProviderQuotes, parseProviderQuoteInput } from '../_lib/provider-workflow';
import { checkRateLimit } from '../_lib/stac';
import { clientIdentity, sendError, setCors, type ApiRequest, type ApiResponse } from '../_lib/http';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  try {
    checkRateLimit(clientIdentity(req));
    requireAdmin(req);
    if (req.method === 'GET') return res.status(200).json({ providerQuotes: await listProviderQuotes(), source: 'supabase' });
    return res.status(201).json({ providerQuote: await createProviderQuote(parseProviderQuoteInput(req.body)), persisted: true });
  } catch (error) {
    sendError(res, error);
  }
}
