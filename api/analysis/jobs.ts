import { requireCustomer, setCustomerCookies } from '../_lib/customer-auth';
import { createAnalysisJob, listCustomerAnalysisJobs, parseAnalysisJobInput } from '../_lib/analysis';
import { checkRateLimit } from '../_lib/stac';
import { clientIdentity, sendError, setCors, type ApiRequest, type ApiResponse } from '../_lib/http';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  try {
    checkRateLimit(clientIdentity(req));
    const session = await requireCustomer(req);
    if (session.refreshed) setCustomerCookies(res, session.refreshed.accessToken, session.refreshed.refreshToken);
    if (req.method === 'GET') return res.status(200).json({ jobs: await listCustomerAnalysisJobs(session.user.id), source: 'supabase' });
    return res.status(201).json({ job: await createAnalysisJob(session.user.id, parseAnalysisJobInput(req.body)), persisted: true });
  } catch (error) {
    sendError(res, error);
  }
}
