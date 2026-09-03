import { requireAdmin } from '../../_lib/admin-auth';
import { requireCustomer, setCustomerCookies } from '../../_lib/customer-auth';
import { createDeliveryAsset, listDeliveryAssets, parseDeliveryAssetInput } from '../../_lib/delivery';
import { getCustomerOrder, getOrderById } from '../../_lib/orders';
import { GatewayError, checkRateLimit } from '../../_lib/stac';
import { clientIdentity, sendError, setCors, type ApiRequest, type ApiResponse } from '../../_lib/http';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  try {
    checkRateLimit(clientIdentity(req));
    const rawId = req.query.id; const orderId = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!orderId) return res.status(400).json({ error: 'missing order id' });
    // Creating delivery metadata is an administrator-only operation. Do not
    // fall through to the customer branch for POST, even when admin auth is
    // temporarily unconfigured.
    if (req.method === 'POST') {
      const admin = requireAdmin(req);
      const order = await getOrderById(orderId);
      if (!order) return res.status(404).json({ error: 'order not found' });
      if (order.status === 'pending_payment' || order.status === 'cancelled') {
        throw new GatewayError(409, 'order is not eligible for delivery assets');
      }
      return res.status(201).json({ asset: await createDeliveryAsset(orderId, parseDeliveryAssetInput(req.body), admin.email), persisted: true });
    }
    let adminEmail: string | undefined;
    try { adminEmail = requireAdmin(req).email; } catch (error) {
      if (!(error instanceof GatewayError) || (error.status !== 401 && error.status !== 503)) throw error;
    }
    if (adminEmail) {
      return res.status(200).json({ assets: await listDeliveryAssets(orderId, true), source: 'supabase' });
    }
    const session = await requireCustomer(req);
    if (session.refreshed) setCustomerCookies(res, session.refreshed.accessToken, session.refreshed.refreshToken);
    const order = await getCustomerOrder(orderId, session.user.id);
    if (!order) return res.status(404).json({ error: 'order not found' });
    if (order.status !== 'delivered') return res.status(200).json({ assets: [], source: 'supabase' });
    return res.status(200).json({ assets: await listDeliveryAssets(orderId), source: 'supabase' });
  } catch (error) { sendError(res, error); }
}
