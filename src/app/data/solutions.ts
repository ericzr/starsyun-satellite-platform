export interface Solution {
  id: string;
  name: string;
  nameEn: string;
  icon: string; // lucide icon name
  features: string[];
  featuresEn: string[];
}

export const SOLUTIONS: Solution[] = [
  {
    id: 'forestry',
    name: '林业监测',
    nameEn: 'Forestry',
    icon: 'Trees',
    features: ['林地变化', '盗伐识别', '火灾监测', '病虫害分析'],
    featuresEn: ['Forest change', 'Illegal logging', 'Fire monitoring', 'Pest analysis'],
  },
  {
    id: 'agriculture',
    name: '农业监测',
    nameEn: 'Agriculture',
    icon: 'Sprout',
    features: ['作物分类', '长势监测', '种植面积统计', '估产分析'],
    featuresEn: ['Crop classification', 'Growth monitoring', 'Acreage stats', 'Yield estimate'],
  },
  {
    id: 'mining',
    name: '矿区监测',
    nameEn: 'Mining',
    icon: 'Mountain',
    features: ['越界开采', '矿区扩张', '堆料体积估算', '生态修复评估'],
    featuresEn: ['Illegal mining', 'Mine expansion', 'Stockpile volume', 'Restoration'],
  },
  {
    id: 'railway',
    name: '铁路与基础设施',
    nameEn: 'Rail & Infrastructure',
    icon: 'TrainFront',
    features: ['沿线施工识别', '地灾风险监测', '违建识别', '周期巡检'],
    featuresEn: ['Trackside works', 'Geohazard risk', 'Encroachment', 'Periodic patrol'],
  },
  {
    id: 'energy',
    name: '能源监测',
    nameEn: 'Energy',
    icon: 'Zap',
    features: ['光伏电站识别', '油气设施监测', '管线周边变化', '建设进度'],
    featuresEn: ['PV plant detection', 'Oil & gas assets', 'Pipeline change', 'Build progress'],
  },
  {
    id: 'disaster',
    name: '灾害应急',
    nameEn: 'Disaster Response',
    icon: 'Waves',
    features: ['洪水范围', '滑坡识别', '灾损评估', '道路中断分析'],
    featuresEn: ['Flood extent', 'Landslide', 'Damage assessment', 'Road disruption'],
  },
];

export interface AnalysisService {
  id: string;
  name: string;
  nameEn: string;
  price: string;
}

export const ANALYSIS_SERVICES: AnalysisService[] = [
  { id: 'building', name: '建筑物提取', nameEn: 'Building extraction', price: '5–20 元/km²' },
  { id: 'newbuilding', name: '新增建筑检测', nameEn: 'New building detection', price: '5–30 元/km²' },
  { id: 'road', name: '道路提取', nameEn: 'Road extraction', price: '8–30 元/km²' },
  { id: 'water', name: '水体提取', nameEn: 'Water extraction', price: '1–5 元/km²' },
  { id: 'change', name: '变化检测', nameEn: 'Change detection', price: '5–30 元/km²' },
  { id: 'vegetation', name: '植被覆盖分析', nameEn: 'Vegetation cover', price: '3–15 元/km²' },
  { id: 'flood', name: '洪水范围提取', nameEn: 'Flood mapping', price: '10–40 元/km²' },
  { id: 'ship', name: '船舶识别', nameEn: 'Ship detection', price: '10–50 元/km²' },
];
