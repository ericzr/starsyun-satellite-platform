import { GatewayError } from './stac';
import { persistenceConfig } from './inquiries';
import { supabaseApiHeaders } from './supabase';

type Row = Record<string, unknown>;

export type CatalogSource = {
  id: string;
  kind: string;
  displayName: string;
  status: string;
  requiresCredentials: boolean;
  publicConfig: Record<string, unknown>;
  docsUrl?: string;
  termsUrl?: string;
  attribution: string;
};

export type CatalogProduct = {
  id: string;
  providerId: string;
  externalId: string;
  category: 'archive' | 'tasking' | 'analysis';
  collection?: string;
  captureTime?: string;
  geometry?: unknown;
  bbox?: number[];
  metadata: Record<string, unknown>;
  availability: string;
  priceMode: string;
  currency?: string;
  price?: number;
  license: string;
  termsVersion?: string;
  sourceUrl?: string;
  indexedAt: string;
};

function text(value: unknown, field: string, max = 500) {
  if (value == null || value === '') return undefined;
  if (typeof value !== 'string' || value.length > max) throw new GatewayError(400, `${field} is invalid`);
  return value.trim();
}

function limit(value: unknown) {
  if (value == null || value === '') return 100;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 500) throw new GatewayError(400, 'limit is invalid');
  return parsed;
}

function mapSource(row: Row): CatalogSource {
  return {
    id: String(row.id ?? ''),
    kind: String(row.kind ?? ''),
    displayName: String(row.display_name ?? ''),
    status: String(row.status ?? 'planned'),
    requiresCredentials: Boolean(row.requires_credentials),
    publicConfig: row.public_config && typeof row.public_config === 'object' ? row.public_config as Record<string, unknown> : {},
    docsUrl: row.docs_url == null ? undefined : String(row.docs_url),
    termsUrl: row.terms_url == null ? undefined : String(row.terms_url),
    attribution: String(row.attribution ?? ''),
  };
}

function mapProduct(row: Row): CatalogProduct {
  const bbox = Array.isArray(row.bbox) ? row.bbox.map(Number).filter(Number.isFinite) : undefined;
  return {
    id: String(row.id ?? ''),
    providerId: String(row.provider_id ?? ''),
    externalId: String(row.external_id ?? ''),
    category: row.category as CatalogProduct['category'],
    collection: row.collection == null ? undefined : String(row.collection),
    captureTime: row.capture_time == null ? undefined : String(row.capture_time),
    geometry: row.geometry,
    bbox: bbox?.length === 4 ? bbox : undefined,
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata as Record<string, unknown> : {},
    availability: String(row.availability ?? 'unknown'),
    priceMode: String(row.price_mode ?? 'inquiry'),
    currency: row.currency == null ? undefined : String(row.currency),
    price: row.price == null ? undefined : Number(row.price),
    license: String(row.license ?? ''),
    termsVersion: row.terms_version == null ? undefined : String(row.terms_version),
    sourceUrl: row.source_url == null ? undefined : String(row.source_url),
    indexedAt: String(row.indexed_at ?? ''),
  };
}

