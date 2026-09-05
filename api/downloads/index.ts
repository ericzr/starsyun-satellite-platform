import { listCustomerPublicDownloads, parsePublicDownloadInput, recordPublicDownload } from '../_lib/downloads';
import { requireCustomer, setCustomerCookies } from '../_lib/customer-auth';
import { clientIdentity, sendError, setCors, type ApiRequest, type ApiResponse } from '../_lib/http';
import { checkRateLimit } from '../_lib/stac';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  try {
    checkRateLimit(clientIdentity(req));
    const session = await requireCustomer(req);
    if (session.refreshed) setCustomerCookies(res, session.refreshed.accessToken, session.refreshed.refreshToken);
    if (req.method === 'GET') {
      return res.status(200).json({ downloads: await listCustomerPublicDownloads(session.user.id), source: 'supabase' });
    }
    const download = await recordPublicDownload(session.user.id, parsePublicDownloadInput(req.body));
    return res.status(201).json({ download, source: 'supabase' });
  } catch (error) {
    sendError(res, error);
  }
}
