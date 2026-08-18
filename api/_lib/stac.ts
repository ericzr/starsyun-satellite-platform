const EARTH_SEARCH_BASE = 'https://earth-search.aws.element84.com/v1';

export const COLLECTIONS = {
  sentinel2: 'sentinel-2-l2a',
} as const;

type StacRequest = {
  collections?: unknown;
  bbox?: unknown;
  datetime?: unknown;
  cloudCoverMax?: unknown;
  limit?: unknown;
};

type CacheEntry = { expiresAt: number; payload: unknown };

const cache = new Map<string, CacheEntry>();
const requests = new Map<string, { startedAt: number; count: number }>();
const CACHE_TTL_MS = 60_000;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 60;
const UPSTREAM_TIMEOUT_MS = 12_000;

export class GatewayError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function asNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function validateBbox(value: unknown): [number, number, number, number] {
  if (!Array.isArray(value) || value.length !== 4) {
    throw new GatewayError(400, 'bbox must contain west, south, east and north');
  }
  const bbox = value.map(asNumber);
  if (bbox.some((part) => part == null)) throw new GatewayError(400, 'bbox must contain numbers');
  const [west, south, east, north] = bbox as [number, number, number, number];
  if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) {
    throw new GatewayError(400, 'bbox is outside valid geographic bounds');
  }
  return [west, south, east, north];
}

function validateDatetime(value: unknown) {
  if (value == null) return undefined;
  if (typeof value !== 'string' || value.length > 100 || !value.includes('/')) {
    throw new GatewayError(400, 'datetime must be an ISO-8601 interval');
  }
  return value;
}

function validateCollection(value: unknown) {
  if (value == null) return COLLECTIONS.sentinel2;
  if (typeof value !== 'string' || !Object.values(COLLECTIONS).includes(value as (typeof COLLECTIONS)[keyof typeof COLLECTIONS])) {
    throw new GatewayError(400, 'collection is not enabled');
  }
  return value;
}

export function parseSearchRequest(body: StacRequest) {
  const collection = validateCollection(Array.isArray(body.collections) ? body.collections[0] : body.collections);
  const bbox = validateBbox(body.bbox);
  const datetime = validateDatetime(body.datetime);
  const cloudCoverMax = body.cloudCoverMax == null ? undefined : asNumber(body.cloudCoverMax);
  if (cloudCoverMax != null && (cloudCoverMax < 0 || cloudCoverMax > 100)) {
    throw new GatewayError(400, 'cloudCoverMax must be between 0 and 100');
  }
  const rawLimit = asNumber(body.limit) ?? 60;
  const limit = Math.max(1, Math.min(100, Math.floor(rawLimit)));
  return { collection, bbox, datetime, cloudCoverMax, limit };
}

export function checkRateLimit(identity: string) {
  const now = Date.now();
  const existing = requests.get(identity);
  if (!existing || now - existing.startedAt >= RATE_WINDOW_MS) {
    requests.set(identity, { startedAt: now, count: 1 });
    return;
  }
  existing.count += 1;
  if (existing.count > RATE_LIMIT) throw new GatewayError(429, 'rate limit exceeded');
}

function cacheKey(input: ReturnType<typeof parseSearchRequest>) {
  return JSON.stringify(input);
}

export async function searchEarthSearch(input: ReturnType<typeof parseSearchRequest>) {
  const key = cacheKey(input);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.payload;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const query: Record<string, unknown> = {
      collections: [input.collection],
      bbox: input.bbox,
      limit: input.limit,
    };
    if (input.datetime) query.datetime = input.datetime;
    if (input.cloudCoverMax != null) query.query = { 'eo:cloud_cover': { lte: input.cloudCoverMax } };

    const response = await fetch(`${EARTH_SEARCH_BASE}/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/geo+json' },
      body: JSON.stringify(query),
      signal: controller.signal,
    });
    if (!response.ok) throw new GatewayError(502, `provider returned ${response.status}`);
    const payload = await response.json();
    cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
    return payload;
  } catch (error) {
    if (error instanceof GatewayError) throw error;
    throw new GatewayError(504, 'provider request timed out or failed');
  } finally {
    clearTimeout(timeout);
  }
}

export async function getEarthSearchItem(id: string) {
  if (!/^[A-Za-z0-9._-]{1,160}$/.test(id)) throw new GatewayError(400, 'invalid provider item id');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch(`${EARTH_SEARCH_BASE}/collections/${COLLECTIONS.sentinel2}/items/${encodeURIComponent(id)}`, {
      headers: { accept: 'application/geo+json' },
      signal: controller.signal,
    });
    if (response.status === 404) throw new GatewayError(404, 'provider item not found');
    if (!response.ok) throw new GatewayError(502, `provider returned ${response.status}`);
    return response.json();
  } catch (error) {
    if (error instanceof GatewayError) throw error;
    throw new GatewayError(504, 'provider request timed out or failed');
  } finally {
    clearTimeout(timeout);
  }
}
