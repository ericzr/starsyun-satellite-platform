-- Keep accepted-quote orders auditable even when no provider product has been
-- selected yet. The snapshot is intentionally immutable and records exactly
-- what the customer accepted at order creation time.
do $$
declare
  constraint_name text;
begin
  -- Inline PostgreSQL checks receive generated names that vary by version;
  -- identify the two relevant checks by their definitions before replacing.
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where ns.nspname = 'public'
      and rel.relname = 'order_items'
      and con.contype = 'c'
      and (pg_get_constraintdef(con.oid) like '%item_type%'
        or pg_get_constraintdef(con.oid) like '%provider_product_id%')
  loop
    execute format('alter table public.order_items drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.order_items
  add constraint order_items_item_type_check
  check (item_type in ('archive', 'tasking', 'analysis', 'delivery-fee', 'quote'));

alter table public.order_items
  add constraint order_items_provider_check
  check (provider_product_id is not null or provider_id is not null or item_type in ('delivery-fee', 'quote'));
