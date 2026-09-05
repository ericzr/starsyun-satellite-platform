import type { Product, DataType, ProcessingLevel, ProductCategory, PriceType } from '../data/products';
import { bboxAreaKm2, type BBox } from '../lib/geo';

type CatalogProduct = {
  id: string;
  providerId: string;
  externalId: string;
  category: ProductCategory;
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

type CatalogResponse = { products?: CatalogProduct[] };

const API = '/api/catalog/products';
const DATA_TYPES: DataType[] = ['optical', 'sar', 'multispectral', 'hyperspectral', 'nightlight', 'dem', 'video'];
const LEVELS: ProcessingLevel[] = ['L1', 'L2', 'L3', 'L4'];
const CATEGORIES: ProductCategory[] = ['archive', 'tasking', 'analysis'];
const SERVICES = ['change-detection', 'land-cover', 'feature-extraction', 'time-series', 'custom-analysis'] as const;

function text(metadata: Record<string, unknown>, keys: string[], fallback = '') {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return fallback;
}

function number(metadata: Record<string, unknown>, keys: string[], fallback = 0) {
  for (const key of keys) {
    const value = Number(metadata[key]);
    if (Number.isFinite(value)) return value;
  }
  return fallback;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : fallback;
}

function productBbox(record: CatalogProduct): BBox {
  if (record.bbox?.length === 4 && record.bbox.every(Number.isFinite)) {
    return record.bbox as BBox;
  }
  const points: Array<[number, number]> = [];
  const walk = (value: unknown) => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
      points.push([value[0], value[1]]);
      return;
    }
    value.forEach(walk);
  };
  const geometry = record.geometry as { coordinates?: unknown } | undefined;
  walk(geometry?.coordinates);
  if (points.length) {
    const longitudes = points.map(([longitude]) => longitude);
    const latitudes = points.map(([, latitude]) => latitude);
    return [Math.min(...longitudes), Math.min(...latitudes), Math.max(...longitudes), Math.max(...latitudes)];
  }
  // Catalog records are required to carry geometry. A neutral fallback keeps a
  // malformed legacy record visible in the admin audit without crashing the UI.
  return [0, 0, 0.01, 0.01];
}

function dateOnly(value: unknown) {
  return typeof value === 'string' && value ? value.slice(0, 10) : '';
}