async function rest(path: string) {
  const { url, key } = persistenceConfig();
  let response: Response;
  try {
    response = await fetch(`${url}/rest/v1/${path}`, {
      headers: { ...supabaseApiHeaders(key), Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new GatewayError(502, 'catalog service unavailable');
  }
  if (!response.ok) throw new GatewayError(502, `catalog persistence failed (${response.status})`);
  return response.json() as Promise<Row[]>;
}

async function restRequest(path: string, init: RequestInit = {}) {
  const { url, key } = persistenceConfig();
  let response: Response;
  try {
    response = await fetch(`${url}/rest/v1/${path}`, {
      ...init,
      headers: { ...supabaseApiHeaders(key), Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new GatewayError(502, 'catalog service unavailable');
  }
  if (!response.ok) throw new GatewayError(response.status === 409 ? 409 : 502, `catalog persistence failed (${response.status})`);
  return response;
}

export function parseCatalogProductQuery(query: Record<string, string | string[] | undefined>) {
  const id = text(Array.isArray(query.id) ? query.id[0] : query.id, 'id', 180);
  if (id && !/^[A-Za-z0-9._:-]+$/.test(id)) throw new GatewayError(400, 'id is invalid');
  const provider = text(Array.isArray(query.provider) ? query.provider[0] : query.provider, 'provider', 80);
  const category = text(Array.isArray(query.category) ? query.category[0] : query.category, 'category', 20);
  if (category && !['archive', 'tasking', 'analysis'].includes(category)) throw new GatewayError(400, 'category is invalid');
  return { id, provider, category: category as CatalogProduct['category'] | undefined, limit: limit(Array.isArray(query.limit) ? query.limit[0] : query.limit) };
}

export async function listCatalogSources() {
  const rows = await rest('data_sources?select=id,kind,display_name,status,requires_credentials,public_config,docs_url,terms_url,attribution&status=in.(enabled,configured)&order=display_name.asc&limit=200');
  return rows.map(mapSource);
}

export async function listCatalogProducts(input: ReturnType<typeof parseCatalogProductQuery>) {
  const sources = await listCatalogSources();
  const allowed = sources.map((source) => source.id).filter((id) => !input.provider || id === input.provider);
  if (!allowed.length) return [];
  const params = new URLSearchParams({
    select: 'id,provider_id,external_id,category,collection,capture_time,geometry,bbox,metadata,availability,price_mode,currency,price,license,terms_version,source_url,indexed_at',
    provider_id: `in.(${allowed.join(',')})`,
    availability: 'eq.available',
    order: 'capture_time.desc.nullslast',
    limit: String(input.limit),
  });
  if (input.category) params.set('category', `eq.${input.category}`);
  if (input.id) params.set('id', `eq.${input.id}`);
  return (await rest(`provider_products?${params.toString()}`)).map(mapProduct);
}

export interface CatalogProductInput {
  providerId: string;
  externalId: string;
  category: CatalogProduct['category'];
  collection?: string;
  captureTime?: string;
  geometry?: unknown;
  bbox?: [number, number, number, number];
  metadata: Record<string, unknown>;
  availability: 'unknown' | 'available' | 'restricted' | 'sold' | 'expired';
  priceMode: 'free' | 'fixed' | 'estimated' | 'inquiry';
  currency?: 'CNY' | 'USD' | 'EUR' | 'AED';
  price?: number;
  license: string;
  termsVersion?: string;
  sourceUrl?: string;
}

function optionalText(value: unknown, field: string, max = 500) {
  if (value == null || value === '') return undefined;
  if (typeof value !== 'string' || value.trim().length > max) throw new GatewayError(400, `${field} is invalid`);
  return value.trim();
}

export function parseCatalogProductInput(body: unknown): CatalogProductInput {
  const input = (body ?? {}) as Record<string, unknown>;
  const providerId = optionalText(input.providerId, 'providerId', 80);
  const externalId = optionalText(input.externalId, 'externalId', 240);
  if (!providerId || !externalId) throw new GatewayError(400, 'providerId and externalId are required');
  const category = input.category;
  if (category !== 'archive' && category !== 'tasking' && category !== 'analysis') throw new GatewayError(400, 'category is invalid');
  const availability = input.availability == null ? 'unknown' : input.availability;
  if (!['unknown', 'available', 'restricted', 'sold', 'expired'].includes(String(availability))) throw new GatewayError(400, 'availability is invalid');
  const priceMode = input.priceMode == null ? 'inquiry' : input.priceMode;
  if (!['free', 'fixed', 'estimated', 'inquiry'].includes(String(priceMode))) throw new GatewayError(400, 'priceMode is invalid');
  const currencyValue = input.currency == null || input.currency === '' ? undefined : input.currency;
  if (currencyValue !== undefined && !['CNY', 'USD', 'EUR', 'AED'].includes(String(currencyValue))) throw new GatewayError(400, 'currency is invalid');
  const price = input.price == null || input.price === '' ? undefined : Number(input.price);
  if (price !== undefined && (!Number.isFinite(price) || price < 0 || price > 1_000_000_000_000)) throw new GatewayError(400, 'price is invalid');
  const rawBbox = input.bbox;
  let bbox: [number, number, number, number] | undefined;
  if (rawBbox != null) {
    if (!Array.isArray(rawBbox) || rawBbox.length !== 4 || rawBbox.some((value) => !Number.isFinite(Number(value)))) throw new GatewayError(400, 'bbox is invalid');
    bbox = rawBbox.map(Number) as [number, number, number, number];
  }
  const geometry = input.geometry;
  if (geometry != null && (!geometry || typeof geometry !== 'object' || Array.isArray(geometry) || JSON.stringify(geometry).length > 500_000)) throw new GatewayError(400, 'geometry is invalid');
  if (geometry == null) throw new GatewayError(400, 'geometry is required for a catalog product');
  const metadata = input.metadata == null ? {} : input.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) || JSON.stringify(metadata).length > 64_000) throw new GatewayError(400, 'metadata is invalid');
  const license = optionalText(input.license, 'license', 1000) ?? '';
  const termsVersion = optionalText(input.termsVersion, 'termsVersion', 160);
  const sourceUrl = optionalText(input.sourceUrl, 'sourceUrl', 1000);
  if (availability === 'available' && (!license || !termsVersion || !sourceUrl)) throw new GatewayError(400, 'available products require license, termsVersion and sourceUrl');
  const captureTime = optionalText(input.captureTime, 'captureTime', 80);
  if (captureTime && Number.isNaN(Date.parse(captureTime))) throw new GatewayError(400, 'captureTime is invalid');
  return { providerId, externalId, category, collection: optionalText(input.collection, 'collection', 160), captureTime, geometry, bbox, metadata: metadata as Record<string, unknown>, availability: availability as CatalogProductInput['availability'], priceMode: priceMode as CatalogProductInput['priceMode'], currency: currencyValue as CatalogProductInput['currency'], price, license, termsVersion, sourceUrl };
}

export async function upsertCatalogProduct(input: CatalogProductInput) {
  const sourceResponse = await rest(`data_sources?select=id,status&id=eq.${encodeURIComponent(input.providerId)}&limit=1`);
  const sources = await sourceResponse;
  if (!sources[0]) throw new GatewayError(404, 'provider is not registered');
  if (!['enabled', 'configured'].includes(String(sources[0].status))) throw new GatewayError(409, 'provider is not enabled');
  const record = { id: crypto.randomUUID(), provider_id: input.providerId, external_id: input.externalId, category: input.category, collection: input.collection ?? null, capture_time: input.captureTime ?? null, geometry: input.geometry ?? null, bbox: input.bbox ?? null, metadata: input.metadata, availability: input.availability, price_mode: input.priceMode, currency: input.currency ?? null, price: input.price ?? null, license: input.license, terms_version: input.termsVersion ?? null, source_url: input.sourceUrl ?? null, indexed_at: new Date().toISOString() };
  const response = await restRequest('provider_products?on_conflict=provider_id,external_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(record) });
  const rows = (await response.json()) as Row[];
  if (!rows[0]) throw new GatewayError(502, 'catalog persistence returned no product');
  return mapProduct(rows[0]);
}
