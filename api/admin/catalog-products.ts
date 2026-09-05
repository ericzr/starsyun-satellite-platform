import { requireAdmin } from '../_lib/admin-auth';
import { listCatalogProducts, parseCatalogProductQuery, parseCatalogProductInput, upsertCatalogProduct } from '../_lib/catalog';
import { checkRateLimit } from '../_lib/stac';
import { clientIdentity, sendError, setCors, type ApiRequest, type ApiResponse } from '../_lib/http';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  try {
    checkRateLimit(clientIdentity(req));
    requireAdmin(req);
    if (req.method === 'GET') return res.status(200).json({ products: await listCatalogProducts(parseCatalogProductQuery(req.query)), source: 'supabase', availability: 'available-only' });
    return res.status(201).json({ product: await upsertCatalogProduct(parseCatalogProductInput(req.body)), persisted: true });
  } catch (error) {
    sendError(res, error);
  }
}
