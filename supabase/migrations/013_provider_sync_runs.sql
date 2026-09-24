-- Provider adapter and catalog synchronization audit trail.
-- A run records what was attempted and never implies that a provider is sellable.
create table if not exists public.provider_sync_runs (
  id uuid primary key,
  provider_id text not null references public.data_sources(id) on delete restrict,
  mode text not null check (mode in ('health', 'catalog', 'prices', 'availability')),
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed', 'skipped')),
  request_payload jsonb not null default '{}'::jsonb,
  result_summary jsonb not null default '{}'::jsonb,
  records_seen integer not null default 0 check (records_seen >= 0),
  records_upserted integer not null default 0 check (records_upserted >= 0),
  error_code text,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists provider_sync_runs_provider_idx
  on public.provider_sync_runs (provider_id, started_at desc);
create index if not exists provider_sync_runs_status_idx
  on public.provider_sync_runs (status, next_run_at);
alter table public.provider_sync_runs enable row level security;
comment on table public.provider_sync_runs is 'Audited provider health/catalog synchronization attempts; it does not grant sale or download authorization.';
