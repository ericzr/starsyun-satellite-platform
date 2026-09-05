import { GatewayError } from './stac';
import { persistenceConfig } from './inquiries';
import { supabaseApiHeaders } from './supabase';

export type AdminAreaRecord = {
  id: string;
  countryIso2?: string;
  countryIso3: string;
  level: 0 | 1 | 2 | 3;
  parentId?: string;
  nameEn: string;
  nameLocal: Record<string, string>;
  sourceLicense?: string;
  sourceUrl?: string;
  centroid?: [number, number];
  bbox?: [number, number, number, number];
  geometry?: GeoJSON.Geometry;
  source: string;
  sourceVersion: string;
};

type Row = Record<string, unknown>;
type CacheEntry<T> = { expiresAt: number; value: T };

const listCache = new Map<string, CacheEntry<AdminAreaRecord[]>>();
const areaCache = new Map<string, CacheEntry<AdminAreaRecord | null>>();
const LIST_CACHE_TTL_MS = 5 * 60_000;
const AREA_CACHE_TTL_MS = 60 * 60_000;

function cached<T>(cache: Map<string, CacheEntry<T>>, key: string) {
  const entry = cache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    if (entry) cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function store<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T, ttl: number) {
  if (cache.size > 10_000) {
    const now = Date.now();
    for (const [entryKey, entry] of cache) {
      if (entry.expiresAt <= now) cache.delete(entryKey);
    }
  }
  cache.set(key, { value, expiresAt: Date.now() + ttl });
  return value;
}

function mapRow(row: Row): AdminAreaRecord {
  const bbox = Array.isArray(row.bbox) ? row.bbox.map(Number) : [];
  const centroidLon = Number(row.centroid_lon);
  const centroidLat = Number(row.centroid_lat);
  return {
    id: String(row.id ?? ''),
    countryIso2: row.country_iso2 == null ? undefined : String(row.country_iso2),
    countryIso3: String(row.country_iso3 ?? ''),
    level: Number(row.level) as 0 | 1 | 2 | 3,
    parentId: row.parent_id == null ? undefined : String(row.parent_id),
    nameEn: String(row.name_en ?? ''),
    nameLocal: row.name_local && typeof row.name_local === 'object' ? row.name_local as Record<string, string> : {},
    sourceLicense: row.source_license == null ? undefined : String(row.source_license),
    sourceUrl: row.source_url == null ? undefined : String(row.source_url),
    centroid: Number.isFinite(centroidLon) && Number.isFinite(centroidLat) ? [centroidLon, centroidLat] : undefined,
    bbox: bbox.length === 4 && bbox.every(Number.isFinite) ? bbox as [number, number, number, number] : undefined,
    geometry: row.geometry && typeof row.geometry === 'object' ? row.geometry as GeoJSON.Geometry : undefined,
    source: String(row.source ?? ''),
    sourceVersion: String(row.source_version ?? ''),
  };
}

function text(value: unknown, field: string, max = 80) {
  if (value == null || value === '') return undefined;
  if (typeof value !== 'string' || value.length > max) throw new GatewayError(400, `${field} is invalid`);
  return value.trim();
}

function number(value: unknown, field: string, min: number, max: number) {
  if (value == null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new GatewayError(400, `${field} is invalid`);
  return parsed;
}

function encodeFilter(value: string) {
  // Escape PostgREST filter metacharacters before URLSearchParams encoding.
  return value.replace(/[\\%_*(),]/g, '\\$&');
}

export function parseAdminQuery(query: Record<string, string | string[] | undefined>) {
  const country = text(Array.isArray(query.country) ? query.country[0] : query.country, 'country', 3)?.toUpperCase();
  const parent = text(Array.isArray(query.parent) ? query.parent[0] : query.parent, 'parent', 180);
  const q = text(Array.isArray(query.q) ? query.q[0] : query.q, 'q', 100);
  const level = number(Array.isArray(query.level) ? query.level[0] : query.level, 'level', 0, 3);
  const limit = Math.min(5000, number(Array.isArray(query.limit) ? query.limit[0] : query.limit, 'limit', 1, 5000) ?? 500);
  if (country && !/^[A-Z]{3}$/.test(country)) throw new GatewayError(400, 'country is invalid');
  if (parent && !/^[A-Za-z0-9._:-]{1,180}$/.test(parent)) throw new GatewayError(400, 'parent is invalid');
  if (q && /[\\%*(),]/.test(q)) throw new GatewayError(400, 'q is invalid');
  return { country, parent, q, level, limit };
}

export async function listAdminAreas(query: ReturnType<typeof parseAdminQuery>) {
  const cacheKey = JSON.stringify(query);
  const existing = cached(listCache, cacheKey);
  if (existing) return existing;
  const { url, key } = persistenceConfig();
  const params = new URLSearchParams({
    select: 'id,country_iso2,country_iso3,level,parent_id,name_en,name_local,source_license,source_url,centroid_lon,centroid_lat,bbox,source,source_version',
    is_active: 'eq.true',
    order: 'name_en.asc',
    limit: String(query.limit),
  });
  if (query.country) params.set('country_iso3', `eq.${query.country}`);
  if (query.parent) params.set('parent_id', `eq.${query.parent}`);
  if (query.level != null) params.set('level', `eq.${query.level}`);
  if (query.q) {
    const value = encodeFilter(query.q);
    // Search both the canonical English name and the localized aliases. The
    // latter keeps Chinese UI searches fully server-side and avoids a browser
    // dependency on a third-party geocoder.
    params.set('or', `(name_en.ilike.*${value}*,name_local->>zh-Hans.ilike.*${value}*,name_local->>zh.ilike.*${value}*,name_local->>name:zh.ilike.*${value}*)`);
  }
  const pageSize = Math.min(query.limit, 1000);
  const rows: Row[] = [];
  for (let offset = 0; offset < query.limit; offset += pageSize) {
    const pageParams = new URLSearchParams(params);
    pageParams.set('limit', String(Math.min(pageSize, query.limit - offset)));
    pageParams.set('offset', String(offset));
    let response: Response;
    try {
      response = await fetch(`${url}/rest/v1/admin_areas?${pageParams.toString()}`, {
        headers: { ...supabaseApiHeaders(key), Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new GatewayError(502, 'administrative directory unavailable');
    }
    if (!response.ok) throw new GatewayError(502, `administrative directory failed (${response.status})`);
    const page = (await response.json()) as Row[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return store(listCache, cacheKey, rows.map(mapRow), LIST_CACHE_TTL_MS);
}

export async function getAdminArea(id: string) {
  if (!/^[A-Za-z0-9._:-]{1,220}$/.test(id)) throw new GatewayError(400, 'invalid administrative area id');
  const existing = cached(areaCache, id);
  if (existing !== undefined) return existing;
  const { url, key } = persistenceConfig();
  const params = new URLSearchParams({ select: '*', id: `eq.${id}`, is_active: 'eq.true', limit: '1' });
  let response: Response;
  try {
    response = await fetch(`${url}/rest/v1/admin_areas?${params.toString()}`, {
      headers: { ...supabaseApiHeaders(key), Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new GatewayError(502, 'administrative area unavailable');
  }
  if (!response.ok) throw new GatewayError(502, `administrative area failed (${response.status})`);
  const rows = (await response.json()) as Row[];
  return store(areaCache, id, rows[0] ? mapRow(rows[0]) : null, AREA_CACHE_TTL_MS);
}
