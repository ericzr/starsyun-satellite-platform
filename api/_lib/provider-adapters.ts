import { createHash } from 'node:crypto';
import { GatewayError, parseSearchRequest, searchEarthSearch } from './stac';
import { persistenceConfig } from './inquiries';
import { supabaseApiHeaders } from './supabase';

export type SyncMode = 'health' | 'catalog' | 'prices' | 'availability';
export type SyncInput = { providerId: string; mode: SyncMode; bbox?: [number, number, number, number]; datetime?: string; cloudCoverMax?: number; limit?: number };
export type SyncResult = { recordsSeen: number; recordsUpserted: number; summary: Record<string, unknown> };

type Adapter = {
  id: string;
  capabilities: readonly SyncMode[];
  healthCheck(): Promise<Record<string, unknown>>;
  sync(input: SyncInput): Promise<SyncResult>;
};

type StacAdapterConfig = {
  id: string;
  label: string;
  baseUrl: string;
  collection: string;
  sourceUrl: string;
  termsUrl: string;
};

const earthSearchConfig: StacAdapterConfig = {
  id: 'earth-search', label: 'Earth Search',
  baseUrl: 'https://earth-search.aws.element84.com/v1', collection: 'sentinel-2-l2a',
  sourceUrl: 'https://earth-search.aws.element84.com/v1', termsUrl: 'https://registry.opendata.aws/earth-search/',
};

