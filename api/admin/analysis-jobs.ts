import { requireAdmin } from '../_lib/admin-auth';
import { listAnalysisJobs } from '../_lib/analysis';
import { checkRateLimit } from '../_lib/stac';
import { clientIdentity, sendError, setCors, type ApiRequest, type ApiResponse } from '../_lib/http';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });
  try {
    checkRateLimit(clientIdentity(req));
    requireAdmin(req);
    return res.status(200).json({ jobs: await listAnalysisJobs(), source: 'supabase' });
  } catch (error) {
    sendError(res, error);
  }
}
