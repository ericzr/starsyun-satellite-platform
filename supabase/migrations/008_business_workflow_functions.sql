-- Atomic helpers for wallet accounting, payment event idempotency and order transitions.
-- These functions are called only by the server-side service key through Supabase RPC.

alter table public.orders
  drop constraint if exists orders_payment_provider_check;
alter table public.orders
  add constraint orders_payment_provider_check
  check (payment_provider is null or payment_provider in ('stripe', 'alipay', 'paypal', 'payple', 'bank-transfer', 'wallet'));

alter table public.payment_events
  drop constraint if exists payment_events_provider_check;
alter table public.payment_events
  add constraint payment_events_provider_check
  check (provider in ('stripe', 'alipay', 'paypal', 'payple', 'bank-transfer', 'wallet'));

create or replace function public.wallet_available_balance(p_wallet_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(
    case
      when direction in ('credit', 'release', 'refund') and status = 'posted' then amount
      when direction in ('debit', 'hold') and status = 'posted' then -amount
      else 0
    end
  ), 0)
  from public.wallet_transactions
  where wallet_id = p_wallet_id;
$$;

create or replace function public.record_wallet_transaction(
  p_wallet_id uuid,
  p_direction text,
  p_amount numeric,
  p_currency text,
  p_reference_type text,
  p_reference_id text,
  p_idempotency_key text,
  p_status text default 'posted',
  p_provider text default null,
  p_provider_transaction_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns setof public.wallet_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  wallet public.wallet_accounts;
  existing public.wallet_transactions;
  available numeric;
begin
  select * into wallet from public.wallet_accounts where id = p_wallet_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'wallet account not found';
  end if;
  if wallet.currency <> p_currency then
    raise exception using errcode = 'P0001', message = 'wallet currency does not match the operation';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception using errcode = '22023', message = 'wallet amount must be positive';
  end if;

  select * into existing
  from public.wallet_transactions
  where idempotency_key = p_idempotency_key
  limit 1;
  if found then
    if existing.wallet_id <> p_wallet_id
      or existing.direction <> p_direction
      or existing.amount <> p_amount
      or existing.currency <> p_currency
      or existing.status <> p_status
      or existing.reference_type <> p_reference_type
      or existing.reference_id <> p_reference_id then
      raise exception using errcode = 'P0001', message = 'idempotency key does not match the wallet operation';
    end if;
    return next existing;
    return;
  end if;

  if p_direction in ('hold', 'debit') and p_status = 'posted' then
    available := public.wallet_available_balance(p_wallet_id);
    if available < p_amount then
      raise exception using errcode = 'P0001', message = 'wallet balance is insufficient';
    end if;
  end if;

  return query
  insert into public.wallet_transactions (
    id, wallet_id, direction, amount, currency, status, reference_type, reference_id,
    idempotency_key, provider, provider_transaction_id, metadata, posted_at
  ) values (
    gen_random_uuid(), p_wallet_id, p_direction, p_amount, p_currency, p_status,
    p_reference_type, p_reference_id, p_idempotency_key, p_provider,
    p_provider_transaction_id, coalesce(p_metadata, '{}'::jsonb),
    case when p_status = 'posted' then now() else null end
  )
  returning *;
exception
  when unique_violation then
    return query select * from public.wallet_transactions where idempotency_key = p_idempotency_key limit 1;
end;
$$;

create or replace function public.hold_order_from_wallet(
  p_order_id uuid,
  p_user_id uuid,
  p_amount numeric,
  p_currency text,
  p_idempotency_key text,
  p_request_id text default null
)
returns setof public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  current_order public.orders;
  wallet public.wallet_accounts;
  existing public.wallet_transactions;
  available numeric;
  transaction_id uuid;
  changed public.orders;
begin
  select * into current_order
  from public.orders
  where id = p_order_id and user_id = p_user_id
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'order not found'; end if;
  if current_order.status <> 'pending_payment' then
    if current_order.status = 'paid' and current_order.payment_provider = 'wallet' then
      -- A retry is only idempotent when it presents the original key. A new
      -- key must never make an already-paid order appear successfully held.
      select * into wallet from public.wallet_accounts
      where user_id = p_user_id and currency = p_currency and status = 'active'
      for update;
      if not found then raise exception using errcode = 'P0002', message = 'wallet account not found'; end if;
      select * into existing from public.wallet_transactions
      where idempotency_key = p_idempotency_key limit 1;
      if not found then raise exception using errcode = 'P0001', message = 'order is already paid'; end if;
      if existing.wallet_id <> wallet.id
        or existing.direction <> 'hold'
        or existing.status <> 'posted'
        or existing.reference_type <> 'order'
        or existing.reference_id <> p_order_id::text
        or existing.currency <> p_currency
        or abs(existing.amount - p_amount) > 0.01 then
        raise exception using errcode = 'P0001', message = 'idempotency key does not match the wallet hold';
      end if;
      return next current_order;
      return;
    end if;
    raise exception using errcode = 'P0001', message = 'order is not awaiting a wallet hold';
  end if;
  if current_order.currency <> p_currency or abs(current_order.total - p_amount) > 0.01 then
    raise exception using errcode = 'P0001', message = 'hold does not match the order total';
  end if;

  select * into wallet from public.wallet_accounts
  where user_id = p_user_id and currency = p_currency and status = 'active'
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'wallet account not found'; end if;

  select * into existing from public.wallet_transactions
  where idempotency_key = p_idempotency_key limit 1;
  if found then
    if existing.wallet_id <> wallet.id
      or existing.direction <> 'hold'
      or existing.status <> 'posted'
      or existing.reference_type <> 'order'
      or existing.reference_id <> p_order_id::text
      or existing.currency <> p_currency
      or abs(existing.amount - p_amount) > 0.01 then
      raise exception using errcode = 'P0001', message = 'idempotency key does not match the wallet hold';
    end if;
    update public.orders
    set status = 'paid', payment_status = 'paid', payment_provider = 'wallet',
        payment_intent_id = coalesce(payment_intent_id, 'wallet:' || existing.id::text),
        payment_created_at = coalesce(payment_created_at, now()), paid_at = coalesce(paid_at, now())
    where id = p_order_id
    returning * into changed;
    return next changed;
    return;
  end if;

  available := public.wallet_available_balance(wallet.id);
  if available < p_amount then raise exception using errcode = 'P0001', message = 'wallet balance is insufficient'; end if;
  insert into public.wallet_transactions (
    id, wallet_id, direction, amount, currency, status, reference_type, reference_id,
    idempotency_key, provider, provider_transaction_id, metadata, posted_at
  ) values (
    gen_random_uuid(), wallet.id, 'hold', p_amount, p_currency, 'posted', 'order', p_order_id::text,
    p_idempotency_key, 'wallet', null, jsonb_build_object('requestId', p_request_id), now()
  ) returning id into transaction_id;
  update public.orders
  set status = 'paid', payment_status = 'paid', payment_provider = 'wallet',
      payment_intent_id = 'wallet:' || transaction_id::text, payment_created_at = now(), paid_at = now()
  where id = p_order_id
  returning * into changed;
  insert into public.order_events (id, order_id, event_type, from_status, to_status, actor_type, actor_id, request_id, payload)
  values (gen_random_uuid(), p_order_id, 'wallet_payment_captured', 'pending_payment', 'paid', 'customer', p_user_id::text, p_request_id, jsonb_build_object('transactionId', transaction_id));
  return next changed;
end;
$$;

create or replace function public.record_payment_event(
  p_order_id uuid,
  p_provider text,
  p_provider_event_id text,
  p_event_type text,
  p_status text,
  p_amount numeric default null,
  p_currency text default null,
  p_payload jsonb default '{}'::jsonb
)
returns setof public.payment_events
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.payment_events;
begin
  select * into existing
  from public.payment_events
  where provider = p_provider and provider_event_id = p_provider_event_id
  limit 1;
  if found then
    return next existing;
    return;
  end if;

  return query
  insert into public.payment_events (
    id, order_id, provider, provider_event_id, event_type, status, amount, currency, payload, processed_at
  ) values (
    gen_random_uuid(), p_order_id, p_provider, p_provider_event_id, p_event_type, p_status,
    p_amount, p_currency, coalesce(p_payload, '{}'::jsonb),
    case when p_status = 'processed' then now() else null end
  )
  returning *;
exception
  when unique_violation then
    return query select * from public.payment_events
      where provider = p_provider and provider_event_id = p_provider_event_id limit 1;
end;
$$;

create or replace function public.transition_order(
  p_order_id uuid,
  p_to_status text,
  p_actor_type text,
  p_actor_id text default null,
  p_request_id text default null,
  p_payload jsonb default '{}'::jsonb
)
returns setof public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  current_order public.orders;
  changed public.orders;
begin
  select * into current_order from public.orders where id = p_order_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'order not found'; end if;
  if current_order.status = p_to_status then
    return next current_order;
    return;
  end if;
  if p_to_status in ('fulfillment', 'delivered') and current_order.payment_status <> 'paid' then
    raise exception using errcode = 'P0001', message = 'order payment is not settled';
  end if;
  if not (
    (current_order.status = 'pending_payment' and p_to_status in ('paid', 'cancelled')) or
    (current_order.status = 'paid' and p_to_status in ('fulfillment', 'cancelled')) or
    (current_order.status = 'fulfillment' and p_to_status in ('delivered', 'cancelled'))
  ) then
    raise exception using errcode = 'P0001', message = 'invalid order status transition';
  end if;
  update public.orders
  set status = p_to_status,
      payment_status = case when p_to_status = 'paid' then 'paid' else payment_status end,
      paid_at = case when p_to_status = 'paid' then coalesce(paid_at, now()) else paid_at end,
      delivered_at = case when p_to_status = 'delivered' then coalesce(delivered_at, now()) else delivered_at end
  where id = p_order_id
  returning * into changed;
  insert into public.order_events (id, order_id, event_type, from_status, to_status, actor_type, actor_id, request_id, payload)
  values (gen_random_uuid(), p_order_id, 'status_changed', current_order.status, p_to_status, p_actor_type, p_actor_id, p_request_id, coalesce(p_payload, '{}'::jsonb));
  return next changed;
end;
$$;

create index if not exists payment_events_provider_event_idx
  on public.payment_events (provider, provider_event_id);

comment on function public.record_wallet_transaction is 'Idempotent wallet ledger write with an atomic insufficient-balance check.';
comment on function public.record_payment_event is 'Idempotent verified payment event insert.';
comment on function public.transition_order is 'Validated order transition with an append-only order event.';

-- These are privileged server functions. PostgREST must not expose them to browser roles.
revoke all on function public.wallet_available_balance(uuid) from public, anon, authenticated;
revoke all on function public.record_wallet_transaction(uuid, text, numeric, text, text, text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.record_payment_event(uuid, text, text, text, text, numeric, text, jsonb) from public, anon, authenticated;
revoke all on function public.transition_order(uuid, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.hold_order_from_wallet(uuid, uuid, numeric, text, text, text) from public, anon, authenticated;
grant execute on function public.wallet_available_balance(uuid) to service_role;
grant execute on function public.record_wallet_transaction(uuid, text, numeric, text, text, text, text, text, text, text, jsonb) to service_role;
grant execute on function public.record_payment_event(uuid, text, text, text, text, numeric, text, jsonb) to service_role;
grant execute on function public.transition_order(uuid, text, text, text, text, jsonb) to service_role;
grant execute on function public.hold_order_from_wallet(uuid, uuid, numeric, text, text, text) to service_role;
