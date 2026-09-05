import { listAdminAreas, parseAdminQuery } from '../_lib/admin-directory';
import { checkRateLimit } from '../_lib/stac';
import { clientIdentity, sendError, setCors, type ApiRequest, type ApiResponse } from '../_lib/http';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });
  try {
    checkRateLimit(clientIdentity(req));
    const query = parseAdminQuery(req.query);
    const areas = await listAdminAreas(query);
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
    res.status(200).json({ areas, source: 'geoBoundaries-gbOpen', level: query.level ?? null });
  } catch (error) {
    sendError(res, error);
  }
}
