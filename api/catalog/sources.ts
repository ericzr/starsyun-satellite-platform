import { listCatalogSources } from '../_lib/catalog';
import { checkRateLimit } from '../_lib/stac';
import { clientIdentity, sendError, setCors, type ApiRequest, type ApiResponse } from '../_lib/http';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });
  try {
    checkRateLimit(clientIdentity(req));
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=1800');
    res.status(200).json({ sources: await listCatalogSources(), source: 'supabase' });
  } catch (error) {
    sendError(res, error);
  }
}
