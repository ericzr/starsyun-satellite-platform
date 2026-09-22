import { CalendarDays, RotateCcw } from 'lucide-react';
import { useI18n } from '../i18n';
import { useRef } from 'react';
import {
  VALUE_ADDED_SERVICES,
  type DataType,
  type ProductCategory,
  type ProcessingLevel,
  type ValueAddedService,
} from '../data/products';
import { DATA_TYPE_LABEL, pick } from '../lib/labels';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { cn } from './ui/utils';
import { Slider } from './ui/slider';
import { CaptureTimezone } from './CaptureTimezone';
import { todayInTimeZone } from '../lib/capture-window';

export interface Filters {
  dataTypes: DataType[];
  categories: ProductCategory[];
  processingLevels: ProcessingLevel[];
  dateStart?: string; // 开始日期 (YYYY-MM-DD)
  dateEnd?: string; // 结束日期 (YYYY-MM-DD)
  captureTimeZone?: string;
  resMode: 'preset' | 'range'; // 分辨率筛选模式
  resMax: string; // '0.5' | '1' | '3' | '10' | 'all'
  resMin?: number; // 最小分辨率 (meters)
  resMaxCustom?: number; // 最大分辨率 (meters)
  cloudMax: number; // 最大云量百分比，100 表示不限
  offNadirMax: number; // 最大侧摆角，60 表示不限
  deliveryMode?: 'all' | 'instant' | 'inquiry';
  deliveryMaxDays?: number;
  analysisService?: ValueAddedService;
}

export const DEFAULT_FILTERS: Filters = {
  dataTypes: [],
  categories: [],
  processingLevels: [],
  dateStart: undefined,
  dateEnd: undefined,
  resMode: 'preset',
  resMax: 'all',
  resMin: undefined,
  resMaxCustom: undefined,
  cloudMax: 100,
  offNadirMax: 60,
  deliveryMode: 'all',
  deliveryMaxDays: undefined,
  analysisService: undefined,
};

const DATA_TYPE_OPTS: DataType[] = [
  'optical',
  'multispectral',
  'hyperspectral',
  'sar',
  'nightlight',
  'dem',
  'video',
];
const CATEGORY_OPTS: ProductCategory[] = ['archive', 'tasking', 'analysis'];
const PROCESSING_LEVEL_OPTS: ProcessingLevel[] = ['L1', 'L2', 'L3', 'L4'];
const TASKING_DATA_TYPE_OPTS: DataType[] = ['optical', 'sar'];

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-md border px-2.5 py-1 text-xs transition-colors',
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function DateField({
  value,
  placeholder,
  ariaLabel,
  min,
  onChange,
}: {
  value?: string;
  placeholder: string;
  ariaLabel: string;
  min?: string;
  onChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const openPicker = () => inputRef.current?.showPicker?.();
  return (
    <div className="relative h-9 w-full">
      <button
        type="button"
        className="pointer-events-none absolute inset-0 flex h-9 w-full items-center justify-between rounded-md border border-border bg-background px-3 py-1 text-left text-xs shadow-sm"
        tabIndex={-1}
      >
        <span className={value ? 'text-foreground' : 'text-muted-foreground'}>
          {value || placeholder}
        </span>
        <CalendarDays className="size-3.5 text-muted-foreground" />
      </button>
      <input
        ref={inputRef}
        type="date"
        min={min}
        value={value || ''}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value)}
        onClick={openPicker}
        className="absolute inset-0 z-10 h-9 w-full cursor-pointer opacity-0"
      />
    </div>
  );
}

