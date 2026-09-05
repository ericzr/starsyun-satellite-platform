-- Public-source downloads are not commercial orders: the upstream provider
-- performs the actual transfer and may require its own account or terms.
-- Keep a customer-owned audit trail without fabricating a payment, quote, or
-- delivery status in the commercial order workflow.
create table if not exists public.public_downloads (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete restrict,
  product_id text not null,
  product_code text not null,
  product_name text not null,
  provider text not null default '',
  file_format text not null default '',
  source_url text not null,
  requested_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (source_url ~* '^https?://')
);

create index if not exists public_downloads_user_requested_idx
  on public.public_downloads (user_id, requested_at desc);
create index if not exists public_downloads_product_idx
  on public.public_downloads (product_id, requested_at desc);

alter table public.public_downloads enable row level security;

comment on table public.public_downloads is
  'Audit trail for an authenticated customer requesting an externally hosted public-data download. It is intentionally separate from paid orders.';
