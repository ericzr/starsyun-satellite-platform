import { SATELLITES, Satellite } from './satellites';
import type { BBox } from '../lib/geo';

// Re-export Satellite type for external use
export type { Satellite };

export type DataType =
  | 'optical'
  | 'sar'
  | 'multispectral'
  | 'hyperspectral'
  | 'nightlight'
  | 'dem'
  | 'video';

export type PriceType = 'fixed' | 'estimated' | 'inquiry' | 'free';
export type ProductStatus = 'archive' | 'instant' | 'inquiry' | 'tasking';
export type PurchaseType = 'instant' | 'inquiry'; // instant: 标准化产品，可直接购买；inquiry: 需询价

// 新增：产品分类
export type ProductCategory = 'archive' | 'tasking' | 'analysis';

// 新增：标准处理级别
export type ProcessingLevel = 'L1' | 'L2' | 'L3' | 'L4';

// 新增：增值服务类型
export type ValueAddedService =
  | 'change-detection'      // 变化检测
  | 'land-cover'           // 地物分类
  | 'feature-extraction'   // 目标提取
  | 'time-series'          // 时间序列分析
  | 'custom-analysis';     // 定制分析

export interface ValueAddedServiceInfo {
  id: ValueAddedService;
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
  priceRange: [number, number]; // [min, max] in CNY
  deliveryDays: number;
  icon: string;
}

export const VALUE_ADDED_SERVICES: ValueAddedServiceInfo[] = [
  {
    id: 'change-detection',
    name: '变化检测',
    nameEn: 'Change Detection',
    description: '对比两期影像，识别地表变化区域并生成变化图和统计报表',
    descriptionEn: 'Compare two-period images to identify surface changes',
    priceRange: [5000, 50000],
    deliveryDays: 5,
    icon: 'GitCompare',
  },
  {
    id: 'land-cover',
    name: '地物分类',
    nameEn: 'Land Cover Classification',
    description: '识别并分类土地利用类型，生成分类图和面积统计',
    descriptionEn: 'Identify and classify land use types',
    priceRange: [8000, 80000],
    deliveryDays: 7,
    icon: 'Layers',
  },
  {
    id: 'feature-extraction',
    name: '目标提取',
    nameEn: 'Feature Extraction',
    description: '自动识别和提取建筑物、道路、车辆等目标对象',
    descriptionEn: 'Automatically detect buildings, roads, vehicles',
    priceRange: [10000, 100000],
    deliveryDays: 7,
    icon: 'Target',
  },
  {
    id: 'time-series',
    name: '时间序列分析',
    nameEn: 'Time Series Analysis',
    description: '基于多期影像进行趋势分析和预测建模',
    descriptionEn: 'Trend analysis and predictive modeling',
    priceRange: [20000, 200000],
    deliveryDays: 10,
    icon: 'TrendingUp',
  },
  {
    id: 'custom-analysis',
    name: '定制分析',
    nameEn: 'Custom Analysis',
    description: '根据您的需求提供专业的遥感分析服务和报告',
    descriptionEn: 'Professional remote sensing analysis service',
    priceRange: [50000, 500000],
    deliveryDays: 15,
    icon: 'Settings',
  },
];

export interface Region {
  id: string;
  name: string;
  nameEn: string;
  center: [number, number]; // lon, lat
  zoom: number;
  aliases: string[];
}

export const REGIONS: Region[] = [
  { id: 'dubai', name: '迪拜 · 杰贝阿里港', nameEn: 'Jebel Ali Port, Dubai', center: [55.027, 25.011], zoom: 12, aliases: ['dubai', '迪拜', 'jebel ali', 'jebel ali port', '杰贝阿里'] },
  { id: 'shanghai', name: '上海 · 浦东', nameEn: 'Shanghai Pudong', center: [121.545, 31.221], zoom: 11, aliases: ['shanghai', '上海', 'pudong', '浦东', '浦东机场'] },
  { id: 'shenzhen', name: '深圳', nameEn: 'Shenzhen', center: [114.058, 22.543], zoom: 11, aliases: ['shenzhen', '深圳'] },
  { id: 'beijing', name: '北京', nameEn: 'Beijing', center: [116.407, 39.904], zoom: 11, aliases: ['beijing', '北京'] },
  { id: 'ordos', name: '鄂尔多斯 · 矿区', nameEn: 'Ordos Mining Area', center: [109.781, 39.608], zoom: 11, aliases: ['ordos', '鄂尔多斯', '矿区'] },
  { id: 'riyadh', name: '利雅得', nameEn: 'Riyadh', center: [46.675, 24.713], zoom: 11, aliases: ['riyadh', '利雅得'] },
  { id: 'singapore', name: '新加坡', nameEn: 'Singapore', center: [103.851, 1.29], zoom: 11, aliases: ['singapore', '新加坡'] },
  { id: 'jakarta', name: '雅加达', nameEn: 'Jakarta', center: [106.845, -6.208], zoom: 11, aliases: ['jakarta', '雅加达'] },
  { id: 'nairobi', name: '内罗毕', nameEn: 'Nairobi', center: [36.817, -1.286], zoom: 11, aliases: ['nairobi', '内罗毕'] },
  { id: 'saopaulo', name: '圣保罗', nameEn: 'São Paulo', center: [-46.633, -23.55], zoom: 11, aliases: ['sao paulo', 'são paulo', '圣保罗'] },
];

