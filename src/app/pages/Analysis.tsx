import { ArrowRight, PackageOpen, Upload } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useI18n } from '../i18n';
import { useInquiryDraft } from '../context/InquiryContext';
import { Button } from '../components/ui/button';

export function Analysis() {
  const { lang } = useI18n();
  const navigate = useNavigate();
  const { setDraft } = useInquiryDraft();
  const zh = lang === 'zh';

  const startInquiry = () => {
    setDraft({ type: 'analysis' });
    navigate('/inquiry/new');
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
              {zh ? '从订单和交付资产中选择影像后发起分析。' : 'Select imagery from your orders and delivered assets.'}
            </p>
            <Button variant="outline" size="sm" className="mt-5 gap-1.5" onClick={() => navigate('/orders')}>
              {zh ? '查看订单资产' : 'View order assets'} <ArrowRight className="size-3.5" />
            </Button>
          </div>
          <div className="rounded-lg border border-border bg-panel p-5">
            <Upload className="size-5 text-primary" />
            <h2 className="mt-4 text-sm font-medium">{zh ? '上传自有影像' : 'Upload your own imagery'}</h2>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {zh ? '上传入口将与分析任务表单一起开放，文件不会进入公开数据检索。' : 'The upload entry will be opened with the analysis request form and remains separate from public search.'}
            </p>
            <Button size="sm" className="mt-5 gap-1.5" onClick={startInquiry}>
              {zh ? '提交分析需求' : 'Submit analysis request'} <ArrowRight className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
