-- Platform foundation for production catalog, boundaries, provider jobs and wallet accounting.
-- Geometry is kept as GeoJSON JSONB so the migration works on a standard Supabase project;
-- PostGIS can be enabled later without changing the public API contract.

create table if not exists public.admin_areas (
  id text primary key,
  source text not null default 'geoBoundaries-gbOpen',
  source_version text not null,
  country_iso2 text,
  country_iso3 text not null,
  level smallint not null check (level between 0 and 3),
  parent_id text references public.admin_areas(id) on delete restrict,
  name_en text not null,
  name_local jsonb not null default '{}'::jsonb,
  source_license text,
  source_url text,
  centroid_lon double precision,
  centroid_lat double precision,
  bbox double precision[] check (bbox is null or cardinality(bbox) = 4),
  geometry jsonb not null,
  is_active boolean not null default true,
  imported_at timestamptz not null default now()
);

create index if not exists admin_areas_country_level_idx
  on public.admin_areas (country_iso3, level, name_en);
create index if not exists admin_areas_parent_idx
  on public.admin_areas (parent_id, level, name_en);
create index if not exists admin_areas_active_idx
  on public.admin_areas (is_active, country_iso3, level);
alter table public.admin_areas enable row level security;
comment on table public.admin_areas is 'Versioned ADM0-ADM3 administrative boundaries imported from an approved source.';

