create table if not exists public.quotes (
  id uuid primary key,
  quote_no text not null unique,
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  version integer not null check (version > 0),
  currency text not null check (currency in ('CNY', 'USD', 'EUR', 'AED')),
  subtotal numeric not null check (subtotal >= 0),
  tax_rate numeric not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  tax_amount numeric not null default 0 check (tax_amount >= 0),
  total numeric not null check (total >= 0),
  delivery_days integer not null check (delivery_days between 1 and 365),
  valid_until date not null,
  notes text not null default '',
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'rejected', 'expired', 'cancelled')),
  created_by text not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  accepted_at timestamptz,
  unique (inquiry_id, version)
);

create index if not exists quotes_inquiry_idx on public.quotes (inquiry_id, created_at desc);
create index if not exists quotes_status_idx on public.quotes (status, created_at desc);

alter table public.quotes enable row level security;

comment on table public.quotes is 'Versioned commercial quotes generated from customer inquiries.';
