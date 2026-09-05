import { requireAdmin } from '../../_lib/admin-auth';
import { updateProviderOrder, type ProviderOrderStatus } from '../../_lib/provider-workflow';
import { checkRateLimit } from '../../_lib/stac';
import { clientIdentity, sendError, setCors, type ApiRequest, type ApiResponse } from '../../_lib/http';

const statuses: ProviderOrderStatus[] = ['pending', 'quoted', 'submitted', 'processing', 'delivered', 'cancelled', 'failed'];

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
    if (!id) return res.status(400).json({ error: 'missing provider order id' });
    if (!statuses.includes(body.status as ProviderOrderStatus)) return res.status(400).json({ error: 'status is invalid' });
    return res.status(200).json({ providerOrder: await updateProviderOrder(id, body.status as ProviderOrderStatus, {
      externalOrderId: typeof body.externalOrderId === 'string' ? body.externalOrderId : undefined,
      responsePayload: body.responsePayload && typeof body.responsePayload === 'object' && !Array.isArray(body.responsePayload) ? body.responsePayload as Record<string, unknown> : undefined,
      lastError: typeof body.lastError === 'string' ? body.lastError : undefined,
    }), persisted: true });
  } catch (error) {
    sendError(res, error);
  }
}
