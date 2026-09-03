import { requireCustomer, setCustomerCookies } from '../../../../_lib/customer-auth';
import { getDeliveryAsset, issueDeliveryDownload } from '../../../../_lib/delivery';
import { getCustomerOrder } from '../../../../_lib/orders';
import { GatewayError, checkRateLimit } from '../../../../_lib/stac';
import { clientIdentity, sendError, setCors, type ApiRequest, type ApiResponse } from '../../../../_lib/http';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });
  try {
    checkRateLimit(clientIdentity(req));
    const rawOrderId = req.query.id; const orderId = Array.isArray(rawOrderId) ? rawOrderId[0] : rawOrderId;
    const rawAssetId = req.query.assetId; const assetId = Array.isArray(rawAssetId) ? rawAssetId[0] : rawAssetId;
    if (!orderId || !assetId) return res.status(400).json({ error: 'missing delivery asset id' });
    const session = await requireCustomer(req);
    if (session.refreshed) setCustomerCookies(res, session.refreshed.accessToken, session.refreshed.refreshToken);
    const order = await getCustomerOrder(orderId, session.user.id);
    if (!order) return res.status(404).json({ error: 'order not found' });
    if (order.status !== 'delivered') throw new GatewayError(409, 'order is not ready for download');
    const asset = await getDeliveryAsset(orderId, assetId);
    if (!asset || asset.revokedAt) return res.status(404).json({ error: 'delivery asset not found' });
    const requestId = Array.isArray(req.headers['x-request-id']) ? req.headers['x-request-id'][0] : req.headers['x-request-id'];
    const signed = await issueDeliveryDownload(asset, orderId, session.user.id, requestId);
    res.status(302).setHeader('Location', signed.url); res.setHeader('Cache-Control', 'no-store'); res.end();
  } catch (error) { sendError(res, error); }
}
