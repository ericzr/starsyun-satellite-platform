import { useEffect, useState } from 'react';
import { ArrowRight, PackageOpen, RefreshCw, Upload } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useI18n } from '../i18n';
import { useInquiryDraft } from '../context/InquiryContext';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Label } from '../components/ui/label';
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
  loadAnalysisJobs,
  type AnalysisDeliverable,
  type AnalysisJob,
  type AnalysisServiceType,
} from '../lib/analysis';
import { toast } from 'sonner';

export function Analysis() {
  const { lang } = useI18n();
  const navigate = useNavigate();
  const { setDraft } = useInquiryDraft();
  const zh = lang === 'zh';
  const [orders, setOrders] = useState<ServerOrder[]>([]);
  const [jobs, setJobs] = useState<AnalysisJob[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [serviceType, setServiceType] = useState<AnalysisServiceType>('change-detection');
  const [deliverable, setDeliverable] = useState<AnalysisDeliverable>('report-and-data');
  const [objective, setObjective] = useState('');
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

  const startInquiry = () => {
    setDraft({ type: 'analysis' });
    navigate('/inquiry/new');
  };

  const submitJob = async () => {
    if (!selectedOrderId || objective.trim().length < 5) return;
    setBusy(true);
    try {
      const job = await createAnalysisJob({
        orderId: selectedOrderId,
        serviceType,
        objective: objective.trim(),
        requestedDeliverable: deliverable,
      });
      setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)]);
      setObjective('');
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

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-16">
        <div className="max-w-2xl">
          <p className="tech-label text-xs text-primary">{zh ? '空间智能服务' : 'SPATIAL INTELLIGENCE'}</p>
          <h1 className="mt-3 text-2xl sm:text-3xl">{zh ? '分析服务' : 'Analysis service'}</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {zh
              ? '分析服务基于已有卫星影像开展。请先选择已购买的影像，或准备上传自有影像，再提交分析需求。'
              : 'Analysis starts from imagery you already own. Select a purchased asset or prepare your own upload before submitting an analysis request.'}
          </p>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-panel p-5">
            <PackageOpen className="size-5 text-primary" />
            <h2 className="mt-4 text-sm font-medium">{zh ? '选择已购影像' : 'Choose a purchased asset'}</h2>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {zh ? '从已支付或已交付的订单中选择影像。' : 'Select imagery from a paid or delivered order.'}
            </p>
            <Button variant="outline" size="sm" className="mt-5 gap-1.5" onClick={() => navigate('/orders')}>
              {zh ? '查看订单资产' : 'View order assets'} <ArrowRight className="size-3.5" />
            </Button>
          </div>
          <div className="rounded-lg border border-border bg-panel p-5">
            <Upload className="size-5 text-primary" />
            <h2 className="mt-4 text-sm font-medium">{zh ? '上传自有影像' : 'Upload your own imagery'}</h2>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {zh ? '自有影像请提交需求，由运营确认上传和数据检查方式，不会进入公开数据检索。' : 'For your own imagery, submit a request so the operator can confirm the upload and validation path. It remains separate from public search.'}
            </p>
            <Button size="sm" className="mt-5 gap-1.5" onClick={startInquiry}>
              {zh ? '提交分析需求' : 'Submit analysis request'} <ArrowRight className="size-3.5" />
            </Button>
          </div>
        </div>

        <section className="mt-6 rounded-lg border border-border bg-panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-medium">{zh ? '提交分析任务' : 'Submit an analysis task'}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {zh ? '仅能使用已支付、处理中或已交付订单。提交后任务会进入排队，不会伪造已完成结果。' : 'Only paid, in-fulfillment, or delivered orders can be used. Submitted tasks enter a queue; no result is fabricated before processing.'}
              </p>
            </div>
            {loading && <RefreshCw className="size-4 animate-spin text-muted-foreground" />}
          </div>
          {loadError ? (
            <p className="mt-4 text-sm text-destructive">{loadError}</p>
          ) : eligibleOrders.length === 0 ? (
            <div className="mt-4 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              {zh ? '暂无可用订单。请先完成供应商报价、支付和交付，或提交自有影像分析需求。' : 'No eligible orders yet. Complete supplier quoting, payment, and delivery first, or submit a request for your own imagery.'}
              <Button variant="outline" size="sm" className="mt-3" onClick={startInquiry}>
                {zh ? '提交分析需求' : 'Submit analysis request'} <ArrowRight className="ml-1 size-3.5" />
              </Button>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>{zh ? '影像订单' : 'Imagery order'}</Label>
                  <Select value={selectedOrderId} onValueChange={setSelectedOrderId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {eligibleOrders.map((order) => (
                        <SelectItem key={order.id} value={order.id}>{order.orderNo} · {order.status}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{zh ? '分析类型' : 'Analysis type'}</Label>
                  <Select value={serviceType} onValueChange={(value) => setServiceType(value as AnalysisServiceType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(serviceLabels) as AnalysisServiceType[]).map((type) => (
                        <SelectItem key={type} value={type}>{serviceLabels[type][zh ? 0 : 1]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{zh ? '分析目标' : 'Analysis objective'}</Label>
                <Textarea value={objective} onChange={(event) => setObjective(event.target.value)} rows={3} maxLength={2000} placeholder={zh ? '例如：对比两期影像并输出新增建筑物清单' : 'Example: compare two dates and list newly built structures'} />
              </div>
              <div className="space-y-1.5 sm:max-w-sm">
                <Label>{zh ? '期望交付物' : 'Requested deliverable'}</Label>
                <Select value={deliverable} onValueChange={(value) => setDeliverable(value as AnalysisDeliverable)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="analysis-report">{zh ? '标准分析报告' : 'Analysis report'}</SelectItem>
                    <SelectItem value="geospatial-data">{zh ? '空间数据' : 'Geospatial data'}</SelectItem>
                    <SelectItem value="report-and-data">{zh ? '报告 + 空间数据' : 'Report + geospatial data'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => void submitJob()} disabled={busy || objective.trim().length < 5 || !selectedOrderId}>
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
