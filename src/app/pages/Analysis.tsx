import { useEffect, useState } from 'react';
import { ArrowRight, PackageOpen, RefreshCw, Upload } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useI18n } from '../i18n';
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
import { loadCustomerOrders, type ServerOrder } from '../lib/orders';
import {
  createAnalysisJob,
  createAnalysisInputUpload,
  loadAnalysisJobs,
  type AnalysisDeliverable,
  type AnalysisJob,
  type AnalysisServiceType,
} from '../lib/analysis';
import { toast } from 'sonner';

export function Analysis() {
  const { lang } = useI18n();
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

  const eligibleOrders = orders.filter((order) =>
    ['paid', 'fulfillment', 'delivered'].includes(order.status),
  );

  useEffect(() => {
    let active = true;
    Promise.all([loadCustomerOrders(), loadAnalysisJobs()])
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
  }, [zh]);

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

  const templateCards: Array<{ type: AnalysisServiceType; title: [string, string]; description: [string, string] }> = [
    { type: 'change-detection', title: ['变化检测', 'Change detection'], description: ['对比多期影像，识别新增、减少和变化区域', 'Compare dates and identify additions, removals and changed areas'] },
    { type: 'feature-extraction', title: ['目标提取', 'Feature extraction'], description: ['提取建筑物、道路、船舶等目标并统计', 'Extract buildings, roads, vessels and other targets'] },
    { type: 'land-cover', title: ['地物分类', 'Land-cover classification'], description: ['生成分类图、面积统计和类别占比', 'Generate a classification map and area statistics'] },
    { type: 'time-series', title: ['时间序列', 'Time-series analysis'], description: ['观察植被、水体或城市变化趋势', 'Track vegetation, water or urban trends'] },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-16">
        <div className="max-w-2xl">
          <p className="tech-label text-xs text-primary">{zh ? '空间智能工作区' : 'SPATIAL INTELLIGENCE WORKBENCH'}</p>
          <h1 className="mt-3 text-2xl sm:text-3xl">{zh ? '工作台' : 'Workbench'}</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {zh
              ? '从影像输入、分析配方到成果交付，所有步骤都在同一个工作区完成。'
              : 'Move from imagery input to analysis recipe and delivery in one workspace.'}
          </p>
        </div>

        <section className="mt-8 rounded-lg border border-border bg-panel p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-medium">{zh ? '创建工作区任务' : 'Create a workspace task'}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {zh ? '先选择数据来源，再配置配方和交付物。任务会进入可追溯的处理队列。' : 'Choose a data source, configure a recipe and select deliverables. Every task is traceable.'}
              </p>
            </div>
            {loading && <RefreshCw className="size-4 animate-spin text-muted-foreground" />}
          </div>
          {loadError ? (
            <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm text-destructive">{/customer session required|session expired/iu.test(loadError) ? (zh ? '请先登录后使用工作台。' : 'Sign in to use the workbench.') : loadError}</p>
              {/customer session required|session expired/iu.test(loadError) && <Button size="sm" className="mt-3" onClick={() => navigate('/login')}>{zh ? '登录' : 'Sign in'} <ArrowRight className="ml-1 size-3.5" /></Button>}
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label>{zh ? '1. 选择分析模板' : '1. Choose an analysis template'}</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {templateCards.map((template) => (
                    <button
                      key={template.type}
                      type="button"
                      onClick={() => setServiceType(template.type)}
                      className={`rounded-md border p-3 text-left transition-colors ${serviceType === template.type ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50 hover:bg-accent'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium">{template.title[zh ? 0 : 1]}</span>
                        {serviceType === template.type && <Badge variant="secondary" className="text-[9px]">{zh ? '已选择' : 'Selected'}</Badge>}
                      </div>
                      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{template.description[zh ? 0 : 1]}</p>
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{zh ? '2. 数据来源' : '2. Data source'}</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button type="button" onClick={() => setInputSource('purchased-order')} className={`rounded-md border p-3 text-left text-xs ${inputSource === 'purchased-order' ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}>
                    <PackageOpen className="mb-2 size-4 text-primary" />
                    <span className="font-medium">{zh ? '已购影像' : 'Purchased imagery'}</span>
                    <span className="mt-1 block text-muted-foreground">{zh ? '使用已支付或已交付订单中的数据' : 'Use data from a paid or delivered order'}</span>
                  </button>
                  <button type="button" onClick={() => setInputSource('own-upload')} className={`rounded-md border p-3 text-left text-xs ${inputSource === 'own-upload' ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}>
                    <Upload className="mb-2 size-4 text-primary" />
                    <span className="font-medium">{zh ? '自有影像' : 'Own imagery'}</span>
                    <span className="mt-1 block text-muted-foreground">{zh ? '直接上传 GeoTIFF、GeoJSON、KML 或 ZIP' : 'Upload GeoTIFF, GeoJSON, KML or ZIP directly'}</span>
                  </button>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>{zh ? '3. 绑定影像资产' : '3. Attach imagery'}</Label>
                  <Select value={selectedOrderId} onValueChange={setSelectedOrderId} disabled={inputSource !== 'purchased-order'}>
                    <SelectTrigger><SelectValue placeholder={inputSource === 'purchased-order' ? (zh ? '选择已购订单' : 'Select a purchased order') : (zh ? '自有影像无需订单' : 'No order for own imagery')} /></SelectTrigger>
                    <SelectContent>
                      {eligibleOrders.map((order) => (
                        <SelectItem key={order.id} value={order.id}>{order.orderNo} · {order.status}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{zh ? '当前分析配方' : 'Analysis recipe'}</Label>
                  <div className="flex h-10 items-center rounded-md border border-border bg-muted/30 px-3 text-sm">
                    {serviceLabels[serviceType][zh ? 0 : 1]}
                  </div>
                </div>
              </div>
              {inputSource === 'own-upload' && (
                <div className="space-y-1.5">
                  <Label>{zh ? '自有影像文件' : 'Own imagery files'}</Label>
                  <Input type="file" multiple accept=".tif,.tiff,.cog,.geojson,.json,.zip,.kml,.kmz" onChange={(event) => setOwnFiles(Array.from(event.target.files ?? []))} />
                  <p className="text-[11px] text-muted-foreground">{zh ? '文件会直传私有 COS，服务器不会接收影像内容。上传完成后先校验，再进入处理队列。' : 'Files go directly to private COS. The web server never receives raster bytes; validation runs before processing.'}</p>
                  {ownFiles.length > 0 && <p className="text-xs text-muted-foreground">{ownFiles.map((file) => file.name).join(' · ')}</p>}
                </div>
              )}
              <div className="space-y-1.5">
                <Label>{zh ? '4. 分析目标' : '4. Analysis objective'}</Label>
                <Textarea value={objective} onChange={(event) => setObjective(event.target.value)} rows={3} maxLength={2000} placeholder={zh ? '例如：对比两期影像并输出新增建筑物清单' : 'Example: compare two dates and list newly built structures'} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>{zh ? '关注对象（可选）' : 'Target classes (optional)'}</Label>
                  <Input value={targetClasses} onChange={(event) => setTargetClasses(event.target.value)} placeholder={zh ? '建筑物、道路、堆料区' : 'Buildings, roads, stockpiles'} />
                </div>
                <div className="space-y-1.5">
                  <Label>{zh ? '分析重点（可选）' : 'Analysis focus (optional)'}</Label>
                  <Input value={analysisFocus} onChange={(event) => setAnalysisFocus(event.target.value)} maxLength={240} placeholder={zh ? '例如：重点关注矿区扩张' : 'Example: focus on mine expansion'} />
                </div>
              </div>
              {(serviceType === 'change-detection' || serviceType === 'time-series') && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>{zh ? '开始日期（可选）' : 'Start date (optional)'}</Label>
                    <Input type="date" value={dateStart} onChange={(event) => setDateStart(event.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{zh ? '结束日期（可选）' : 'End date (optional)'}</Label>
                    <Input type="date" value={dateEnd} min={dateStart || undefined} onChange={(event) => setDateEnd(event.target.value)} />
                  </div>
                </div>
              )}
              <div className="space-y-1.5 sm:max-w-sm">
                <Label>{zh ? '5. 期望交付物' : '5. Requested deliverable'}</Label>
                <Select value={deliverable} onValueChange={(value) => setDeliverable(value as AnalysisDeliverable)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="analysis-report">{zh ? '标准分析报告' : 'Analysis report'}</SelectItem>
                    <SelectItem value="geospatial-data">{zh ? '空间数据' : 'Geospatial data'}</SelectItem>
                    <SelectItem value="report-and-data">{zh ? '报告 + 空间数据' : 'Report + geospatial data'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => void submitJob()} disabled={busy || objective.trim().length < 5 || (inputSource === 'purchased-order' && !selectedOrderId) || (inputSource === 'own-upload' && ownFiles.length === 0)}>
                {busy && <RefreshCw className="mr-1.5 size-3.5 animate-spin" />}
                {busy ? (zh ? '提交中…' : 'Submitting…') : (zh ? '提交分析任务' : 'Submit analysis task')}
              </Button>
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