create table if not exists public.data_sources (
  id text primary key,
  kind text not null check (kind in ('basemap', 'imagery', 'stac', 'provider', 'analysis')),
  display_name text not null,
  status text not null default 'planned' check (status in ('planned', 'configured', 'enabled', 'paused', 'retired')),
  requires_credentials boolean not null default false,
  public_config jsonb not null default '{}'::jsonb,
  docs_url text,
  terms_url text,
  attribution text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.data_sources enable row level security;
comment on table public.data_sources is 'Registry for map layers and upstream data sources; credentials are never stored here.';

create table if not exists public.platform_users (
  user_id uuid primary key references auth.users(id) on delete restrict,
  display_name text,
  company_name text,
  account_status text not null default 'active' check (account_status in ('pending', 'active', 'suspended', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.platform_users enable row level security;
comment on table public.platform_users is 'Platform profile metadata. Authentication remains owned by auth.users.';

create table if not exists public.user_roles (
  user_id uuid not null references auth.users(id) on delete restrict,
  role text not null check (role in ('buyer', 'supplier', 'operator', 'admin')),
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);
alter table public.user_roles enable row level security;
comment on table public.user_roles is 'A user may be both a buyer and a supplier. Elevated roles are assigned server-side only.';

create table if not exists public.supplier_profiles (
  user_id uuid primary key references auth.users(id) on delete restrict,
  legal_name text not null,
  country_iso3 text,
  verification_status text not null default 'pending' check (verification_status in ('pending', 'verified', 'rejected', 'suspended')),
  capabilities jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.supplier_profiles enable row level security;
comment on table public.supplier_profiles is 'Verified supplier onboarding record; it does not grant provider API credentials.';

insert into public.data_sources (id, kind, display_name, status, requires_credentials, public_config, docs_url, terms_url, attribution)
values
  ('carto', 'basemap', 'Carto', 'planned', true, '{"theme":"dark-matter/positron"}', 'https://carto.com/basemaps/', 'https://carto.com/legal/terms-of-service/', '© CARTO'),
  ('openfreemap', 'basemap', 'OpenFreeMap', 'enabled', false, '{}', 'https://openfreemap.org/', 'https://openfreemap.org/attribution/', '© OpenFreeMap contributors'),
  ('osm', 'basemap', 'OpenStreetMap', 'enabled', false, '{}', 'https://www.openstreetmap.org/', 'https://www.openstreetmap.org/copyright', '© OpenStreetMap contributors'),
  ('nasa-viirs', 'imagery', 'NASA VIIRS', 'enabled', false, '{"mode":"raster"}', 'https://earthdata.nasa.gov/earth-observation-data/near-real-time', 'https://earthdata.nasa.gov/earth-observation-data/near-real-time', 'NASA GIBS / EOSDIS'),
  ('sentinel2-eox', 'imagery', 'Sentinel-2 EOX', 'enabled', false, '{"mode":"raster"}', 'https://s2maps.eu/', 'https://s2maps.eu/', 'Sentinel-2 / EOX'),
  ('esri-imagery', 'imagery', 'Esri World Imagery', 'enabled', false, '{"mode":"raster"}', 'https://www.arcgis.com/', 'https://www.esri.com/en-us/legal/terms/full-master-agreement', 'Esri'),
  ('aicgis', 'imagery', 'AICGIS', 'planned', true, '{}', null, null, 'AICGIS'),
  ('tianditu', 'imagery', 'Tianditu', 'planned', true, '{}', 'https://www.tianditu.gov.cn/', 'https://www.tianditu.gov.cn/', '天地图'),
  ('earth-search', 'stac', 'Earth Search', 'enabled', false, '{"collection":"sentinel-2-l2a"}', 'https://earth-search.aws.element84.com/v1', 'https://registry.opendata.aws/earth-search/', 'Element84 / AWS'),
  ('copernicus', 'provider', 'Copernicus Data Space', 'planned', true, '{}', 'https://dataspace.copernicus.eu/', 'https://dataspace.copernicus.eu/terms', 'Copernicus Data Space'),
  ('planetary-computer', 'provider', 'Microsoft Planetary Computer', 'planned', true, '{}', 'https://planetarycomputer.microsoft.com/', 'https://planetarycomputer.microsoft.com/terms', 'Microsoft'),
  ('nasa-earthdata', 'provider', 'NASA Earthdata', 'planned', true, '{}', 'https://cmr.earthdata.nasa.gov/search/site/docs/search/api.html', 'https://www.earthdata.nasa.gov/engage/open-data-services-and-software/api', 'NASA Earthdata'),
  ('usgs-eros', 'provider', 'USGS EROS', 'planned', true, '{}', 'https://m2m.cr.usgs.gov/', 'https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits', 'USGS'),
  ('planet', 'provider', 'Planet', 'planned', true, '{}', 'https://docs.planet.com/', 'https://www.planet.com/legal/', 'Planet'),
  ('airbus-oneatlas', 'provider', 'Airbus OneAtlas', 'planned', true, '{}', 'https://api.oneatlas.airbus.com/', 'https://www.intelligence-airbus.com/legal/', 'Airbus'),
  ('jilin-1', 'provider', '吉林一号', 'planned', true, '{}', null, null, '长光卫星'),
  ('siwei', 'provider', '中国四维', 'planned', true, '{}', null, null, '中国四维')
on conflict (id) do nothing;

create table if not exists public.provider_products (
  id uuid primary key,
  provider_id text not null references public.data_sources(id) on delete restrict,
  external_id text not null,
  category text not null check (category in ('archive', 'tasking', 'analysis')),
  collection text,
  capture_time timestamptz,
  geometry jsonb,
  bbox double precision[] check (bbox is null or cardinality(bbox) = 4),
  metadata jsonb not null default '{}'::jsonb,
  availability text not null default 'unknown' check (availability in ('unknown', 'available', 'restricted', 'sold', 'expired')),
  price_mode text not null default 'inquiry' check (price_mode in ('free', 'fixed', 'estimated', 'inquiry')),
  currency text check (currency in ('CNY', 'USD', 'EUR', 'AED')),
  price numeric check (price is null or price >= 0),
  license text not null default '',
  terms_version text,
  source_url text,
  indexed_at timestamptz not null default now(),
  unique (provider_id, external_id)
);
create index if not exists provider_products_search_idx
  on public.provider_products (provider_id, category, capture_time desc);
alter table public.provider_products enable row level security;
comment on table public.provider_products is 'Normalized provider catalog records. A record is not sellable until availability and terms are verified.';

create table if not exists public.provider_quotes (
  id uuid primary key,
  inquiry_id uuid not null references public.inquiries(id) on delete restrict,
  provider_id text not null references public.data_sources(id) on delete restrict,
  external_quote_id text,
  status text not null default 'requested' check (status in ('requested', 'quoted', 'expired', 'accepted', 'rejected', 'cancelled', 'failed')),
  currency text check (currency in ('CNY', 'USD', 'EUR', 'AED')),
  amount numeric check (amount is null or amount >= 0),
  valid_until timestamptz,
  terms_version text,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, external_quote_id)
);
create index if not exists provider_quotes_inquiry_idx on public.provider_quotes (inquiry_id, created_at desc);
create index if not exists provider_quotes_status_idx on public.provider_quotes (status, updated_at desc);
alter table public.provider_quotes enable row level security;
comment on table public.provider_quotes is 'Supplier quotations for archive or tasking requests before a customer-facing quote is issued.';

create table if not exists public.order_items (
  id uuid primary key,
  order_id uuid not null references public.orders(id) on delete restrict,
  provider_product_id uuid references public.provider_products(id) on delete restrict,
  provider_id text references public.data_sources(id) on delete restrict,
  external_product_id text,
  item_type text not null check (item_type in ('archive', 'tasking', 'analysis', 'delivery-fee')),
  quantity numeric not null default 1 check (quantity > 0),
  unit_price numeric not null default 0 check (unit_price >= 0),
  currency text not null check (currency in ('CNY', 'USD', 'EUR', 'AED')),
  product_snapshot jsonb not null default '{}'::jsonb,
  license_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (provider_product_id is not null or provider_id is not null or item_type = 'delivery-fee')
);
create index if not exists order_items_order_idx on public.order_items (order_id, created_at);
alter table public.order_items enable row level security;
comment on table public.order_items is 'Frozen commercial line items. Every sellable asset is linked to a provider product or supplier record.';

create table if not exists public.provider_orders (
  id uuid primary key,
  order_id uuid not null references public.orders(id) on delete restrict,
  order_item_id uuid references public.order_items(id) on delete restrict,
  provider_id text not null references public.data_sources(id) on delete restrict,
  external_order_id text,
  status text not null default 'pending' check (status in ('pending', 'quoted', 'submitted', 'processing', 'delivered', 'cancelled', 'failed')),
  idempotency_key text not null unique,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, external_order_id)
);
create index if not exists provider_orders_order_idx on public.provider_orders (order_id, created_at desc);
create index if not exists provider_orders_status_idx on public.provider_orders (status, updated_at desc);
alter table public.provider_orders enable row level security;

create table if not exists public.order_events (
  id uuid primary key,
  order_id uuid not null references public.orders(id) on delete restrict,
  event_type text not null,
  from_status text,
  to_status text,
  actor_type text not null check (actor_type in ('customer', 'admin', 'provider', 'system')),
  actor_id text,
  request_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists order_events_order_idx on public.order_events (order_id, created_at desc);
alter table public.order_events enable row level security;
comment on table public.order_events is 'Append-only order state and fulfillment audit trail.';

create table if not exists public.analysis_jobs (
  id uuid primary key,
  inquiry_id uuid references public.inquiries(id) on delete restrict,
  order_id uuid references public.orders(id) on delete restrict,
  service_type text not null check (service_type in ('change-detection', 'land-cover', 'feature-extraction', 'time-series', 'custom-analysis')),
  status text not null default 'queued' check (status in ('queued', 'validating', 'processing', 'qa', 'delivered', 'cancelled', 'failed')),
  input_spec jsonb not null default '{}'::jsonb,
  output_spec jsonb not null default '{}'::jsonb,
  worker_key text,
  error_message text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);
create index if not exists analysis_jobs_status_idx on public.analysis_jobs (status, created_at);
create index if not exists analysis_jobs_order_idx on public.analysis_jobs (order_id, created_at desc);
alter table public.analysis_jobs enable row level security;

create table if not exists public.wallet_accounts (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete restrict,
  currency text not null default 'CNY' check (currency in ('CNY', 'USD', 'EUR', 'AED')),
  status text not null default 'active' check (status in ('active', 'frozen', 'closed')),
  created_at timestamptz not null default now(),
  unique (user_id, currency)
);
alter table public.wallet_accounts enable row level security;

create table if not exists public.wallet_transactions (
  id uuid primary key,
  wallet_id uuid not null references public.wallet_accounts(id) on delete restrict,
  direction text not null check (direction in ('credit', 'debit', 'hold', 'release', 'refund')),
  amount numeric not null check (amount > 0),
  currency text not null check (currency in ('CNY', 'USD', 'EUR', 'AED')),
  status text not null default 'pending' check (status in ('pending', 'posted', 'voided')),
  reference_type text not null,
  reference_id text not null,
  idempotency_key text not null unique,
  provider text,
  provider_transaction_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  posted_at timestamptz
);
create index if not exists wallet_transactions_wallet_idx on public.wallet_transactions (wallet_id, created_at desc);
create index if not exists wallet_transactions_reference_idx on public.wallet_transactions (reference_type, reference_id);
alter table public.wallet_transactions enable row level security;
comment on table public.wallet_transactions is 'Immutable wallet ledger; balance is derived from posted transactions and verified payment webhooks.';

create table if not exists public.payment_events (
  id uuid primary key,
  order_id uuid not null references public.orders(id) on delete restrict,
  provider text not null check (provider in ('stripe', 'alipay', 'paypal', 'bank-transfer', 'wallet')),
  provider_event_id text,
  event_type text not null,
  status text not null check (status in ('received', 'verified', 'rejected', 'processed')),
  amount numeric,
  currency text check (currency in ('CNY', 'USD', 'EUR', 'AED')),
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, provider_event_id)
);
create index if not exists payment_events_order_idx on public.payment_events (order_id, received_at desc);
alter table public.payment_events enable row level security;
comment on table public.payment_events is 'Verified webhook and manual-reconciliation event log. Payment state may only advance from verified events.';
