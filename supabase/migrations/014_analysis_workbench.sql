-- Analysis workbench metadata. Binary inputs/outputs remain in private COS;
-- Supabase stores only specifications, provenance, quality checks and indexes.

create table if not exists public.analysis_workspaces (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete restrict,
  title text not null default 'Untitled analysis',
  template text not null check (template in ('change-detection', 'land-cover', 'feature-extraction', 'time-series', 'custom-analysis')),
  input_spec jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists analysis_workspaces_user_idx
  on public.analysis_workspaces (user_id, updated_at desc);
alter table public.analysis_workspaces enable row level security;
comment on table public.analysis_workspaces is 'Saved customer analysis workspace specifications; imagery and results are stored in private COS.';

alter table public.analysis_jobs
  add column if not exists workspace_id uuid references public.analysis_workspaces(id) on delete restrict;
alter table public.analysis_jobs
  add column if not exists recipe_key text;
alter table public.analysis_jobs
  add column if not exists requested_locale text not null default 'en';
create index if not exists analysis_jobs_workspace_idx
  on public.analysis_jobs (workspace_id, created_at desc);

create table if not exists public.analysis_job_steps (
  id uuid primary key,
  job_id uuid not null references public.analysis_jobs(id) on delete cascade,
  step_key text not null check (step_key in ('validate-input', 'prepare-data', 'run-analysis', 'quality-check', 'compose-report', 'publish-delivery')),
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'skipped')),
  attempt integer not null default 0 check (attempt >= 0),
  started_at timestamptz,
  finished_at timestamptz,
  metrics jsonb not null default '{}'::jsonb,
  error_message text,
  unique (job_id, step_key)
);
create index if not exists analysis_job_steps_job_idx
  on public.analysis_job_steps (job_id, step_key);
alter table public.analysis_job_steps enable row level security;

create table if not exists public.analysis_model_runs (
  id uuid primary key,
  job_id uuid not null references public.analysis_jobs(id) on delete cascade,
  step_key text not null,
  model_family text not null,
  model_name text not null,
  model_version text not null,
  weights_sha256 text,
  parameters jsonb not null default '{}'::jsonb,
  input_sha256 text,
  output_sha256 text,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  metrics jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error_message text
);
create index if not exists analysis_model_runs_job_idx
  on public.analysis_model_runs (job_id, started_at desc);
alter table public.analysis_model_runs enable row level security;
comment on table public.analysis_model_runs is 'Immutable model provenance and metrics for reproducible analysis delivery.';

create table if not exists public.analysis_quality_checks (
  id uuid primary key,
  job_id uuid not null references public.analysis_jobs(id) on delete cascade,
  check_key text not null,
  status text not null check (status in ('passed', 'warning', 'failed')),
  score numeric,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (job_id, check_key)
);
create index if not exists analysis_quality_checks_job_idx
  on public.analysis_quality_checks (job_id, created_at desc);
alter table public.analysis_quality_checks enable row level security;

create table if not exists public.analysis_artifacts (
  id uuid primary key,
  job_id uuid not null references public.analysis_jobs(id) on delete cascade,
  artifact_type text not null check (artifact_type in ('preview-image', 'cog-geotiff', 'geojson', 'csv', 'report-pdf', 'report-html', 'processing-log', 'json-result')),
  bucket text not null,
  object_key text not null,
  file_name text not null,
  content_type text not null,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  sha256 text,
  version integer not null default 1 check (version > 0),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (job_id, artifact_type, version)
);
create index if not exists analysis_artifacts_job_idx
  on public.analysis_artifacts (job_id, created_at desc);
alter table public.analysis_artifacts enable row level security;
comment on table public.analysis_artifacts is 'Metadata for private COS analysis outputs; the API signs access only after job authorization.';

create table if not exists public.analysis_reports (
  id uuid primary key,
  job_id uuid not null references public.analysis_jobs(id) on delete cascade,
  locale text not null default 'en',
  version integer not null default 1 check (version > 0),
  status text not null default 'draft' check (status in ('draft', 'review', 'approved', 'delivered')),
  generated_by text not null check (generated_by in ('rules', 'multimodal-model', 'human')),
  report_artifact_id uuid references public.analysis_artifacts(id) on delete restrict,
  summary text,
  created_at timestamptz not null default now(),
  approved_by text,
  approved_at timestamptz,
  unique (job_id, locale, version)
);
create index if not exists analysis_reports_job_idx
  on public.analysis_reports (job_id, locale, version desc);
alter table public.analysis_reports enable row level security;
comment on table public.analysis_reports is 'Versioned reports whose narrative must be grounded in deterministic analysis outputs and QA results.';
