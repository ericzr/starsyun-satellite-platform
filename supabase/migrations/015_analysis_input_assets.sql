-- Metadata for customer-owned imagery uploaded to private Tencent COS.
-- The binary object never enters Supabase; this table is the authorization,
-- integrity and processing hand-off record for the analysis worker.
alter table public.analysis_jobs
  add column if not exists user_id uuid references auth.users(id) on delete restrict;
create index if not exists analysis_jobs_user_idx
  on public.analysis_jobs (user_id, created_at desc);

create table if not exists public.analysis_input_assets (
  id uuid primary key,
  job_id uuid not null references public.analysis_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  bucket text not null,
  object_key text not null unique,
  file_name text not null,
  content_type text not null,
  expected_size_bytes bigint check (expected_size_bytes is null or expected_size_bytes > 0),
  size_bytes bigint check (size_bytes is null or size_bytes > 0),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending', 'ready', 'revoked')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  revoked_at timestamptz
);
create index if not exists analysis_input_assets_job_idx
  on public.analysis_input_assets (job_id, created_at asc);
create index if not exists analysis_input_assets_user_idx
  on public.analysis_input_assets (user_id, created_at desc);
alter table public.analysis_input_assets enable row level security;
comment on table public.analysis_input_assets is 'Authorization and integrity metadata for private customer-owned imagery in Tencent COS.';
