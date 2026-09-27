import { requireCustomer, setCustomerCookies } from '../../../_lib/customer-auth';
import {
  createAnalysisInputUpload,
  listAnalysisInputAssets,
  parseAnalysisInputUpload,
} from '../../../_lib/analysis';
import { checkRateLimit } from '../../../_lib/stac';
import { clientIdentity, sendError, setCors, type ApiRequest, type ApiResponse } from '../../../_lib/http';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  try {
    checkRateLimit(clientIdentity(req));
    const rawJobId = req.query.id;
    const jobId = Array.isArray(rawJobId) ? rawJobId[0] : rawJobId;
    if (!jobId) return res.status(400).json({ error: 'missing analysis job id' });
    const session = await requireCustomer(req);
    if (session.refreshed) setCustomerCookies(res, session.refreshed.accessToken, session.refreshed.refreshToken);
    if (req.method === 'GET') {
      return res.status(200).json({ assets: await listAnalysisInputAssets(jobId, session.user.id), source: 'supabase' });
    }
    return res.status(201).json({
      ...await createAnalysisInputUpload(jobId, session.user.id, parseAnalysisInputUpload(req.body)),
      persisted: true,
    });
  } catch (error) {
    sendError(res, error);
  }
}
