import { checkRateLimit, parseSearchRequest, searchEarthSearch } from '../_lib/stac';
import { clientIdentity, sendError, setCors, type ApiRequest, type ApiResponse } from '../_lib/http';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  try {
    checkRateLimit(clientIdentity(req));
    const input = parseSearchRequest((req.body ?? {}) as Record<string, unknown>);
    const payload = await searchEarthSearch(input);
    res.status(200).json({ ...payload, source: 'earth-search', collection: input.collection });
  } catch (error) {
    sendError(res, error);
  }
}
