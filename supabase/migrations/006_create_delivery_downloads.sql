create table if not exists public.delivery_downloads (
  id uuid primary key,
  delivery_asset_id uuid not null references public.delivery_assets(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  request_id text,
  constraint delivery_downloads_expiry_check check (expires_at > issued_at)
);

create index if not exists delivery_downloads_asset_idx
  on public.delivery_downloads (delivery_asset_id, issued_at desc);

create index if not exists delivery_downloads_user_idx
  on public.delivery_downloads (user_id, issued_at desc);

alter table public.delivery_downloads enable row level security;

comment on table public.delivery_downloads is 'Audit trail for signed delivery URL issuance.';
