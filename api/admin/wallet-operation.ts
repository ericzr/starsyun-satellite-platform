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
    if (!['debit', 'release', 'refund'].includes(input.direction)) return res.status(400).json({ error: 'only debit, release and refund are supported here' });
    if (input.direction === 'release' && input.referenceType !== 'order') return res.status(400).json({ error: 'release must reference an order' });
    if (input.direction === 'refund' && input.referenceType !== 'refund') return res.status(400).json({ error: 'refund must reference a refund' });
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.userId !== 'string') return res.status(400).json({ error: 'userId is required' });
    const result = await recordWalletOperation(body.userId, { ...input, metadata: { ...(input.metadata ?? {}), reconciledBy: admin.email } });
    return res.status(201).json({ ...result, persisted: true });
  } catch (error) {
    sendError(res, error);
  }
}
