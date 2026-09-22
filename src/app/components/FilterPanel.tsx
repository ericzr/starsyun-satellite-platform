import { CalendarDays, RotateCcw } from 'lucide-react';
import { useRef } from 'react';
import { useI18n } from '../i18n';
import type { DataType, ProductCategory } from '../data/products';
import { DATA_TYPE_LABEL, pick } from '../lib/labels';
import { todayInTimeZone } from '../lib/capture-window';
import { CaptureTimezone } from './CaptureTimezone';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Slider } from './ui/slider';
import { cn } from './ui/utils';

export interface Filters {
  categories: ProductCategory[];
  dataTypes: DataType[];
  dateStart?: string;
  dateEnd?: string;
  captureTimeZone?: string;
  resMode: 'preset' | 'range';
  resMax: string;
  resMin?: number;
  resMaxCustom?: number;
  cloudMax: number;
  offNadirMax: number;
  deliveryMode?: 'all' | 'instant' | 'inquiry';
}

export const DEFAULT_FILTERS: Filters = {
  categories: ['archive'],
  dataTypes: [],
  dateStart: undefined,
  dateEnd: undefined,
  resMode: 'preset',
  resMax: 'all',
  resMin: undefined,
  resMaxCustom: undefined,
  cloudMax: 20,
  offNadirMax: 30,
  deliveryMode: 'all',
};

