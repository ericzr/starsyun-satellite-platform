create table if not exists public.delivery_assets (
  id uuid primary key,
  order_id uuid not null references public.orders(id) on delete restrict,
  object_key text not null,
  bucket text not null default 'starsyun-delivery',
  file_name text not null,
  content_type text not null default 'application/octet-stream',
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  version integer not null default 1 check (version > 0),
  created_by text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists delivery_assets_order_idx
  on public.delivery_assets (order_id, created_at desc);

create unique index if not exists delivery_assets_object_idx
  on public.delivery_assets (bucket, object_key, version);

alter table public.delivery_assets enable row level security;

comment on table public.delivery_assets is 'Metadata for private COS delivery objects. Binary files never live in Supabase.';
comment on column public.delivery_assets.object_key is 'Private COS object key; never expose directly to customers.';
