create table if not exists public.inquiries (
  id uuid primary key,
  code text not null unique,
  type text not null check (type in ('history', 'tasking', 'analysis')),
  name text not null,
  phone text not null,
  email text not null default '',
  company text not null,
  region text not null default '',
  usage text not null default '',
  expect_date text not null default '',
  expect_res text not null default '',
  note text not null default '',
  product_name text,
  ref_price numeric not null default 0 check (ref_price >= 0),
  area_km2 numeric not null default 0 check (area_km2 >= 0),
  status text not null default 'submitted' check (status in ('submitted', 'pending', 'quoting', 'quoted', 'confirmed')),
  assignee text not null default '',
  created_at timestamptz not null default now()
);

alter table public.inquiries add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists inquiries_created_at_idx on public.inquiries (created_at desc);
create index if not exists inquiries_status_idx on public.inquiries (status);
create index if not exists inquiries_user_id_idx on public.inquiries (user_id, created_at desc);

alter table public.inquiries enable row level security;

comment on table public.inquiries is 'StarSyun customer inquiries; writes are performed by the server-side service role.';
