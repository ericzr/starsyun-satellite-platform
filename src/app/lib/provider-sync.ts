export type ProviderSyncMode = 'health' | 'catalog' | 'prices' | 'availability';
export type ProviderSyncStatus = 'running' | 'succeeded' | 'failed';

export interface ProviderSyncAdapter {
  id: string;
  capabilities: ProviderSyncMode[];
}

export interface ProviderSyncRun {
  id: string;
  providerId: string;
  mode: ProviderSyncMode;
  status: ProviderSyncStatus;
  recordsSeen: number;
  recordsUpserted: number;
  startedAt: string;
  finishedAt?: string;
  nextRunAt?: string;
  errorMessage?: string;
}

export interface ProviderSyncOverview {
  adapters: ProviderSyncAdapter[];
  runs: ProviderSyncRun[];
}

type SyncRow = Record<string, unknown>;

function syncApiError(response: Response) {
  return response
    .json()
    .catch(() => null)
    .then((payload: { error?: string } | null) =>
      new Error(payload?.error || `Provider sync request failed (${response.status})`),
    );
}

function syncRun(row: SyncRow): ProviderSyncRun {
  return {
    id: String(row.id ?? ''),
    providerId: String(row.provider_id ?? row.providerId ?? ''),
    mode: String(row.mode ?? 'health') as ProviderSyncMode,
    status: String(row.status ?? 'failed') as ProviderSyncStatus,
    recordsSeen: Number(row.records_seen ?? row.recordsSeen ?? 0),
    recordsUpserted: Number(row.records_upserted ?? row.recordsUpserted ?? 0),
    startedAt: String(row.started_at ?? row.startedAt ?? ''),
    finishedAt:
      row.finished_at == null && row.finishedAt == null
        ? undefined
        : String(row.finished_at ?? row.finishedAt),
    nextRunAt:
      row.next_run_at == null && row.nextRunAt == null
        ? undefined
        : String(row.next_run_at ?? row.nextRunAt),
    errorMessage:
      row.error_message == null && row.errorMessage == null
        ? undefined
        : String(row.error_message ?? row.errorMessage),
  };
}

export async function loadProviderSyncOverview(): Promise<ProviderSyncOverview> {
  const response = await fetch('/api/admin/provider-sync', { credentials: 'include' });
  if (!response.ok) throw await syncApiError(response);
  const payload = (await response.json()) as {
    adapters?: Array<{ id?: unknown; capabilities?: unknown }>;
    runs?: SyncRow[];
  };
  return {
    adapters: Array.isArray(payload.adapters)
      ? payload.adapters
          .filter((adapter) => typeof adapter.id === 'string')
          .map((adapter) => ({
            id: adapter.id as string,
            capabilities: Array.isArray(adapter.capabilities)
              ? adapter.capabilities.map(String) as ProviderSyncMode[]
              : [],
          }))
      : [],
    runs: Array.isArray(payload.runs) ? payload.runs.map(syncRun) : [],
  };
}

export async function startProviderSync(providerId: string, mode: ProviderSyncMode) {
  const response = await fetch('/api/admin/provider-sync', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providerId, mode }),
  });
  if (!response.ok) throw await syncApiError(response);
  const payload = (await response.json()) as { run?: SyncRow };
  if (!payload.run) throw new Error('Provider sync API returned no run');
  return syncRun(payload.run);
}
