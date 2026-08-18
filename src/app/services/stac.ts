import type { Product } from '../data/products';
import type { BBox } from '../lib/geo';
import { bboxAreaKm2 } from '../lib/geo';

const EARTH_SEARCH_URL = 'https://earth-search.aws.element84.com/v1/search';
const EARTH_SEARCH_COLLECTION = 'sentinel-2-l2a';
const STAC_GATEWAY_URL = (import.meta.env.VITE_STAC_GATEWAY_URL as string | undefined)?.replace(/\/$/, '');

type StacLink = { rel?: string; href?: string };
type StacAsset = { href?: string; roles?: string[]; type?: string };

interface StacItem {
  id: string;
  collection?: string[];
  bbox?: number[];
  geometry?: { type?: string; coordinates?: unknown };
  properties?: Record<string, unknown>;
  links?: StacLink[];
  assets?: Record<string, StacAsset>;
}

interface StacSearchResponse {
  features?: StacItem[];
}

export interface EarthSearchInput {
  bbox: BBox;
  datetime?: string;
  limit?: number;
  cloudCoverMax?: number;
}

const remoteProducts = new Map<string, Product>();

function walkCoordinates(value: unknown, points: Array<[number, number]>) {
  if (!Array.isArray(value)) return;
  if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
    points.push([value[0], value[1]]);
    return;
  }
  value.forEach((child) => walkCoordinates(child, points));
}

function itemBbox(item: StacItem): BBox | null {
  if (item.bbox && item.bbox.length >= 4) {
    return [item.bbox[0], item.bbox[1], item.bbox[2], item.bbox[3]];
  }
  const points: Array<[number, number]> = [];
  walkCoordinates(item.geometry?.coordinates, points);
  if (!points.length) return null;
  const longitudes = points.map(([lng]) => lng);
  const latitudes = points.map(([, lat]) => lat);
  return [Math.min(...longitudes), Math.min(...latitudes), Math.max(...longitudes), Math.max(...latitudes)];
}

function link(item: StacItem, rel: string) {
  return item.links?.find((entry) => entry.rel === rel)?.href;
}

function asset(item: StacItem, key: string) {
  return item.assets?.[key]?.href;
}

function dateOnly(value: unknown) {
  return typeof value === 'string' ? value.slice(0, 10) : '';
}

function numberValue(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeItem(item: StacItem, index: number): Product | null {
  const bbox = itemBbox(item);
  if (!bbox) return null;
  const properties = item.properties ?? {};
  const captureTime = dateOnly(properties.datetime);
  const cloudCover = numberValue(properties['eo:cloud_cover'], 0);
  const sunElevation = numberValue(properties['view:sun_elevation'], 0);
  const epsg = numberValue(properties['proj:epsg'], 4326);
  const id = `earth-search-${item.id}`;
  const thumbnail = asset(item, 'thumbnail') ?? link(item, 'thumbnail') ?? '';
  const sourceUrl = asset(item, 'visual') ?? link(item, 'self') ?? '';
  const area = Math.max(1, Math.round(bboxAreaKm2(bbox)));

  return {
    id,
    productCode: item.id,
    productName: `Sentinel-2 ${captureTime} 公开影像`,
    productNameEn: `Sentinel-2 ${captureTime} Open Imagery`,
    satelliteId: 's2',
    satelliteName: 'Sentinel-2',
    provider: 'Copernicus / Element84',
    country: 'EU',
    countryZh: '欧盟',
    origin: 'intl',
    dataType: 'multispectral',
    captureTime,
    resolution: 10,
    cloudCover: Math.round(cloudCover * 10) / 10,
    area,
    bbox,
    priceType: 'free',
    unitPrice: 0,
    minArea: 0,
    deliveryTime: '即时下载',
    productLevel: 'L2A',
    processingLevel: 'L2',
    crs: `EPSG:${epsg}`,
    fileFormat: 'Cloud Optimized GeoTIFF',
    size: '按波段下载',
    license: 'Copernicus Sentinel Data',
    status: 'instant',
    category: 'archive',
    bands: '13 bands',
    incidence: 0,
    sunElevation,
    regionId: 'open-data',
    thumbnail,
    sourceUrl,
    purchaseType: 'instant',
    instantDelivery: true,
    deliveryDays: 0,
    availableServices: index % 2 === 0 ? ['change-detection', 'land-cover', 'time-series'] : ['land-cover'],
  };
}

export async function searchEarthSearch(input: EarthSearchInput): Promise<Product[]> {
  const body: Record<string, unknown> = STAC_GATEWAY_URL
    ? {
        bbox: input.bbox,
        datetime: input.datetime,
        cloudCoverMax: input.cloudCoverMax,
        limit: Math.min(input.limit ?? 60, 100),
      }
    : {
        collections: [EARTH_SEARCH_COLLECTION],
        bbox: input.bbox,
        limit: Math.min(input.limit ?? 60, 100),
      };
  if (!STAC_GATEWAY_URL && input.datetime) body.datetime = input.datetime;
  if (!STAC_GATEWAY_URL && input.cloudCoverMax != null) {
    body.query = { 'eo:cloud_cover': { lte: input.cloudCoverMax } };
  }

  const response = await fetch(STAC_GATEWAY_URL ? `${STAC_GATEWAY_URL}/search` : EARTH_SEARCH_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Earth Search returned ${response.status}`);

  const payload = (await response.json()) as StacSearchResponse;
  const products = (payload.features ?? [])
    .map((item, index) => normalizeItem(item, index))
    .filter((product): product is Product => product !== null);
  products.forEach((product) => remoteProducts.set(product.id, product));
  return products;
}

export function getRemoteProduct(id: string) {
  return remoteProducts.get(id);
}

/** Resolve an Earth Search product after a direct detail-page visit or refresh. */
export async function fetchRemoteProduct(id: string): Promise<Product | undefined> {
  const cached = remoteProducts.get(id);
  if (cached) return cached;

  const prefix = 'earth-search-';
  if (!id.startsWith(prefix)) return undefined;

  const itemId = id.slice(prefix.length);
  const response = await fetch(
    STAC_GATEWAY_URL
      ? `${STAC_GATEWAY_URL}/item/${encodeURIComponent(itemId)}`
      : `https://earth-search.aws.element84.com/v1/collections/${EARTH_SEARCH_COLLECTION}/items/${encodeURIComponent(itemId)}`,
  );
  if (!response.ok) return undefined;

  const item = (await response.json()) as StacItem;
  const product = normalizeItem(item, 0);
  if (product) remoteProducts.set(product.id, product);
  return product ?? undefined;
}
