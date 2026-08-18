import { CloudSun, Ruler, CalendarDays, Layers, GitCompare, ShoppingCart, Clock, Archive, Satellite, BarChart3, ExternalLink } from 'lucide-react';
import type { Product } from '../data/products';
import { useI18n } from '../i18n';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { cn } from './ui/utils';
import { DATA_TYPE_LABEL, PRICE_TYPE_LABEL, pick } from '../lib/labels';
import { fmtCny } from '../lib/pricing';

interface ResultCardProps {
  product: Product;
  coverage?: number; // 0..1, undefined when no AOI drawn
  active?: boolean;
  inCompare?: boolean;
  onDetail: () => void;
  onCompare: () => void;
  onInquire: () => void;
  onBuy?: () => void;
  onHover?: (hovering: boolean) => void;
}

export function ResultCard({
  product,
  coverage,
  active,
  inCompare,
  onDetail,
  onCompare,
  onInquire,
  onBuy,
  onHover,
}: ResultCardProps) {
  const { t, lang } = useI18n();
  const priceLabel =
    product.priceType === 'free'
      ? t.common.free
      : product.priceType === 'inquiry'
        ? t.common.needInquiry
        : `${product.unitPrice} ${lang === 'zh' ? t.common.perSqkm : 'CNY/km²'}`;

  const isInstantPurchase = product.purchaseType === 'instant';
  const isOpenData = Boolean(product.sourceUrl);

  // 产品类型图标和标签
  const categoryConfig = {
    archive: {
      icon: Archive,
      label: lang === 'zh' ? '存档' : 'Archive',
      labelEn: 'Archive',
      variant: 'default' as const,
    },
    tasking: {
      icon: Satellite,
      label: lang === 'zh' ? '任务' : 'Tasking',
      labelEn: 'Tasking',
      variant: 'secondary' as const,
    },
    analysis: {
      icon: BarChart3,
      label: lang === 'zh' ? '分析' : 'Analysis',
      labelEn: 'Analysis',
      variant: 'outline' as const,
    },
  };

  const categoryInfo = categoryConfig[product.category];
  const CategoryIcon = categoryInfo.icon;

  // 处理级别标签
  const processingLevelLabel = {
    L1: lang === 'zh' ? 'L1 原始' : 'L1 Raw',
    L2: lang === 'zh' ? 'L2 标准' : 'L2 Standard',
    L3: lang === 'zh' ? 'L3 正射' : 'L3 Ortho',
    L4: lang === 'zh' ? 'L4 分析' : 'L4 Analysis',
  };

  return (
    <div
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      className={cn(
        'group overflow-hidden rounded-lg border bg-card transition-all',
        active ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-primary/50',
      )}
    >
      <div className="flex gap-3 p-3">
        <div className="relative size-20 shrink-0 overflow-hidden rounded-md bg-secondary">
          <ImageWithFallback
            src={product.thumbnail}
            alt={product.satelliteName}
            className="size-full object-cover"
          />
          <span className="absolute left-1 top-1 rounded bg-black/60 px-1 py-0.5 font-mono text-[10px] text-white">
            {product.resolution}m
          </span>
          <Badge
            variant="secondary"
            className="absolute bottom-1 left-1 h-auto gap-0.5 px-1 py-0.5 text-[9px]"
          >
            <CategoryIcon className="size-2.5" />
            {categoryInfo.label}
          </Badge>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{product.satelliteName}</div>
              <div className="truncate font-mono text-[11px] text-muted-foreground">
                {product.productCode}
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              <Badge variant="outline" className="tech-label h-auto px-1.5 py-0.5 text-[9px]">
                {processingLevelLabel[product.processingLevel]}
              </Badge>
              <Badge variant="outline" className="tech-label h-auto px-1.5 py-0.5 text-[9px]">
                {pick(DATA_TYPE_LABEL[product.dataType], lang)}
              </Badge>
            </div>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <CalendarDays className="size-3" /> {product.captureTime}
            </span>
            <span className="flex items-center gap-1">
              <CloudSun className="size-3" /> {product.cloudCover}%
            </span>
            <span className="flex items-center gap-1">
              <Ruler className="size-3" /> {product.resolution}m
            </span>
            <span className="flex items-center gap-1">
              <Layers className="size-3" />{' '}
              {coverage != null
                ? `${(coverage * 100).toFixed(0)}% ${t.common.coverage}`
                : `${product.area} ${lang === 'zh' ? '平方公里' : 'km²'}`}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2">
        <div className="min-w-0 flex-shrink">
          <div
            className={cn(
              'truncate font-mono text-sm',
              product.priceType === 'inquiry' ? 'text-warning' : 'text-foreground',
            )}
          >
            {priceLabel}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span>{lang === 'zh' ? product.countryZh : product.country}</span>
            <span>•</span>
            <span className="flex items-center gap-0.5">
              <Clock className="size-2.5" />
              {product.deliveryDays}{lang === 'zh' ? '天' : 'd'}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant={inCompare ? 'secondary' : 'ghost'}
            size="icon"
            className="size-8"
            title={t.common.addCompare}
            onClick={onCompare}
          >
            <GitCompare className="size-3.5" />
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onDetail}>
            {t.common.viewDetail}
          </Button>
          {isOpenData ? (
            <Button asChild size="sm" className="h-8 gap-1 text-xs">
              <a href={product.sourceUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-3.5" />
                {lang === 'zh' ? '打开数据' : 'Open data'}
              </a>
            </Button>
          ) : isInstantPurchase ? (
            <Button size="sm" className="h-8 gap-1 text-xs" onClick={onBuy}>
              <ShoppingCart className="size-3.5" />
              {lang === 'zh' ? '立即购买' : 'Buy Now'}
            </Button>
          ) : (
            <Button size="sm" className="h-8 text-xs" onClick={onInquire}>
              {t.common.inquireNow}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
