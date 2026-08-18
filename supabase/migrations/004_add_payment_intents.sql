alter table public.orders
  add column if not exists payment_provider text,
  add column if not exists payment_intent_id text,
  add column if not exists payment_client_secret text,
  add column if not exists payment_created_at timestamptz;

alter table public.orders
  drop constraint if exists orders_payment_provider_check;

alter table public.orders
  add constraint orders_payment_provider_check check (payment_provider is null or payment_provider in ('stripe'));

create unique index if not exists orders_payment_intent_idx on public.orders (payment_intent_id) where payment_intent_id is not null;
