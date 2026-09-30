import { useEffect, useState } from 'react';
import { ArrowRight, Check, ChevronDown, PackageOpen, RefreshCw, SlidersHorizontal, Upload } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useI18n } from '../i18n';
import { useUser } from '../context/UserContext';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Label } from '../components/ui/label';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { loadAdminOrders, loadCustomerOrders, type ServerOrder } from '../lib/orders';
import {
  createAnalysisJob,
  createAnalysisInputUpload,
  loadAdminAnalysisJobs,
  loadAnalysisJobs,
  type AnalysisDeliverable,
  type AnalysisJob,
  type AnalysisServiceType,
} from '../lib/analysis';
import { toast } from 'sonner';

export function Analysis() {
  const { lang } = useI18n();
  const { user } = useUser();
  const navigate = useNavigate();
  const zh = lang === 'zh';
  const [orders, setOrders] = useState<ServerOrder[]>([]);
  const [jobs, setJobs] = useState<AnalysisJob[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [inputSource, setInputSource] = useState<'purchased-order' | 'own-upload'>('purchased-order');
  const [ownFiles, setOwnFiles] = useState<File[]>([]);
  const [serviceType, setServiceType] = useState<AnalysisServiceType>('change-detection');
  const [deliverable, setDeliverable] = useState<AnalysisDeliverable>('report-and-data');
  const [objective, setObjective] = useState('');
  const [analysisFocus, setAnalysisFocus] = useState('');
  const [targetClasses, setTargetClasses] = useState('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const eligibleOrders = orders.filter((order) =>
    ['paid', 'fulfillment', 'delivered'].includes(order.status),
  );

  useEffect(() => {
    let active = true;
    const loadOrders = user?.role === 'admin' ? loadAdminOrders : loadCustomerOrders;
    const loadJobs = user?.role === 'admin' ? loadAdminAnalysisJobs : loadAnalysisJobs;
    Promise.all([loadOrders(), loadJobs()])
      .then(([nextOrders, nextJobs]) => {
        if (!active) return;
        setOrders(nextOrders);
        setJobs(nextJobs);
        const firstEligible = nextOrders.find((order) =>
          ['paid', 'fulfillment', 'delivered'].includes(order.status),
        );
        if (firstEligible) setSelectedOrderId(firstEligible.id);
      })
      .catch((error) => {
        if (!active) return;
        setLoadError(
          error instanceof Error
            ? error.message
            : zh
              ? '分析任务加载失败'
              : 'Could not load analysis tasks',
        );
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [user?.role, zh]);

  const submitJob = async () => {
    if ((inputSource === 'purchased-order' && !selectedOrderId) || (inputSource === 'own-upload' && ownFiles.length === 0) || objective.trim().length < 5) return;
    setBusy(true);
    try {
      const job = await createAnalysisJob({
        orderId: inputSource === 'purchased-order' ? selectedOrderId : undefined,
        inputSource,
        serviceType,
        objective: objective.trim(),
        requestedDeliverable: deliverable,
        analysisFocus: analysisFocus.trim() || undefined,
        targetClasses: targetClasses.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean),
        timeRange: dateStart || dateEnd ? { start: dateStart || undefined, end: dateEnd || undefined } : undefined,
      });
      if (inputSource === 'own-upload' && ownFiles.length) {
        for (const file of ownFiles) await createAnalysisInputUpload(job.id, file);
      }
      setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)]);
      setObjective('');
      setAnalysisFocus('');
      setTargetClasses('');
      setDateStart('');
      setDateEnd('');
      setOwnFiles([]);
      toast.success(zh ? '分析任务已提交' : 'Analysis task submitted');
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : zh
            ? '分析任务提交失败'
            : 'Could not submit analysis task',
      );
    } finally {
      setBusy(false);
    }
  };

  const serviceLabels: Record<AnalysisServiceType, [string, string]> = {
    'change-detection': ['变化检测', 'Change detection'],
    'land-cover': ['地物分类', 'Land-cover classification'],
    'feature-extraction': ['目标提取', 'Feature extraction'],
    'time-series': ['时间序列分析', 'Time-series analysis'],
    'custom-analysis': ['定制分析', 'Custom analysis'],
  };

  const statusLabels: Record<AnalysisJob['status'], [string, string]> = {
    queued: ['已排队', 'Queued'],
    validating: ['校验中', 'Validating'],
    processing: ['处理中', 'Processing'],
    qa: ['质检中', 'Quality review'],
    delivered: ['已交付', 'Delivered'],
    cancelled: ['已取消', 'Cancelled'],
    failed: ['失败', 'Failed'],
  };

  const templateCards: Array<{ type: AnalysisServiceType; title: [string, string] }> = [
    { type: 'change-detection', title: ['变化检测', 'Change detection'] },
    { type: 'feature-extraction', title: ['目标提取', 'Feature extraction'] },
    { type: 'land-cover', title: ['地物分类', 'Land-cover classification'] },
    { type: 'time-series', title: ['时间序列', 'Time-series analysis'] },
  ];

  const canSubmit = objective.trim().length >= 5
    && (inputSource === 'purchased-order' ? Boolean(selectedOrderId) : ownFiles.length > 0);
  const selectedOrder = eligibleOrders.find((order) => order.id === selectedOrderId);
  const selectedTemplate = serviceLabels[serviceType][zh ? 0 : 1];
  const selectedSource = inputSource === 'purchased-order'
    ? (zh ? '已购影像' : 'Purchased imagery')
    : (zh ? '自有影像' : 'Own imagery');

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="flex items-center justify-between border-b border-border pb-5">
          <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">{zh ? '工作台' : 'Workbench'}</h1>
          {loading && <RefreshCw className="size-4 animate-spin text-muted-foreground" />}
        </div>

        <section className="mt-6">
          {loadError ? (
            <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm text-destructive">{/customer session required|session expired/iu.test(loadError) ? (zh ? '请先登录后使用工作台。' : 'Sign in to use the workbench.') : loadError}</p>
              {/customer session required|session expired/iu.test(loadError) && <Button size="sm" className="mt-3" onClick={() => navigate('/login')}>{zh ? '登录' : 'Sign in'} <ArrowRight className="ml-1 size-3.5" /></Button>}
            </div>
          ) : (
            <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_17rem]">
              <div className="min-w-0 space-y-8">
                <div className="space-y-3">
                  <Label>{zh ? '分析模板' : 'Analysis template'}</Label>
                  <div className="grid grid-cols-2 overflow-hidden rounded-md border border-border sm:grid-cols-4">
                  {templateCards.map((template) => (
                    <button
                      key={template.type}
                      type="button"
                      onClick={() => setServiceType(template.type)}
                      className={`relative min-h-10 border-b border-r border-border px-3 py-2.5 text-left text-xs transition-colors last:border-r-0 sm:border-b-0 ${serviceType === template.type ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-accent'}`}
                    >
                      <span className="font-medium">{template.title[zh ? 0 : 1]}</span>
                      {serviceType === template.type && <Check className="absolute right-2 top-3 size-3.5" />}
                    </button>
                  ))}
                  </div>
                </div>
                <div className="space-y-3">
                  <Label>{zh ? '数据来源' : 'Data source'}</Label>
                  <div className="grid grid-cols-2 overflow-hidden rounded-md border border-border">
                  <button type="button" onClick={() => setInputSource('purchased-order')} className={`flex items-center gap-2 border-r border-border px-3 py-2.5 text-left text-xs transition-colors ${inputSource === 'purchased-order' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-accent'}`}>
                    <PackageOpen className="size-4" />
                    <span className="font-medium">{zh ? '已购影像' : 'Purchased imagery'}</span>
                  </button>
                  <button type="button" onClick={() => setInputSource('own-upload')} className={`flex items-center gap-2 px-3 py-2.5 text-left text-xs transition-colors ${inputSource === 'own-upload' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-accent'}`}>
                    <Upload className="size-4" />
                    <span className="font-medium">{zh ? '自有影像' : 'Own imagery'}</span>
                  </button>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{zh ? '影像资产' : 'Imagery asset'}</Label>
                    <Select value={selectedOrderId} onValueChange={setSelectedOrderId} disabled={inputSource !== 'purchased-order'}>
                      <SelectTrigger><SelectValue placeholder={inputSource === 'purchased-order' ? (zh ? '选择已购订单' : 'Select a purchased order') : (zh ? '自有影像' : 'Own imagery')} /></SelectTrigger>
                      <SelectContent>
                        {eligibleOrders.map((order) => (
                          <SelectItem key={order.id} value={order.id}>{order.orderNo} · {order.status}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{zh ? '分析配方' : 'Analysis recipe'}</Label>
                    <div className="flex h-10 items-center rounded-md border border-border px-3 text-sm">{selectedTemplate}</div>
                  </div>
                </div>
                {inputSource === 'own-upload' && (
                  <div className="space-y-2">
                    <Label>{zh ? '上传影像' : 'Upload imagery'}</Label>
                    <Input type="file" multiple accept=".tif,.tiff,.cog,.geojson,.json,.zip,.kml,.kmz" onChange={(event) => setOwnFiles(Array.from(event.target.files ?? []))} />
                    {ownFiles.length > 0 && <p className="text-xs text-muted-foreground">{ownFiles.map((file) => file.name).join(' · ')}</p>}
                  </div>
                )}
                <div className="space-y-2">
                  <Label>{zh ? '分析目标' : 'Analysis objective'}</Label>
                  <Textarea value={objective} onChange={(event) => setObjective(event.target.value)} rows={4} maxLength={2000} placeholder={zh ? '描述你希望从影像中得到的结果' : 'Describe the result you need from the imagery'} />
                </div>
                <div className="overflow-hidden rounded-md border border-border">
                  <button type="button" onClick={() => setAdvancedOpen((open) => !open)} className="flex w-full items-center justify-between px-3 py-2.5 text-left text-xs font-medium hover:bg-accent">
                    <span className="flex items-center gap-2"><SlidersHorizontal className="size-3.5" />{zh ? '高级参数' : 'Advanced parameters'}</span>
                    <ChevronDown className={`size-4 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {advancedOpen && <div className="grid gap-4 border-t border-border p-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>{zh ? '关注对象' : 'Target classes'}</Label>
                      <Input value={targetClasses} onChange={(event) => setTargetClasses(event.target.value)} placeholder={zh ? '建筑物、道路、堆料区' : 'Buildings, roads, stockpiles'} />
                    </div>
                    <div className="space-y-2">
                      <Label>{zh ? '分析重点' : 'Analysis focus'}</Label>
                      <Input value={analysisFocus} onChange={(event) => setAnalysisFocus(event.target.value)} maxLength={240} placeholder={zh ? '例如：重点关注矿区扩张' : 'Example: focus on mine expansion'} />
                    </div>
                    {(serviceType === 'change-detection' || serviceType === 'time-series') && <>
                      <div className="space-y-2"><Label>{zh ? '开始日期' : 'Start date'}</Label><Input type="date" value={dateStart} onChange={(event) => setDateStart(event.target.value)} /></div>
                      <div className="space-y-2"><Label>{zh ? '结束日期' : 'End date'}</Label><Input type="date" value={dateEnd} min={dateStart || undefined} onChange={(event) => setDateEnd(event.target.value)} /></div>
                    </>}
                  </div>}
                </div>
              </div>
              <aside className="space-y-4 lg:sticky lg:top-6">
                <div className="rounded-md border border-border bg-card p-4">
                  <div className="flex items-center justify-between"><h2 className="text-sm font-medium">{zh ? '任务摘要' : 'Task summary'}</h2><Badge variant="secondary">{zh ? '草稿' : 'Draft'}</Badge></div>
                  <dl className="mt-4 space-y-3 text-xs">
                    <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{zh ? '模板' : 'Template'}</dt><dd className="text-right font-medium">{selectedTemplate}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{zh ? '来源' : 'Source'}</dt><dd className="text-right font-medium">{selectedSource}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{zh ? '资产' : 'Asset'}</dt><dd className="max-w-[9rem] truncate text-right font-medium">{selectedOrder?.orderNo || (ownFiles.length ? `${ownFiles.length} ${zh ? '个文件' : 'file(s)'}` : '—')}</dd></div>
                  </dl>
                  <div className="mt-5 space-y-2">
                    <Label>{zh ? '交付物' : 'Deliverable'}</Label>
                    <Select value={deliverable} onValueChange={(value) => setDeliverable(value as AnalysisDeliverable)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="analysis-report">{zh ? '标准分析报告' : 'Analysis report'}</SelectItem>
                        <SelectItem value="geospatial-data">{zh ? '空间数据' : 'Geospatial data'}</SelectItem>
                        <SelectItem value="report-and-data">{zh ? '报告 + 空间数据' : 'Report + geospatial data'}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button className="mt-4 w-full" onClick={() => void submitJob()} disabled={busy || !canSubmit}>
                    {busy && <RefreshCw className="mr-1.5 size-3.5 animate-spin" />}
                    {busy ? (zh ? '提交中…' : 'Submitting…') : (zh ? '创建分析任务' : 'Create analysis task')}
                  </Button>
                </div>
              </aside>
            </div>
          )}
        </section>

        <section className="mt-6 rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-medium">{zh ? '分析任务状态' : 'Analysis task status'}</h2>
          {jobs.length === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">{zh ? '暂无分析任务' : 'No analysis tasks yet'}</p>
          ) : (
            <div className="mt-3 divide-y divide-border">
              {jobs.map((job) => (
                <div key={job.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-xs">
                  <div className="min-w-0">
                    <p className="font-medium">{serviceLabels[job.serviceType][zh ? 0 : 1]}</p>
                    <p className="mt-1 truncate text-muted-foreground">{String(job.inputSpec.objective ?? '')}</p>
                  </div>
                  <Badge variant={job.status === 'failed' ? 'destructive' : job.status === 'delivered' ? 'outline' : 'secondary'}>{statusLabels[job.status][zh ? 0 : 1]}</Badge>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
