import { listCatalogProducts, parseCatalogProductQuery } from '../_lib/catalog';
import { checkRateLimit } from '../_lib/stac';
import { clientIdentity, sendError, setCors, type ApiRequest, type ApiResponse } from '../_lib/http';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });
  try {
    checkRateLimit(clientIdentity(req));
    const query = parseCatalogProductQuery(req.query);
    res.setHeader('Cache-Control', 'public, max-age=120, stale-while-revalidate=600');
    res.status(200).json({ products: await listCatalogProducts(query), source: 'supabase', availability: 'available-only' });
  } catch (error) {
    sendError(res, error);
  }
}
