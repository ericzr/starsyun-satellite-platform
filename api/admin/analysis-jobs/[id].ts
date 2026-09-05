import { requireAdmin } from '../../_lib/admin-auth';
import { updateAnalysisJobStatus, type AnalysisJobStatus } from '../../_lib/analysis';
import { checkRateLimit } from '../../_lib/stac';
import { clientIdentity, sendError, setCors, type ApiRequest, type ApiResponse } from '../../_lib/http';

const statuses: AnalysisJobStatus[] = ['queued', 'validating', 'processing', 'qa', 'delivered', 'cancelled', 'failed'];

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'method not allowed' });
  try {
    checkRateLimit(clientIdentity(req));
    requireAdmin(req);
    const rawId = req.query.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (!id) return res.status(400).json({ error: 'missing analysis job id' });
    if (!statuses.includes(body.status as AnalysisJobStatus)) return res.status(400).json({ error: 'status is invalid' });
    return res.status(200).json({ job: await updateAnalysisJobStatus(id, body.status as AnalysisJobStatus, {
      workerKey: typeof body.workerKey === 'string' ? body.workerKey : undefined,
      errorMessage: typeof body.errorMessage === 'string' ? body.errorMessage : undefined,
      outputSpec: body.outputSpec && typeof body.outputSpec === 'object' && !Array.isArray(body.outputSpec) ? body.outputSpec as Record<string, unknown> : undefined,
    }), persisted: true });
  } catch (error) {
    sendError(res, error);
  }
}
