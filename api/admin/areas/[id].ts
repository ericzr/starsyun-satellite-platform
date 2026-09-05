import { getAdminArea } from '../../_lib/admin-directory';
import { checkRateLimit } from '../../_lib/stac';
import { clientIdentity, sendError, setCors, type ApiRequest, type ApiResponse } from '../../_lib/http';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });
  try {
    checkRateLimit(clientIdentity(req));
    const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
    const area = await getAdminArea(String(id ?? ''));
    if (!area) return res.status(404).json({ error: 'administrative area not found' });
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    res.status(200).json({ area });
  } catch (error) {
    sendError(res, error);
  }
}