export interface Product {
  id: string;
  productCode: string;
  productName: string;
  productNameEn: string;
  satelliteId: string;
  satelliteName: string;
  provider: string;
  country: string;
  countryZh: string;
  origin: 'cn' | 'intl';
  dataType: DataType;
  captureTime: string; // ISO date
  resolution: number; // meters
  cloudCover: number; // %
  area: number; // km² of the scene
  bbox: BBox;
  priceType: PriceType;
  unitPrice: number; // CNY/km²
  minArea: number; // km²
  deliveryTime: string;
  productLevel: string; // 保留原始字段用于显示
  processingLevel: ProcessingLevel; // 新增：标准化处理级别
  crs: string;
  fileFormat: string;
  size: string;
  license: string;
  status: ProductStatus;
  category: ProductCategory; // 新增：产品分类
  bands: string;
  incidence: number;
  sunElevation: number;
  regionId: string;
  thumbnail: string;
  /** Direct public asset or catalog URL for open-data products. */
  sourceUrl?: string;
  purchaseType: PurchaseType; // 购买方式
  instantDelivery?: boolean; // 是否支持即时交付
  deliveryDays: number; // 新增：交付天数
  availableServices?: ValueAddedService[]; // 新增：可用增值服务
}

const THUMBS = [
  'https://images.unsplash.com/photo-1722082839841-45473f5a15cf?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800',
  'https://images.unsplash.com/photo-1665150923067-d63a06446d8c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800',
  'https://images.unsplash.com/photo-1722083854825-8f376783b9de?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800',
  'https://images.unsplash.com/photo-1722082839833-04f0094ea4ec?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800',
  'https://images.unsplash.com/photo-1542382235-7a38b6ec0289?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800',
  'https://images.unsplash.com/photo-1722082840073-909aea44803f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800',
  'https://images.unsplash.com/photo-1542382248-cc0aa645262c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800',
  'https://images.unsplash.com/photo-1722080767360-f0640ae8ce2f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800',
  'https://images.unsplash.com/photo-1581922819941-6ab31ab79afc?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800',
  'https://images.unsplash.com/photo-1722083854765-af9479cef050?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800',
  'https://images.unsplash.com/photo-1769251971680-005dfa536f07?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800',
  'https://images.unsplash.com/photo-1721413058496-bf42624ccf1c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800',
];

// Deterministic pseudo-random generator so the mock dataset is stable.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function unitPriceForRes(res: number): number {
  if (res <= 0.3) return 100 + Math.round(res * 400);
  if (res <= 0.5) return 50 + Math.round(res * 200);
  if (res <= 1) return 20 + Math.round(res * 40);
  if (res <= 5) return 5 + Math.round(res * 3);
  if (res <= 10) return 5;
  return 0; // free open data
}

const LEVELS = ['L1B', 'L1C', 'L2A', 'L3'];
const LICENSES = { zh: ['单次授权', '企业授权', '内部使用', '公开许可'] };

