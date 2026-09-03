import { requireAdmin } from '../../_lib/admin-auth';
import { updateOrderDeliveryStatus } from '../../_lib/orders';
import { listDeliveryAssets } from '../../_lib/delivery';
import { GatewayError, checkRateLimit } from '../../_lib/stac';
import { clientIdentity, sendError, setCors, type ApiRequest, type ApiResponse } from '../../_lib/http';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'method not allowed' });
  try {
    checkRateLimit(clientIdentity(req));
    requireAdmin(req);
    const rawId = req.query.id;
    const orderId = Array.isArray(rawId) ? rawId[0] : rawId;
    const status = (req.body as { status?: unknown } | undefined)?.status;
    if (!orderId) return res.status(400).json({ error: 'missing order id' });
    if (status !== 'fulfillment' && status !== 'delivered') throw new GatewayError(400, 'delivery status is invalid');
    if (status === 'delivered' && (await listDeliveryAssets(orderId)).length === 0) {
      throw new GatewayError(409, 'register at least one active delivery asset first');
    }
    return res.status(200).json({ order: await updateOrderDeliveryStatus(orderId, status), persisted: true });
  } catch (error) {
    sendError(res, error);
  }
}
