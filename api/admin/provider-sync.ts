import { requireAdmin } from '../_lib/admin-auth';
import { getProviderAdapter, listProviderAdapters, runProviderSync, type SyncMode } from '../_lib/provider-adapters';
import { persistenceConfig } from '../_lib/inquiries';
import { supabaseApiHeaders } from '../_lib/supabase';
import { checkRateLimit } from '../_lib/stac';
import { clientIdentity, sendError, setCors, type ApiRequest, type ApiResponse } from '../_lib/http';

const modes: SyncMode[] = ['health', 'catalog', 'prices', 'availability'];
function text(value: unknown, field: string) { if (typeof value !== 'string' || !/^[A-Za-z0-9._-]{2,80}$/.test(value)) throw Object.assign(new Error(`${field} is invalid`), { status: 400 }); return value; }
function input(body: unknown) {
  const value = (body ?? {}) as Record<string, unknown>;
  const providerId = text(value.providerId, 'providerId');
  const mode = value.mode == null ? 'health' : value.mode;
  if (!modes.includes(mode as SyncMode)) throw Object.assign(new Error('mode is invalid'), { status: 400 });
  const bbox = value.bbox == null ? undefined : value.bbox;
  if (bbox !== undefined && (!Array.isArray(bbox) || bbox.length !== 4 || bbox.some((part) => !Number.isFinite(Number(part))))) throw Object.assign(new Error('bbox is invalid'), { status: 400 });
  const cloudCoverMax = value.cloudCoverMax == null ? undefined : Number(value.cloudCoverMax);
  if (cloudCoverMax !== undefined && (!Number.isFinite(cloudCoverMax) || cloudCoverMax < 0 || cloudCoverMax > 100)) throw Object.assign(new Error('cloudCoverMax is invalid'), { status: 400 });
  const limit = value.limit == null ? undefined : Number(value.limit);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) throw Object.assign(new Error('limit is invalid'), { status: 400 });
  return { providerId, mode: mode as SyncMode, bbox: bbox?.map(Number) as [number, number, number, number] | undefined, datetime: typeof value.datetime === 'string' ? value.datetime : undefined, cloudCoverMax, limit };
}
async function rest(path: string, init: RequestInit = {}) {
  const { url, key } = persistenceConfig();
  let response: Response;
  try {
    response = await fetch(`${url}/rest/v1/${path}`, {
      ...init,
      headers: { ...supabaseApiHeaders(key), Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw Object.assign(new Error('sync persistence unavailable'), { status: 502 });
  }
  if (!response.ok) throw Object.assign(new Error(`sync persistence failed (${response.status})`), { status: 502 });
  return response;
}
function isInternalSyncRequest(req: ApiRequest) {
  const configured = process.env.PROVIDER_SYNC_TOKEN?.trim();
  const supplied = req.headers['x-provider-sync-token'];
  const token = Array.isArray(supplied) ? supplied[0] : supplied;
  return Boolean(configured && token && token === configured);
}
export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCors(req, res); if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  try {
    checkRateLimit(clientIdentity(req)); if (!isInternalSyncRequest(req)) requireAdmin(req);
    if (req.method === 'GET') {
      const response = await rest('provider_sync_runs?select=*&order=started_at.desc&limit=100');
      return res.status(200).json({ adapters: listProviderAdapters(), runs: await response.json() });
    }
    const syncInput = input(req.body); getProviderAdapter(syncInput.providerId);
    const id = crypto.randomUUID(); const startedAt = new Date().toISOString();
    await rest('provider_sync_runs', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ id, provider_id: syncInput.providerId, mode: syncInput.mode, status: 'running', request_payload: syncInput, started_at: startedAt }) });
    try {
      const result = await runProviderSync(syncInput);
      const finishedAt = new Date().toISOString();
      const nextRunAt = new Date(Date.parse(finishedAt) + (syncInput.mode === 'health' ? 5 * 60_000 : 24 * 60 * 60_000)).toISOString();
      await rest(`provider_sync_runs?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ status: 'succeeded', result_summary: result.summary, records_seen: result.recordsSeen, records_upserted: result.recordsUpserted, finished_at: finishedAt, next_run_at: nextRunAt }) });
      return res.status(200).json({ run: { id, providerId: syncInput.providerId, mode: syncInput.mode, status: 'succeeded', ...result } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'provider sync failed';
      await rest(`provider_sync_runs?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ status: 'failed', error_code: 'adapter_error', error_message: message.slice(0, 500), finished_at: new Date().toISOString() }) }).catch(() => undefined);
      throw error;
    }
  } catch (error) { sendError(res, error); }
}
