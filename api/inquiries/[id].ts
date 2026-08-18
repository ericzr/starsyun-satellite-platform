import { requireAdmin } from '../_lib/admin-auth';
import { updateInquiryStatus, type InquiryStatus } from '../_lib/inquiries';
import { checkRateLimit } from '../_lib/stac';
import { clientIdentity, sendError, setCors, type ApiRequest, type ApiResponse } from '../_lib/http';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'method not allowed' });
  try {
    checkRateLimit(clientIdentity(req));
    requireAdmin(req);
    const rawId = req.query.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const status = (req.body as { status?: unknown } | undefined)?.status;
    if (!id) return res.status(400).json({ error: 'missing inquiry id' });
    if (status !== 'submitted' && status !== 'pending' && status !== 'quoting' && status !== 'quoted' && status !== 'confirmed') {
      return res.status(400).json({ error: 'status is invalid' });
    }
    const inquiry = await updateInquiryStatus(id, status as InquiryStatus);
    res.status(200).json({ inquiry, persisted: true });
  } catch (error) {
    sendError(res, error);
  }
}
