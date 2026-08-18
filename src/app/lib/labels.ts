import type { Lang } from '../i18n';
import type { DataType, ProductStatus, PriceType } from '../data/products';

export const DATA_TYPE_LABEL: Record<DataType, { zh: string; en: string }> = {
  optical: { zh: '光学影像', en: 'Optical' },
  sar: { zh: 'SAR 雷达', en: 'SAR' },
  multispectral: { zh: '多光谱', en: 'Multispectral' },
  hyperspectral: { zh: '高光谱', en: 'Hyperspectral' },
  nightlight: { zh: '夜光数据', en: 'Night-light' },
  dem: { zh: 'DEM 高程', en: 'DEM' },
  video: { zh: '视频卫星', en: 'Video' },
};

export const STATUS_LABEL: Record<ProductStatus, { zh: string; en: string }> = {
  archive: { zh: '历史库存', en: 'Archive' },
  instant: { zh: '可立即购买', en: 'Instant' },
  inquiry: { zh: '需要询价', en: 'On request' },
  tasking: { zh: '支持定制拍摄', en: 'Tasking' },
};

export const PRICE_TYPE_LABEL: Record<PriceType, { zh: string; en: string }> = {
  fixed: { zh: '固定价格', en: 'Fixed' },
  estimated: { zh: '估算价格', en: 'Estimated' },
  inquiry: { zh: '需要询价', en: 'On request' },
  free: { zh: '免费', en: 'Free' },
};

export function pick(pair: { zh: string; en: string }, lang: Lang) {
  return pair[lang];
}