async function supabaseRequest(path: string, init: RequestInit = {}) {
  const { url, key } = persistenceConfig();
  let response: Response;
  try {
    response = await fetch(`${url}/rest/v1/${path}`, {
      ...init,
      headers: { ...supabaseApiHeaders(key), Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new GatewayError(502, 'catalog persistence unavailable');
  }
  if (!response.ok) throw new GatewayError(502, `catalog persistence failed (${response.status})`);
  return response;
}

function ensureBbox(input: SyncInput): [number, number, number, number] {
  if (input.bbox) return input.bbox;
  const configured = process.env.PUBLIC_CATALOG_SYNC_BBOX?.split(',').map(Number);
  if (configured?.length === 4 && configured.every(Number.isFinite)) return configured as [number, number, number, number];
  throw new GatewayError(400, 'catalog sync requires bbox or PUBLIC_CATALOG_SYNC_BBOX');
}

function normalizedProduct(feature: Record<string, unknown>, config: StacAdapterConfig) {
  const properties = feature.properties && typeof feature.properties === 'object' ? feature.properties as Record<string, unknown> : {};
  const id = typeof feature.id === 'string' ? feature.id : '';
  if (!id) throw new GatewayError(502, 'provider returned an item without an id');
  const digest = createHash('sha256').update(`${config.id}:${id}`).digest();
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const stableId = `${digest.toString('hex', 0, 4)}-${digest.toString('hex', 4, 6)}-${digest.toString('hex', 6, 8)}-${digest.toString('hex', 8, 10)}-${digest.toString('hex', 10, 16)}`;
  const bbox = Array.isArray(feature.bbox) && feature.bbox.length === 4 ? feature.bbox.map(Number) : null;
  const captureTime = typeof properties.datetime === 'string' ? properties.datetime : null;
  return {
    id: stableId, provider_id: config.id, external_id: id, category: 'archive',
    collection: config.collection, capture_time: captureTime, geometry: feature.geometry ?? null, bbox,
    metadata: { ...properties, stac_id: id }, availability: 'unknown', price_mode: 'free', currency: null, price: null,
    license: String(properties.license ?? 'public-data'), terms_version: 'source-metadata',
    source_url: `${config.baseUrl}/collections/${encodeURIComponent(config.collection)}/items/${encodeURIComponent(id)}`,
    indexed_at: new Date().toISOString(),
  };
}

async function upsertProducts(features: unknown[], config: StacAdapterConfig) {
  const rows = features.filter((feature): feature is Record<string, unknown> => Boolean(feature && typeof feature === 'object')).map((feature) => normalizedProduct(feature, config));
  if (!rows.length) return 0;
  // A catalog refresh is an upstream metadata operation.  It must never
  // overwrite operator-reviewed availability, pricing, licensing, or source
  // links.  PostgREST upserts merge every supplied column on conflict, so we
  // insert only new records and patch existing records with source fields.
  const externalIds = rows.map((row) => row.external_id);
  const existing = new Set<string>();
  for (let offset = 0; offset < externalIds.length; offset += 50) {
    const chunk = externalIds.slice(offset, offset + 50);
    const query = new URLSearchParams({
      select: 'external_id',
      provider_id: `eq.${config.id}`,
      // URLSearchParams performs the single required URL encoding. Encoding
      // each id first would turn `%` into `%25` and miss valid upstream IDs.
      external_id: `in.(${chunk.join(',')})`,
    });
    const response = await supabaseRequest(`provider_products?${query.toString()}`);
    const records = (await response.json()) as Array<{ external_id?: unknown }>;
    records.forEach((record) => {
      if (typeof record.external_id === 'string') existing.add(record.external_id);
    });
  }

  const newRows = rows.filter((row) => !existing.has(row.external_id));
  if (newRows.length) {
    const response = await supabaseRequest('provider_products?on_conflict=provider_id,external_id', {
      method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(newRows),
    });
    await response.text().catch(() => undefined);
  }

  const refreshedAt = new Date().toISOString();
  await Promise.all(rows.filter((row) => existing.has(row.external_id)).map(async (row) => {
    const query = new URLSearchParams({ provider_id: `eq.${config.id}`, external_id: `eq.${row.external_id}` });
    const response = await supabaseRequest(`provider_products?${query.toString()}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        collection: row.collection,
        capture_time: row.capture_time,
        geometry: row.geometry,
        bbox: row.bbox,
        metadata: row.metadata,
        indexed_at: refreshedAt,
      }),
    });
    await response.text().catch(() => undefined);
  }));
  return rows.length;
}

const earthSearchAdapter: Adapter = {
  id: 'earth-search', capabilities: ['health', 'catalog'],
  async healthCheck() {
    const response = await fetch('https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a', {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new GatewayError(502, `Earth Search health check returned ${response.status}`);
    const payload = await response.json() as { id?: unknown; title?: unknown };
    return { endpoint: 'https://earth-search.aws.element84.com/v1', reachable: true, collection: String(payload.id ?? 'sentinel-2-l2a'), title: String(payload.title ?? '') };
  },
  async sync(input) {
    if (input.mode !== 'catalog') return { recordsSeen: 0, recordsUpserted: 0, summary: { skipped: true, reason: 'mode is not supported by this adapter' } };
    const result = await searchEarthSearch(parseSearchRequest({ collections: 'sentinel-2-l2a', bbox: ensureBbox(input), datetime: input.datetime, cloudCoverMax: input.cloudCoverMax, limit: input.limit ?? 50 }));
    const features = Array.isArray((result as { features?: unknown[] }).features) ? (result as { features: unknown[] }).features : [];
    const recordsUpserted = await upsertProducts(features, earthSearchConfig);
    return { recordsSeen: features.length, recordsUpserted, summary: { collection: 'sentinel-2-l2a', bbox: ensureBbox(input), source: 'Earth Search' } };
  },
};

const openStacAdapters: readonly StacAdapterConfig[] = [
  {
    id: 'copernicus', label: 'Copernicus Data Space',
    baseUrl: 'https://stac.dataspace.copernicus.eu/v1', collection: 'sentinel-2-l2a',
    sourceUrl: 'https://dataspace.copernicus.eu/', termsUrl: 'https://dataspace.copernicus.eu/terms',
  },
  {
    id: 'planetary-computer', label: 'Microsoft Planetary Computer',
    baseUrl: 'https://planetarycomputer.microsoft.com/api/stac/v1', collection: 'sentinel-2-l2a',
    sourceUrl: 'https://planetarycomputer.microsoft.com/', termsUrl: 'https://planetarycomputer.microsoft.com/terms',
  },
];

function createOpenStacAdapter(config: StacAdapterConfig): Adapter {
  return {
    id: config.id,
    capabilities: ['health', 'catalog'],
    async healthCheck() {
      const response = await fetch(`${config.baseUrl}/collections/${encodeURIComponent(config.collection)}`, {
        headers: { accept: 'application/json' }, signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) throw new GatewayError(502, `${config.label} health check returned ${response.status}`);
      const payload = await response.json() as { id?: unknown; title?: unknown };
      return { endpoint: config.baseUrl, reachable: true, collection: String(payload.id ?? config.collection), title: String(payload.title ?? config.label) };
    },
    async sync(input) {
      if (input.mode !== 'catalog') return { recordsSeen: 0, recordsUpserted: 0, summary: { skipped: true, reason: 'mode is not supported by this adapter' } };
      const query: Record<string, unknown> = { collections: [config.collection], bbox: ensureBbox(input), limit: Math.min(input.limit ?? 50, 100) };
      if (input.datetime) query.datetime = input.datetime;
      if (input.cloudCoverMax != null) query.query = { 'eo:cloud_cover': { lte: input.cloudCoverMax } };
      const response = await fetch(`${config.baseUrl}/search`, {
        method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/geo+json' },
        body: JSON.stringify(query), signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new GatewayError(502, `${config.label} search returned ${response.status}`);
      const result = await response.json() as { features?: unknown[] };
      const features = Array.isArray(result.features) ? result.features : [];
      const recordsUpserted = await upsertProducts(features, config);
      return { recordsSeen: features.length, recordsUpserted, summary: { collection: config.collection, bbox: ensureBbox(input), source: config.label, sourceUrl: config.sourceUrl, termsUrl: config.termsUrl } };
    },
  };
}

const adapters: readonly Adapter[] = [earthSearchAdapter, ...openStacAdapters.map(createOpenStacAdapter)];
export function listProviderAdapters() { return adapters.map(({ id, capabilities }) => ({ id, capabilities: [...capabilities] })); }
export function getProviderAdapter(id: string) {
  const adapter = adapters.find((candidate) => candidate.id === id);
  if (!adapter) throw new GatewayError(404, 'provider adapter is not implemented');
  return adapter;
}

export async function runProviderSync(input: SyncInput): Promise<SyncResult> {
  const adapter = getProviderAdapter(input.providerId);
  if (!adapter.capabilities.includes(input.mode)) throw new GatewayError(409, `adapter does not support ${input.mode}`);
  return input.mode === 'health' ? { recordsSeen: 0, recordsUpserted: 0, summary: await adapter.healthCheck() } : adapter.sync(input);
}
