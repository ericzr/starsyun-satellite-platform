import { requireAdmin } from '../_lib/admin-auth';
import { parseWalletOperation, recordWalletOperation } from '../_lib/wallet';
import { checkRateLimit } from '../_lib/stac';
import { clientIdentity, sendError, setCors, type ApiRequest, type ApiResponse } from '../_lib/http';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  try {
    checkRateLimit(clientIdentity(req));
    const admin = requireAdmin(req);
    const input = parseWalletOperation(req.body);
    if (input.direction !== 'credit' || input.referenceType !== 'payment') return res.status(400).json({ error: 'only payment credits are supported here' });
    if (!input.provider || !input.providerTransactionId) return res.status(400).json({ error: 'provider transaction details are required' });
    const rawUserId = (req.body as Record<string, unknown> | undefined)?.userId;
    if (typeof rawUserId !== 'string') return res.status(400).json({ error: 'userId is required' });
    const result = await recordWalletOperation(rawUserId, { ...input, metadata: { ...(input.metadata ?? {}), reconciledBy: admin.email } });
    return res.status(201).json({ ...result, persisted: true });
  } catch (error) {
    sendError(res, error);
  }
}
