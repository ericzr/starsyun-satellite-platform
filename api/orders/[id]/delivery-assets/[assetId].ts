import { requireAdmin } from '../../../_lib/admin-auth';
import { revokeDeliveryAsset } from '../../../_lib/delivery';
import { GatewayError, checkRateLimit } from '../../../_lib/stac';
import { clientIdentity, sendError, setCors, type ApiRequest, type ApiResponse } from '../../../_lib/http';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'method not allowed' });
  try {
    checkRateLimit(clientIdentity(req));
    requireAdmin(req);
    const rawOrderId = req.query.id;
    const rawAssetId = req.query.assetId;
    const orderId = Array.isArray(rawOrderId) ? rawOrderId[0] : rawOrderId;
    const assetId = Array.isArray(rawAssetId) ? rawAssetId[0] : rawAssetId;
    if (!orderId || !assetId) throw new GatewayError(400, 'missing delivery asset id');
    return res.status(200).json({ asset: await revokeDeliveryAsset(orderId, assetId), persisted: true });
  } catch (error) {
    sendError(res, error);
  }
}
