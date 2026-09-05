import { requireAdmin } from '../../_lib/admin-auth';
import { updateProviderQuote, type ProviderQuoteStatus } from '../../_lib/provider-workflow';
import { checkRateLimit } from '../../_lib/stac';
import { clientIdentity, sendError, setCors, type ApiRequest, type ApiResponse } from '../../_lib/http';

const statuses: ProviderQuoteStatus[] = ['requested', 'quoted', 'expired', 'accepted', 'rejected', 'cancelled', 'failed'];

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
    if (!id) return res.status(400).json({ error: 'missing provider quote id' });
    if (!statuses.includes(body.status as ProviderQuoteStatus)) return res.status(400).json({ error: 'status is invalid' });
    const amount = body.amount == null || body.amount === '' ? undefined : Number(body.amount);
    if (amount !== undefined && (!Number.isFinite(amount) || amount < 0)) return res.status(400).json({ error: 'amount is invalid' });
    const result = await updateProviderQuote(id, body.status as ProviderQuoteStatus, {
      amount,
      currency: typeof body.currency === 'string' ? body.currency : undefined,
      externalQuoteId: typeof body.externalQuoteId === 'string' ? body.externalQuoteId : undefined,
      validUntil: typeof body.validUntil === 'string' ? body.validUntil : undefined,
      termsVersion: typeof body.termsVersion === 'string' ? body.termsVersion : undefined,
      responsePayload: body.responsePayload && typeof body.responsePayload === 'object' && !Array.isArray(body.responsePayload) ? body.responsePayload as Record<string, unknown> : undefined,
      lastError: typeof body.lastError === 'string' ? body.lastError : undefined,
    });
    return res.status(200).json({ providerQuote: result, persisted: true });
  } catch (error) {
    sendError(res, error);
  }
}
