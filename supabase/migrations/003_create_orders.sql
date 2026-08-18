create table if not exists public.orders (
  id uuid primary key,
  order_no text not null unique,
  quote_id uuid not null unique references public.quotes(id) on delete restrict,
  quote_no text not null,
  inquiry_id uuid not null references public.inquiries(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  currency text not null check (currency in ('CNY', 'USD', 'EUR', 'AED')),
  subtotal numeric not null check (subtotal >= 0),
  tax_amount numeric not null default 0 check (tax_amount >= 0),
  total numeric not null check (total >= 0),
  delivery_days integer not null check (delivery_days between 1 and 365),
  status text not null default 'pending_payment' check (status in ('pending_payment', 'paid', 'fulfillment', 'delivered', 'cancelled')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'processing', 'paid', 'refunded', 'failed')),
  payment_provider text check (payment_provider in ('stripe')),
  payment_intent_id text,
  payment_client_secret text,
  payment_created_at timestamptz,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  delivered_at timestamptz
);

create index if not exists orders_user_idx on public.orders (user_id, created_at desc);
create index if not exists orders_status_idx on public.orders (status, created_at desc);
create unique index if not exists orders_payment_intent_idx on public.orders (payment_intent_id) where payment_intent_id is not null;

alter table public.orders enable row level security;

comment on table public.orders is 'Frozen commercial orders created idempotently from accepted quotes.';
