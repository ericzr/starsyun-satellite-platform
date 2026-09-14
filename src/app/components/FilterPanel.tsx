import { CalendarDays, RotateCcw } from 'lucide-react';
import { useI18n } from '../i18n';
import { useRef } from 'react';
import type { DataType, ProductCategory, ProcessingLevel } from '../data/products';
import { DATA_TYPE_LABEL, pick } from '../lib/labels';
import { Button } from './ui/button';
import { Label } from './ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { cn } from './ui/utils';
import { Slider } from './ui/slider';

export interface Filters {
  dataTypes: DataType[];
  categories: ProductCategory[];
  processingLevels: ProcessingLevel[];
  dateStart?: string; // 开始日期 (YYYY-MM-DD)
  dateEnd?: string; // 结束日期 (YYYY-MM-DD)
  resMode: 'preset' | 'range'; // 分辨率筛选模式
  resMax: string; // '0.5' | '1' | '3' | '10' | 'all'
  resMin?: number; // 最小分辨率 (meters)
  resMaxCustom?: number; // 最大分辨率 (meters)
  cloudMax: number; // 最大云量百分比，100 表示不限
  offNadirMax: number; // 最大侧摆角，60 表示不限
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
};

const DATA_TYPE_OPTS: DataType[] = ['optical', 'sar', 'multispectral', 'dem'];
const CATEGORY_OPTS: ProductCategory[] = ['archive', 'tasking', 'analysis'];
const PROCESSING_LEVEL_OPTS: ProcessingLevel[] = ['L1', 'L2', 'L3', 'L4'];

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
  onChange,
}: {
  value?: string;
  placeholder: string;
  ariaLabel: string;
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
        <span className={value ? 'text-foreground' : 'text-muted-foreground'}>{value || placeholder}</span>
        <CalendarDays className="size-3.5 text-muted-foreground" />
      </button>
      <input
        ref={inputRef}
        type="date"
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
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
}) {
  const { t, lang } = useI18n();

  const toggle = <T,>(arr: T[], v: T): T[] =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  // 产品分类标签
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

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="tech-label text-xs text-muted-foreground">{t.explore.filters}</h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs text-muted-foreground"
          onClick={() => onChange(DEFAULT_FILTERS)}
        >
          <RotateCcw className="size-3" />
          {t.common.reset}
        </Button>
      </div>

      {/* Product Category */}
      <div className="space-y-2">
        <Label className="text-xs">{lang === 'zh' ? '产品类型' : 'Product Type'}</Label>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_OPTS.map((c) => (
            <Chip
              key={c}
              active={filters.categories.includes(c)}
              onClick={() => onChange({ ...filters, categories: toggle(filters.categories, c) })}
            >
              {lang === 'zh' ? categoryLabels[c].zh : categoryLabels[c].en}
            </Chip>
          ))}
        </div>
      </div>

      {/* Processing Level */}
      <div className="space-y-2">
        <Label className="text-xs">{lang === 'zh' ? '处理级别' : 'Processing Level'}</Label>
        <div className="flex flex-wrap gap-1.5">
          {PROCESSING_LEVEL_OPTS.map((p) => (
            <Chip
              key={p}
              active={filters.processingLevels.includes(p)}
              onClick={() => onChange({ ...filters, processingLevels: toggle(filters.processingLevels, p) })}
            >
              {lang === 'zh' ? processingLevelLabels[p].zh : processingLevelLabels[p].en}
            </Chip>
          ))}
        </div>
      </div>

      {/* Data type */}
      <div className="space-y-2">
        <Label className="text-xs">{t.explore.fltDataType}</Label>
        <div className="flex flex-wrap gap-1.5">
          {DATA_TYPE_OPTS.map((d) => (
            <Chip
              key={d}
              active={filters.dataTypes.includes(d)}
              onClick={() => onChange({ ...filters, dataTypes: toggle(filters.dataTypes, d) })}
            >
              {pick(DATA_TYPE_LABEL[d], lang)}
            </Chip>
          ))}
        </div>
      </div>

      {/* Time */}
      <div className="space-y-2">
        <Label className="text-xs">{t.explore.fltTime}</Label>
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">{lang === 'zh' ? '开始日期' : 'Start date'}</Label>
            <DateField
              value={filters.dateStart}
              placeholder={lang === 'zh' ? '年 / 月 / 日' : 'YYYY / MM / DD'}
              ariaLabel={lang === 'zh' ? '开始日期' : 'Start date'}
              onChange={(value) => onChange({ ...filters, dateStart: value, dateEnd: filters.dateEnd || value })}
            />
          </div>
          <span className="pb-2 text-xs text-muted-foreground">—</span>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">{lang === 'zh' ? '结束日期' : 'End date'}</Label>
            <DateField
              value={filters.dateEnd}
              placeholder={lang === 'zh' ? '年 / 月 / 日' : 'YYYY / MM / DD'}
              ariaLabel={lang === 'zh' ? '结束日期' : 'End date'}
              onChange={(value) => onChange({ ...filters, dateStart: filters.dateStart || value, dateEnd: value })}
            />
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">
          {lang === 'zh' ? '同一天表示单日查询，留空表示不限时间' : 'Use the same date for a single-day search; leave blank for any date'}
        </p>
      </div>

      {/* Resolution */}
      <div className="space-y-2">
        <Label className="text-xs">{t.explore.fltResolution}</Label>
        <Select
          value={filters.resMode === 'range' ? 'custom' : filters.resMax}
          onValueChange={(v) => {
            if (v === 'custom') onChange({ ...filters, resMode: 'range', resMaxCustom: filters.resMaxCustom });
            else onChange({ ...filters, resMode: 'preset', resMax: v, resMin: undefined, resMaxCustom: undefined });
          }}
        >
          <SelectTrigger className="h-9 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.common.all}</SelectItem>
            <SelectItem value="0.3">≤ 0.3m ({lang === 'zh' ? '超高分' : 'Ultra-High'})</SelectItem>
            <SelectItem value="0.5">≤ 0.5m ({lang === 'zh' ? '高分' : 'High'})</SelectItem>
            <SelectItem value="1">≤ 1m ({lang === 'zh' ? '中高分' : 'Medium-High'})</SelectItem>
            <SelectItem value="2.5">≤ 2.5m ({lang === 'zh' ? '中分' : 'Medium'})</SelectItem>
            <SelectItem value="5">≤ 5m</SelectItem>
            <SelectItem value="10">≤ 10m</SelectItem>
            <SelectItem value="30">≤ 30m ({lang === 'zh' ? '低分' : 'Low'})</SelectItem>
            <SelectItem value="custom">{lang === 'zh' ? '自定义精度' : 'Custom resolution'}</SelectItem>
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
                onChange={(e) => onChange({ ...filters, resMaxCustom: e.target.value ? parseFloat(e.target.value) : undefined })}
                className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              {lang === 'zh' ? '输入一个上限，筛选不超过该精度的数据' : 'Enter a maximum resolution to filter products'}
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

      {/* Off-nadir / side-looking angle */}
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
  );
}
