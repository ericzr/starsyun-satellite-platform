-- Normalize the historical "payple" typo without rewriting applied migrations.
-- Run after 010_create_public_downloads.sql.

begin;

update public.orders
set payment_provider = 'paypal'
where payment_provider = 'payple';

update public.payment_events
set provider = 'paypal'
where provider = 'payple';

alter table public.orders
  drop constraint if exists orders_payment_provider_check;
alter table public.orders
  add constraint orders_payment_provider_check
  check (payment_provider is null or payment_provider in ('stripe', 'alipay', 'paypal', 'bank-transfer', 'wallet'));

alter table public.payment_events
  drop constraint if exists payment_events_provider_check;
alter table public.payment_events
  add constraint payment_events_provider_check
  check (provider in ('stripe', 'alipay', 'paypal', 'bank-transfer', 'wallet'));

commit;