function makeProduct(sat: Satellite, region: Region, rnd: () => number, idx: number): Product {
  // scene bbox around region center
  const w = 0.06 + rnd() * 0.14;
  const h = 0.05 + rnd() * 0.12;
  const dx = (rnd() - 0.5) * 0.16;
  const dy = (rnd() - 0.5) * 0.14;
  const [clon, clat] = region.center;
  const bbox: BBox = [clon + dx - w / 2, clat + dy - h / 2, clon + dx + w / 2, clat + dy + h / 2];

  // resolution near the satellite's best, sometimes coarser
  const resTiers = [sat.bestResolution, sat.bestResolution * 1.5, sat.bestResolution * 2];
  const resolution = Math.round(resTiers[Math.floor(rnd() * resTiers.length)] * 100) / 100;

  const daysAgo = Math.floor(rnd() * 400);
  const capture = new Date(Date.now() - daysAgo * 86400000);
  const cloudCover = sat.type === 'sar' ? 0 : Math.floor(rnd() * 35);
  const unitPrice = unitPriceForRes(resolution);
  const isFree = unitPrice === 0;

  let priceType: PriceType = isFree ? 'free' : resolution <= 0.5 ? 'inquiry' : 'estimated';
  if (!isFree && rnd() > 0.7) priceType = 'estimated';

  const areaKm2 = 60 + Math.floor(rnd() * 400);
  const minArea = resolution <= 0.5 ? 25 : resolution <= 1 ? 10 : 5;

  const bandsMap: Record<string, string> = {
    optical: 'R/G/B/NIR',
    multispectral: '4-8 bands',
    hyperspectral: '100+ bands',
    sar: 'X / C-band',
    video: 'RGB',
    dem: '-',
    nightlight: 'PAN',
  };

  // 确定产品分类（主要维度）
  const category: ProductCategory =
    rnd() > 0.85 ? 'tasking' : // 15% 任务拍摄
    rnd() > 0.95 ? 'analysis' : // 5% 分析服务
    'archive'; // 80% 历史存档

  // 基于 category 确定 status（保留用于内部逻辑）
  const status: ProductStatus =
    category === 'tasking' ? 'tasking' :
    category === 'analysis' ? 'inquiry' :
    isFree ? 'instant' :
    priceType === 'inquiry' ? 'inquiry' :
    rnd() > 0.5 ? 'archive' : 'instant';

  // 标准化产品：价格明确、现货或快速交付、分辨率>0.5m
  const purchaseType: PurchaseType =
    category === 'analysis' ? 'inquiry' : // 分析服务需要询价
    category === 'tasking' ? 'inquiry' : // 任务拍摄需要询价
    priceType !== 'inquiry' && resolution > 0.5 && status !== 'inquiry'
      ? 'instant'
      : 'inquiry';

  const instantDelivery = status === 'instant' && purchaseType === 'instant';

  // 确定处理级别
  const processingLevel: ProcessingLevel =
    resolution <= 0.5 ? 'L3' : // 高分辨率产品通常是L3
    resolution <= 1 ? 'L2' :
    resolution <= 5 ? 'L2' :
    'L1';

  // 交付天数（基于 category）
  const deliveryDays =
    category === 'tasking' ? Math.floor(7 + rnd() * 23) : // 任务拍摄：7-30天
    category === 'analysis' ? Math.floor(5 + rnd() * 10) : // 分析服务：5-15天
    category === 'archive' && status === 'instant' ? Math.floor(1 + rnd() * 2) : // 存档即时：1-2天
    Math.floor(3 + rnd() * 4); // 存档标准：3-6天

  // 可用增值服务
  const availableServices: ValueAddedService[] = [];
  if (sat.type !== 'video') {
    availableServices.push('change-detection');
  }
  if (sat.type === 'multispectral') {
    availableServices.push('land-cover');
  }
  if (resolution <= 1) {
    availableServices.push('feature-extraction');
  }
  if (availableServices.length > 0) {
    availableServices.push('time-series', 'custom-analysis');
  }

  return {
    id: `${sat.id}-${region.id}-${idx}`,
    productCode: `OD-${sat.id.toUpperCase()}-${(1000 + idx).toString()}`,
    productName: `${sat.name} ${region.name} 影像`,
    productNameEn: `${sat.name} ${region.nameEn} Scene`,
    satelliteId: sat.id,
    satelliteName: sat.name,
    provider: sat.provider,
    country: sat.country,
    countryZh: sat.countryZh,
    origin: sat.origin,
    dataType: sat.type,
    captureTime: capture.toISOString().slice(0, 10),
    resolution,
    cloudCover,
    area: areaKm2,
    bbox,
    priceType,
    unitPrice,
    minArea,
    deliveryTime: category === 'tasking' ? '7–30 天' : category === 'analysis' ? '5–15 天' : deliveryDays <= 2 ? '1–2 天' : '3–6 天',
    productLevel: LEVELS[Math.floor(rnd() * LEVELS.length)],
    processingLevel,
    category,
    crs: 'EPSG:4326 / UTM',
    fileFormat: sat.type === 'sar' ? 'GeoTIFF / CEOS' : 'GeoTIFF',
    size: `${(0.5 + rnd() * 8).toFixed(1)} GB`,
    license: LICENSES.zh[Math.floor(rnd() * LICENSES.zh.length)],
    status,
    bands: bandsMap[sat.type] ?? '-',
    incidence: Math.round(rnd() * 30),
    sunElevation: 30 + Math.floor(rnd() * 50),
    regionId: region.id,
    thumbnail: THUMBS[(idx + region.id.length) % THUMBS.length],
    purchaseType,
    instantDelivery,
    deliveryDays,
    availableServices: availableServices.length > 0 ? availableServices : undefined,
  };
}

function generateProducts(): Product[] {
  const rnd = mulberry32(20260724);
  const out: Product[] = [];
  let idx = 0;
  for (const region of REGIONS) {
    // 10–14 products per region
    const count = 10 + Math.floor(rnd() * 5);
    for (let i = 0; i < count; i++) {
      const sat = SATELLITES[Math.floor(rnd() * SATELLITES.length)];
      out.push(makeProduct(sat, region, rnd, idx++));
    }
  }
  return out;
}

export const PRODUCTS: Product[] = generateProducts();

export function getProduct(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}
