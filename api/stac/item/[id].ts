import { checkRateLimit, getEarthSearchItem } from '../../_lib/stac';
import { clientIdentity, sendError, setCors, type ApiRequest, type ApiResponse } from '../../_lib/http';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

  try {
    checkRateLimit(clientIdentity(req));
    const rawId = req.query.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id) return res.status(400).json({ error: 'missing provider item id' });
    const payload = await getEarthSearchItem(id);
    res.status(200).json({ ...payload, source: 'earth-search' });
  } catch (error) {
    sendError(res, error);
  }
}