// Public catalog capability. Do not advertise commercial data types until a
// provider is authorized, searchable, quoteable and delivery-tested.
const ARCHIVE_TYPES: DataType[] = ['multispectral'];
const TASKING_TYPES: DataType[] = ['optical', 'sar'];

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={cn('rounded-md border px-2.5 py-1 text-xs transition-colors', active ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground')}>{children}</button>;
}

function DateField({ value, placeholder, ariaLabel, min, onChange }: { value?: string; placeholder: string; ariaLabel: string; min?: string; onChange: (value: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return <div className="relative h-9 w-full"><button type="button" tabIndex={-1} className="pointer-events-none absolute inset-0 flex h-9 w-full items-center justify-between rounded-md border border-border bg-background px-3 py-1 text-left text-xs shadow-sm"><span className={value ? 'text-foreground' : 'text-muted-foreground'}>{value || placeholder}</span><CalendarDays className="size-3.5 text-muted-foreground" /></button><input ref={ref} type="date" min={min} value={value || ''} aria-label={ariaLabel} onChange={(event) => onChange(event.target.value)} onClick={() => ref.current?.showPicker?.()} className="absolute inset-0 z-10 h-9 w-full cursor-pointer opacity-0" /></div>;
}

export function FilterPanel({ filters, onChange, onApply, onReset, isQuerying = false }: { filters: Filters; onChange: (f: Filters) => void; onApply: () => void; onReset: () => void; isQuerying?: boolean }) {
  const { t, lang } = useI18n();
  const tasking = filters.categories[0] === 'tasking';
  const timeZone = filters.captureTimeZone ?? 'UTC';
  const today = todayInTimeZone(timeZone);
  const zh = lang === 'zh';
  const labels = zh
    ? { archive: '历史影像', tasking: '任务拍摄', archiveDate: '采集时间', taskingDate: '期望拍摄时间', type: '数据类型', mode: '成像方式', switched: '已切换为任务拍摄', note: '未来日期不能检索历史存档，将按拍摄窗口发起可行性与报价。', back: '返回历史影像', advanced: '高级条件', start: '开始日期', end: '结束日期', resolution: '空间分辨率', custom: '自定义精度', customMax: '最高分辨率 (m)', cloud: '云量', angle: '侧摆角' }
    : { archive: 'Archive imagery', tasking: 'Tasking request', archiveDate: 'Acquisition date', taskingDate: 'Requested window', type: 'Data type', mode: 'Imaging mode', switched: 'Switched to tasking', note: 'Future dates cannot search archive imagery. We will request feasibility and a quote for this window.', back: 'Return to archive', advanced: 'Advanced conditions', start: 'Start date', end: 'End date', resolution: 'Resolution', custom: 'Custom resolution', customMax: 'Maximum resolution (m)', cloud: 'Cloud cover', angle: 'Off-nadir angle' };
  const updateDate = (field: 'dateStart' | 'dateEnd', value: string) => {
    const nextTasking = tasking || value > today;
    const next = nextTasking && value < today ? today : value;
    const start = field === 'dateStart' ? next : filters.dateStart || next;
    const end = field === 'dateEnd' ? next : filters.dateEnd || next;
    onChange({ ...filters, categories: [nextTasking ? 'tasking' : 'archive'], captureTimeZone: nextTasking ? timeZone : undefined, dateStart: start, dateEnd: end < start ? start : end, deliveryMode: nextTasking ? 'all' : filters.deliveryMode });
  };
  const resetToArchive = () => onChange({ ...filters, categories: ['archive'], captureTimeZone: undefined, dateStart: undefined, dateEnd: undefined, deliveryMode: 'all' });
  const types = tasking ? TASKING_TYPES : ARCHIVE_TYPES;
  const numberLabel = (value: number, unit: string, unlimited: number) => value >= unlimited ? t.common.all : String(value) + unit;
  return <div className="flex h-full min-h-0 flex-col bg-panel">
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
      <div className="flex items-center justify-between"><h3 className="tech-label text-xs text-muted-foreground">{t.explore.filters}</h3><span className={cn('rounded-full px-2 py-0.5 text-[10px]', tasking ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>{tasking ? labels.tasking : labels.archive}</span></div>
      {tasking && <div className="rounded-md border border-primary/25 bg-primary/5 p-2.5"><div className="flex items-center justify-between gap-2"><span className="text-xs font-medium">{labels.switched}</span><button type="button" className="text-[11px] text-primary hover:underline" onClick={resetToArchive}>{labels.back}</button></div><p className="mt-1 text-[11px] leading-4 text-muted-foreground">{labels.note}</p></div>}
      <div className="space-y-2 border-t border-border pt-4"><Label className="text-xs">{tasking ? labels.taskingDate : labels.archiveDate}</Label><div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2"><div className="space-y-1"><Label className="text-[10px] text-muted-foreground">{labels.start}</Label><DateField value={filters.dateStart} placeholder={zh ? '年 / 月 / 日' : 'YYYY / MM / DD'} ariaLabel={labels.start} min={tasking ? today : undefined} onChange={(value) => updateDate('dateStart', value)} /></div><span className="pb-2 text-xs text-muted-foreground">—</span><div className="space-y-1"><Label className="text-[10px] text-muted-foreground">{labels.end}</Label><DateField value={filters.dateEnd} placeholder={zh ? '年 / 月 / 日' : 'YYYY / MM / DD'} ariaLabel={labels.end} min={tasking ? (filters.dateStart && filters.dateStart > today ? filters.dateStart : today) : filters.dateStart} onChange={(value) => updateDate('dateEnd', value)} /></div></div></div>
      {tasking && <CaptureTimezone value={timeZone} onChange={(captureTimeZone) => { const minimum = todayInTimeZone(captureTimeZone); const start = filters.dateStart && filters.dateStart >= minimum ? filters.dateStart : minimum; const end = filters.dateEnd && filters.dateEnd >= start ? filters.dateEnd : start; onChange({ ...filters, captureTimeZone, dateStart: start, dateEnd: end }); }} />}
      <div className="space-y-4 border-t border-border pt-4"><div className="space-y-2"><Label className="text-xs">{tasking ? labels.mode : labels.type}</Label><div className="flex flex-wrap gap-1.5">{types.map((type) => <Chip key={type} active={filters.dataTypes.includes(type)} onClick={() => onChange({ ...filters, dataTypes: filters.dataTypes.includes(type) ? [] : [type] })}>{pick(DATA_TYPE_LABEL[type], lang)}</Chip>)}</div></div><div className="space-y-2"><Label className="text-xs">{labels.resolution}</Label><Select value={filters.resMode === 'range' ? 'custom' : filters.resMax} onValueChange={(value) => value === 'custom' ? onChange({ ...filters, resMode: 'range' }) : onChange({ ...filters, resMode: 'preset', resMax: value, resMin: undefined, resMaxCustom: undefined })}><SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t.common.all}</SelectItem><SelectItem value="0.3">≤ 0.3m</SelectItem><SelectItem value="0.5">≤ 0.5m</SelectItem><SelectItem value="1">≤ 1m</SelectItem><SelectItem value="2.5">≤ 2.5m</SelectItem><SelectItem value="5">≤ 5m</SelectItem><SelectItem value="10">≤ 10m</SelectItem><SelectItem value="30">≤ 30m</SelectItem><SelectItem value="custom">{labels.custom}</SelectItem></SelectContent></Select>{filters.resMode === 'range' && <input type="number" min="0" max="100" step="0.1" aria-label={labels.customMax} placeholder={labels.customMax} value={filters.resMaxCustom ?? ''} onChange={(event) => onChange({ ...filters, resMaxCustom: event.target.value ? Number(event.target.value) : undefined })} className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />}</div></div>
      <details className="border-t border-border pt-4"><summary className="cursor-pointer text-xs text-muted-foreground">{labels.advanced}</summary><div className="mt-3 space-y-4"><div className="space-y-2"><Label className="text-xs">{labels.cloud}</Label><div className="flex items-center gap-3"><Slider value={[filters.cloudMax]} min={0} max={100} step={1} aria-label={labels.cloud} onValueChange={([value]) => onChange({ ...filters, cloudMax: value ?? 20 })} /><span className="w-12 shrink-0 text-right font-mono text-xs text-muted-foreground">{numberLabel(filters.cloudMax, '%', 100)}</span></div></div><div className="space-y-2"><Label className="text-xs">{labels.angle}</Label><div className="flex items-center gap-3"><Slider value={[filters.offNadirMax]} min={0} max={60} step={1} aria-label={labels.angle} onValueChange={([value]) => onChange({ ...filters, offNadirMax: value ?? 30 })} /><span className="w-12 shrink-0 text-right font-mono text-xs text-muted-foreground">{numberLabel(filters.offNadirMax, '°', 60)}</span></div></div></div></details>
    </div>
    <div data-testid="filter-actions" className="z-10 grid shrink-0 grid-cols-2 gap-2 border-t border-border bg-panel p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"><Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" onClick={onReset}><RotateCcw className="size-3.5" />{t.common.reset}</Button><Button type="button" size="sm" className="h-9" onClick={onApply} disabled={isQuerying}>{isQuerying ? t.common.loading : t.common.query}</Button></div>
  </div>;
}