function mapCatalogProduct(record: CatalogProduct): Product {
  const metadata = record.metadata ?? {};
  const bbox = productBbox(record);
  const priceType = enumValue(record.priceMode, ['free', 'fixed', 'estimated', 'inquiry'] as const, 'inquiry' as PriceType);
  const category = enumValue(record.category, CATEGORIES, 'archive');
  const dataType = enumValue(metadata.dataType, DATA_TYPES, 'optical');
  const processingLevel = enumValue(metadata.processingLevel, LEVELS, 'L2');
  const area = Math.max(0.01, number(metadata, ['areaKm2', 'area'], Math.max(0.01, Math.round(bboxAreaKm2(bbox) * 100) / 100)));
  const price = typeof record.price === 'number' && Number.isFinite(record.price) ? record.price : 0;
  const explicitUnitPrice = number(metadata, ['unitPrice', 'unit_price'], NaN);
  const unitPrice = Number.isFinite(explicitUnitPrice)
    ? Math.max(0, explicitUnitPrice)
    : priceType === 'fixed' || priceType === 'estimated'
      ? price / area
      : 0;
  const sourceUrl = typeof record.sourceUrl === 'string' && /^https?:\/\//i.test(record.sourceUrl) ? record.sourceUrl : undefined;
  const thumbnail = text(metadata, ['thumbnail', 'thumbnailUrl', 'previewUrl', 'preview_url'], '');
  const serviceIds = Array.isArray(metadata.availableServices)
    ? metadata.availableServices.filter((service): service is (typeof SERVICES)[number] => typeof service === 'string' && SERVICES.includes(service as (typeof SERVICES)[number]))
    : undefined;
  const productName = text(metadata, ['productName', 'name', 'title'], record.externalId);
  const productNameEn = text(metadata, ['productNameEn', 'nameEn', 'titleEn'], productName);
  const provider = text(metadata, ['provider', 'providerName'], record.providerId);
  const country = text(metadata, ['country', 'countryCode'], '');
  const countryZh = text(metadata, ['countryZh', 'country_zh'], country);
  const purchaseType = category === 'archive' && (priceType === 'free' || priceType === 'fixed') && (priceType === 'free' ? sourceUrl != null : true)
    ? 'instant'
    : 'inquiry';

  return {
    id: `catalog-${record.id}`,
    productCode: record.externalId,
    productName,
    productNameEn,
    satelliteId: text(metadata, ['satelliteId', 'satellite_id'], record.providerId),
    satelliteName: text(metadata, ['satelliteName', 'satellite', 'constellation'], record.collection || record.providerId),
    provider,
    country,
    countryZh,
    origin: enumValue(metadata.origin, ['cn', 'intl'] as const, 'intl'),
    dataType,
    captureTime: dateOnly(record.captureTime ?? metadata.captureTime),
    resolution: Math.max(0, number(metadata, ['resolution', 'resolutionM', 'resolution_m'], 0)),
    cloudCover: Math.max(0, Math.min(100, number(metadata, ['cloudCover', 'cloud_cover'], 0))),
    area,
    bbox,
    priceType,
    unitPrice,
    minArea: Math.max(0, number(metadata, ['minArea', 'min_area'], 0)),
    deliveryTime: text(metadata, ['deliveryTime', 'delivery_time'], category === 'tasking' ? '按供应商 SLA' : '待确认'),
    productLevel: text(metadata, ['productLevel', 'product_level'], processingLevel),
    processingLevel,
    crs: text(metadata, ['crs', 'coordinateSystem'], 'EPSG:4326'),
    fileFormat: text(metadata, ['fileFormat', 'file_format'], 'GeoTIFF'),
    size: text(metadata, ['size', 'sizeGb'], '待确认'),
    license: record.license,
    status: category === 'tasking' ? 'tasking' : category === 'analysis' ? 'inquiry' : priceType === 'free' ? 'instant' : priceType === 'inquiry' ? 'inquiry' : 'archive',
    category,
    bands: text(metadata, ['bands', 'bandCount'], '-'),
    incidence: number(metadata, ['incidence', 'incidenceAngle'], 0),
    sunElevation: number(metadata, ['sunElevation', 'sun_elevation'], 0),
    regionId: text(metadata, ['regionId', 'region_id'], `catalog-${record.id}`),
    thumbnail,
    sourceUrl,
    purchaseType,
    instantDelivery: purchaseType === 'instant',
    deliveryDays: Math.max(0, Math.round(number(metadata, ['deliveryDays', 'delivery_days'], 0))),
    availableServices: serviceIds,
  };
}

export async function fetchCatalogProducts(options: { id?: string; category?: ProductCategory; limit?: number } = {}) {
  const params = new URLSearchParams({ limit: String(Math.min(options.limit ?? 100, 500)) });
  if (options.id) params.set('id', options.id);
  if (options.category) params.set('category', options.category);
  const response = await fetch(`${API}?${params.toString()}`, { headers: { Accept: 'application/json' }, credentials: 'include' });
  if (!response.ok) throw new Error(`Catalog request failed (${response.status})`);
  const payload = (await response.json()) as CatalogResponse;
  if (!Array.isArray(payload.products)) throw new Error('Catalog response is invalid');
  return payload.products.map(mapCatalogProduct);
}

/** Resolve a catalog product after a direct detail-page visit or refresh. */
export async function fetchCatalogProduct(id: string): Promise<Product | undefined> {
  if (!id.startsWith('catalog-')) return undefined;
  const products = await fetchCatalogProducts({ id: id.slice('catalog-'.length), limit: 1 });
  return products.find((product) => product.id === id);
}