export function FilterPanel({
  filters,
  onChange,
  onApply,
  onReset,
  isQuerying = false,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  onApply: () => void;
  onReset: () => void;
  isQuerying?: boolean;
}) {
  const { t, lang } = useI18n();

  // Product category is intentionally single-select. The array remains in the
  // filter contract so existing deep links and query logic stay compatible.
  const categoryLabels: Record<ProductCategory, { zh: string; en: string }> = {
    archive: { zh: '历史存档', en: 'Archive' },
    tasking: { zh: '任务拍摄', en: 'Tasking' },
    analysis: { zh: '分析服务', en: 'Analysis' },
  };

  // 处理级别标签
  const processingLevelLabels: Record<ProcessingLevel, { zh: string; en: string }> = {
    L1: { zh: 'L1 原始', en: 'L1 Raw' },
    L2: { zh: 'L2 标准', en: 'L2 Standard' },
    L3: { zh: 'L3 正射', en: 'L3 Ortho' },
    L4: { zh: 'L4 分析', en: 'L4 Analysis' },
  };

  const category = filters.categories[0] ?? 'all';
  const dataTypeOptions = category === 'tasking' ? TASKING_DATA_TYPE_OPTS : DATA_TYPE_OPTS;
  const taskingMinDate =
    category === 'tasking' ? todayInTimeZone(filters.captureTimeZone ?? 'UTC') : undefined;
  const serviceLabels: Record<ValueAddedService, { zh: string; en: string }> = {
    'change-detection': {
      zh: t.explore.analysisServiceChange,
      en: t.explore.analysisServiceChange,
    },
    'land-cover': {
      zh: t.explore.analysisServiceLandCover,
      en: t.explore.analysisServiceLandCover,
    },
    'feature-extraction': {
      zh: t.explore.analysisServiceFeature,
      en: t.explore.analysisServiceFeature,
    },
    'time-series': {
      zh: t.explore.analysisServiceTimeSeries,
      en: t.explore.analysisServiceTimeSeries,
    },
    'custom-analysis': { zh: t.explore.analysisServiceCustom, en: t.explore.analysisServiceCustom },
  };

  const setCategory = (value: string) => {
    const nextCategory = value === 'all' ? undefined : (value as ProductCategory);
    const captureTimeZone =
      nextCategory === 'tasking' ? (filters.captureTimeZone ?? 'UTC') : undefined;
    const minDate = nextCategory === 'tasking' ? todayInTimeZone(captureTimeZone!) : undefined;
    const dateStart =
      minDate && filters.dateStart && filters.dateStart < minDate ? minDate : filters.dateStart;
    const dateEnd =
      minDate && filters.dateEnd && filters.dateEnd < minDate ? minDate : filters.dateEnd;
    onChange({
      ...filters,
      categories: nextCategory ? [nextCategory] : [],
      deliveryMode: nextCategory === 'archive' ? (filters.deliveryMode ?? 'all') : 'all',
      deliveryMaxDays: nextCategory === 'tasking' ? filters.deliveryMaxDays : undefined,
      analysisService: nextCategory === 'analysis' ? filters.analysisService : undefined,
      captureTimeZone,
      dateStart,
      dateEnd: dateStart && dateEnd && dateEnd < dateStart ? dateStart : dateEnd,
    });
  };

  const dateLabel =
    category === 'tasking'
      ? t.explore.taskingDate
      : category === 'analysis'
        ? t.explore.analysisDate
        : t.explore.fltTime;

  return (
    <div className="flex h-full min-h-0 flex-col bg-panel">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <div className="flex items-center justify-between">
          <h3 className="tech-label text-xs text-muted-foreground">{t.explore.filters}</h3>
        </div>

        {/* Product type */}
        <div className="space-y-2">
          <Label className="text-xs">{t.explore.fltProductType}</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.explore.productTypeAll}</SelectItem>
              {CATEGORY_OPTS.map((c) => (
                <SelectItem key={c} value={c}>
                  {lang === 'zh' ? categoryLabels[c].zh : categoryLabels[c].en}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Shared imagery conditions. These remain available for archive and tasking. */}
        <div className="space-y-4 border-t border-border pt-4">
          <Label className="text-xs text-muted-foreground">{t.explore.sharedImageFilters}</Label>

          <div className="space-y-2">
            <Label className="text-xs">
              {category === 'tasking'
                ? lang === 'zh'
                  ? '成像方式'
                  : 'Imaging mode'
                : t.explore.fltDataType}
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {dataTypeOptions.map((d) => (
                <Chip
                  key={d}
                  active={filters.dataTypes.includes(d)}
                  onClick={() =>
                    onChange({
                      ...filters,
                      // A product has one primary acquisition modality. Clicking the active option clears it.
                      dataTypes: filters.dataTypes.includes(d) ? [] : [d],
                    })
                  }
                >
                  {pick(DATA_TYPE_LABEL[d], lang)}
                </Chip>
              ))}
            </div>
          </div>

          {/* Processing level is a single product property; tasking output level is agreed in the quote. */}
          {category !== 'tasking' && (
            <div className="space-y-2">
              <Label className="text-xs">{lang === 'zh' ? '处理级别' : 'Processing Level'}</Label>
              <div className="flex flex-wrap gap-1.5">
                {PROCESSING_LEVEL_OPTS.map((p) => (
                  <Chip
                    key={p}
                    active={filters.processingLevels.includes(p)}
                    onClick={() =>
                      onChange({
                        ...filters,
                        processingLevels: filters.processingLevels.includes(p) ? [] : [p],
                      })
                    }
                  >
                    {lang === 'zh' ? processingLevelLabels[p].zh : processingLevelLabels[p].en}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          {/* Time */}
          <div className="space-y-2">
            <Label className="text-xs">{dateLabel}</Label>
            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">
                  {lang === 'zh' ? '开始日期' : 'Start date'}
                </Label>
                <DateField
                  value={filters.dateStart}
                  placeholder={lang === 'zh' ? '年 / 月 / 日' : 'YYYY / MM / DD'}
                  ariaLabel={lang === 'zh' ? '开始日期' : 'Start date'}
                  onChange={(value) =>
                    (() => {
                      const start =
                        category === 'tasking' && taskingMinDate && value < taskingMinDate
                          ? taskingMinDate
                          : value;
                      return onChange({
                        ...filters,
                        dateStart: start,
                        dateEnd:
                          filters.dateEnd && filters.dateEnd >= start ? filters.dateEnd : start,
                      });
                    })()
                  }
                  min={category === 'tasking' ? taskingMinDate : undefined}
                />
              </div>
              <span className="pb-2 text-xs text-muted-foreground">—</span>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">
                  {lang === 'zh' ? '结束日期' : 'End date'}
                </Label>
                <DateField
                  value={filters.dateEnd}
                  placeholder={lang === 'zh' ? '年 / 月 / 日' : 'YYYY / MM / DD'}
                  ariaLabel={lang === 'zh' ? '结束日期' : 'End date'}
                  onChange={(value) =>
                    (() => {
                      const start =
                        filters.dateStart ||
                        (category === 'tasking' && taskingMinDate ? taskingMinDate : value);
                      const minEnd =
                        category === 'tasking' && taskingMinDate
                          ? start > taskingMinDate
                            ? start
                            : taskingMinDate
                          : start;
                      return onChange({
                        ...filters,
                        dateStart: start,
                        dateEnd: value < minEnd ? minEnd : value,
                      });
                    })()
                  }
                  min={
                    category === 'tasking'
                      ? filters.dateStart && taskingMinDate && filters.dateStart > taskingMinDate
                        ? filters.dateStart
                        : taskingMinDate
                      : undefined
                  }
                />
              </div>
            </div>
          </div>

          {category === 'tasking' && (
            <CaptureTimezone
              value={filters.captureTimeZone ?? 'UTC'}
              onChange={(captureTimeZone) => {
                const minDate = todayInTimeZone(captureTimeZone);
                const start =
                  filters.dateStart && filters.dateStart >= minDate ? filters.dateStart : minDate;
                const end = filters.dateEnd && filters.dateEnd >= start ? filters.dateEnd : start;
                onChange({ ...filters, captureTimeZone, dateStart: start, dateEnd: end });
              }}
            />
          )}

          {/* Resolution */}
          <div className="space-y-2">
            <Label className="text-xs">{t.explore.fltResolution}</Label>
            <Select
              value={filters.resMode === 'range' ? 'custom' : filters.resMax}
              onValueChange={(v) => {
                if (v === 'custom')
                  onChange({ ...filters, resMode: 'range', resMaxCustom: filters.resMaxCustom });
                else
                  onChange({
                    ...filters,
                    resMode: 'preset',
                    resMax: v,
                    resMin: undefined,
                    resMaxCustom: undefined,
                  });
              }}
            >
              <SelectTrigger className="h-9 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.common.all}</SelectItem>
                <SelectItem value="0.3">
                  ≤ 0.3m ({lang === 'zh' ? '超高分' : 'Ultra-High'})
                </SelectItem>
                <SelectItem value="0.5">≤ 0.5m ({lang === 'zh' ? '高分' : 'High'})</SelectItem>
                <SelectItem value="1">≤ 1m ({lang === 'zh' ? '中高分' : 'Medium-High'})</SelectItem>
                <SelectItem value="2.5">≤ 2.5m ({lang === 'zh' ? '中分' : 'Medium'})</SelectItem>
                <SelectItem value="5">≤ 5m</SelectItem>
                <SelectItem value="10">≤ 10m</SelectItem>
                <SelectItem value="30">≤ 30m ({lang === 'zh' ? '低分' : 'Low'})</SelectItem>
                <SelectItem value="custom">
                  {lang === 'zh' ? '自定义精度' : 'Custom resolution'}
                </SelectItem>
              </SelectContent>
            </Select>

            {filters.resMode === 'range' && (
              <div className="space-y-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">
                    {lang === 'zh' ? '最高分辨率 (m)' : 'Maximum resolution (m)'}
                  </Label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    placeholder={lang === 'zh' ? '例如: 1.0' : 'e.g. 1.0'}
                    value={filters.resMaxCustom ?? ''}
                    onChange={(e) =>
                      onChange({
                        ...filters,
                        resMaxCustom: e.target.value ? parseFloat(e.target.value) : undefined,
                      })
                    }
                    className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {lang === 'zh'
                    ? '输入一个上限，筛选不超过该精度的数据'
                    : 'Enter a maximum resolution to filter products'}
                </p>
              </div>
            )}
          </div>

          {/* Cloud */}
          <div className="space-y-2">
            <Label className="text-xs">{t.explore.fltCloud}</Label>
            <div className="flex items-center gap-3">
              <Slider
                value={[filters.cloudMax]}
                min={0}
                max={100}
                step={1}
                aria-label={lang === 'zh' ? '最大云量' : 'Maximum cloud cover'}
                onValueChange={([value]) => onChange({ ...filters, cloudMax: value ?? 100 })}
              />
              <span className="w-12 shrink-0 text-right font-mono text-xs text-muted-foreground">
                {filters.cloudMax >= 100 ? t.common.all : `${filters.cloudMax}%`}
              </span>
            </div>
          </div>

          {/* Off-nadir / side-looking angle remains available for archive and tasking. */}
          <div className="space-y-2">
            <Label className="text-xs">{t.explore.fltSideLook}</Label>
            <div className="flex items-center gap-3">
              <Slider
                value={[filters.offNadirMax]}
                min={0}
                max={60}
                step={1}
                aria-label={lang === 'zh' ? '最大侧摆角' : 'Maximum off-nadir angle'}
                onValueChange={([value]) => onChange({ ...filters, offNadirMax: value ?? 60 })}
              />
              <span className="w-12 shrink-0 text-right font-mono text-xs text-muted-foreground">
                {filters.offNadirMax >= 60 ? t.common.all : `${filters.offNadirMax}°`}
              </span>
            </div>
          </div>
        </div>

        {category === 'archive' && (
          <div className="space-y-2 border-t border-border pt-4">
            <Label className="text-xs text-muted-foreground">
              {t.explore.archiveSpecificFilters}
            </Label>
            <Label className="text-xs">{t.explore.archiveDeliveryMode}</Label>
            <Select
              value={filters.deliveryMode ?? 'all'}
              onValueChange={(value) =>
                onChange({ ...filters, deliveryMode: value as Filters['deliveryMode'] })
              }
            >
              <SelectTrigger className="h-9 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.explore.deliveryModeAll}</SelectItem>
                <SelectItem value="instant">{t.explore.deliveryModeInstant}</SelectItem>
                <SelectItem value="inquiry">{t.explore.deliveryModeInquiry}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {category === 'tasking' && (
          <div className="space-y-2 border-t border-border pt-4">
            <Label className="text-xs text-muted-foreground">
              {t.explore.taskingSpecificFilters}
            </Label>
            <Label className="text-xs">{t.explore.taskingDeliveryMax}</Label>
            <Select
              value={filters.deliveryMaxDays ? String(filters.deliveryMaxDays) : 'all'}
              onValueChange={(value) =>
                onChange({
                  ...filters,
                  deliveryMaxDays: value === 'all' ? undefined : Number(value),
                })
              }
            >
              <SelectTrigger className="h-9 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.explore.taskingDeliveryAny}</SelectItem>
                <SelectItem value="7">{t.explore.taskingDelivery7}</SelectItem>
                <SelectItem value="14">{t.explore.taskingDelivery14}</SelectItem>
                <SelectItem value="30">{t.explore.taskingDelivery30}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {category === 'analysis' && (
          <div className="space-y-2 border-t border-border pt-4">
            <Label className="text-xs text-muted-foreground">
              {t.explore.analysisSpecificFilters}
            </Label>
            <Label className="text-xs">{t.explore.analysisService}</Label>
            <Select
              value={filters.analysisService ?? 'all'}
              onValueChange={(value) =>
                onChange({
                  ...filters,
                  analysisService: value === 'all' ? undefined : (value as ValueAddedService),
                })
              }
            >
              <SelectTrigger className="h-9 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.explore.analysisServiceAll}</SelectItem>
                {VALUE_ADDED_SERVICES.map((service) => (
                  <SelectItem key={service.id} value={service.id}>
                    {lang === 'zh' ? serviceLabels[service.id].zh : serviceLabels[service.id].en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <div
        data-testid="filter-actions"
        className="z-10 grid shrink-0 grid-cols-2 gap-2 border-t border-border bg-panel p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" onClick={onReset}>
          <RotateCcw className="size-3.5" />
          {t.common.reset}
        </Button>
        <Button type="button" size="sm" className="h-9" onClick={onApply} disabled={isQuerying}>
          {isQuerying ? t.common.loading : t.common.query}
        </Button>
      </div>
    </div>
  );
}
