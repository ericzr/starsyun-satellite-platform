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

async function supabaseRequest(path: string, init: RequestInit = {}) {
  const { url, key } = persistenceConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { ...supabaseApiHeaders(key), Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new GatewayError(502, `catalog persistence failed (${response.status})`);
  return response;
}

function ensureBbox(input: SyncInput): [number, number, number, number] {
  if (input.bbox) return input.bbox;
  const configured = process.env.PUBLIC_CATALOG_SYNC_BBOX?.split(',').map(Number);
  if (configured?.length === 4 && configured.every(Number.isFinite)) return configured as [number, number, number, number];
  throw new GatewayError(400, 'catalog sync requires bbox or PUBLIC_CATALOG_SYNC_BBOX');
}

function normalizedProduct(feature: Record<string, unknown>) {
  const properties = feature.properties && typeof feature.properties === 'object' ? feature.properties as Record<string, unknown> : {};
  const id = typeof feature.id === 'string' ? feature.id : '';
  if (!id) throw new GatewayError(502, 'provider returned an item without an id');
  const bbox = Array.isArray(feature.bbox) && feature.bbox.length === 4 ? feature.bbox.map(Number) : null;
  const captureTime = typeof properties.datetime === 'string' ? properties.datetime : null;
  return {
    id: crypto.randomUUID(), provider_id: 'earth-search', external_id: id, category: 'archive',
    collection: 'sentinel-2-l2a', capture_time: captureTime, geometry: feature.geometry ?? null, bbox,
    metadata: { ...properties, stac_id: id }, availability: 'unknown', price_mode: 'free', currency: null, price: null,
    license: String(properties.license ?? 'public-data'), terms_version: 'source-metadata',
    source_url: `https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/${encodeURIComponent(id)}`,
    indexed_at: new Date().toISOString(),
  };
}

async function upsertProducts(features: unknown[]) {
  const rows = features.filter((feature): feature is Record<string, unknown> => Boolean(feature && typeof feature === 'object')).map(normalizedProduct);
  if (!rows.length) return 0;
  const response = await supabaseRequest('provider_products?on_conflict=provider_id,external_id', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows),
  });
  await response.text().catch(() => undefined);
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
    const recordsUpserted = await upsertProducts(features);
    return { recordsSeen: features.length, recordsUpserted, summary: { collection: 'sentinel-2-l2a', bbox: ensureBbox(input), source: 'Earth Search' } };
  },
};

const adapters: readonly Adapter[] = [earthSearchAdapter];
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
