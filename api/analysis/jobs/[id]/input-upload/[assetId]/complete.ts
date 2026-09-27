import { requireCustomer, setCustomerCookies } from '../../../../../_lib/customer-auth';
import { completeAnalysisInputUpload } from '../../../../../_lib/analysis';
import { checkRateLimit } from '../../../../../_lib/stac';
import { clientIdentity, sendError, setCors, type ApiRequest, type ApiResponse } from '../../../../../_lib/http';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  try {
    checkRateLimit(clientIdentity(req));
    const rawJobId = req.query.id;
    const rawAssetId = req.query.assetId;
    const jobId = Array.isArray(rawJobId) ? rawJobId[0] : rawJobId;
    const assetId = Array.isArray(rawAssetId) ? rawAssetId[0] : rawAssetId;
    if (!jobId || !assetId) return res.status(400).json({ error: 'missing analysis input asset id' });
    const session = await requireCustomer(req);
    if (session.refreshed) setCustomerCookies(res, session.refreshed.accessToken, session.refreshed.refreshToken);
    return res.status(200).json({ asset: await completeAnalysisInputUpload(jobId, assetId, session.user.id), persisted: true });
  } catch (error) {
    sendError(res, error);
  }
}

