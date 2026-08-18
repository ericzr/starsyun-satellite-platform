import type { Product } from '../data/products';

// PRD §10: price = max(area, minArea) * unitPrice + processing fee.
// Unit prices are derived per resolution tier (CNY / km²).

export interface PriceBreakdown {
  billableArea: number;
  unitPrice: number;
  baseCost: number;
  processFee: number;
  total: number;
  isFree: boolean;
}

export type ProcessLevel = 'raw' | 'standard' | 'analysis';

const PROCESS_MULTIPLIER: Record<ProcessLevel, number> = {
  raw: 0,
  standard: 0.25,
  analysis: 0.6,
};

/** Base processing fee floor per level (CNY). */
const PROCESS_BASE: Record<ProcessLevel, number> = {
  raw: 0,
  standard: 800,
  analysis: 2000,
};

export function estimatePrice(
  product: Product,
  selectedArea: number,
  level: ProcessLevel = 'raw',
): PriceBreakdown {
  const isFree = product.priceType === 'free';
  const billableArea = Math.max(selectedArea || 0, product.minArea);
  const unitPrice = isFree ? 0 : product.unitPrice;
  const baseCost = billableArea * unitPrice;
  const processFee = isFree
    ? 0
    : PROCESS_BASE[level] + baseCost * PROCESS_MULTIPLIER[level];
  const total = baseCost + processFee;
  return { billableArea, unitPrice, baseCost, processFee, total, isFree };
}

export function fmtCny(v: number): string {
  if (v === 0) return '0';
  if (v >= 10000) return `${(v / 10000).toFixed(1)}万`;
  return v.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
}

export function fmtCnyEn(v: number): string {
  return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
}
