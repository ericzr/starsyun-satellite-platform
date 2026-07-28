import { useNavigate } from 'react-router';
import { useI18n } from '../i18n';
import { useUser } from '../context/UserContext';
import { loadInquiries, type Inquiry, type InquiryStatus } from '../lib/inquiries';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { FileText, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { fmtCny, fmtCnyEn } from '../lib/pricing';

export function InquiryList() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const { user } = useUser();

  const inquiries = loadInquiries().filter(inquiry =>
    inquiry.email === user?.email || inquiry.phone === user?.phone
  );

  const statusConfig: Record<InquiryStatus, { label: string; labelEn: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: any }> = {
    submitted: { label: '已提交', labelEn: 'Submitted', variant: 'secondary', icon: Clock },
    pending: { label: '处理中', labelEn: 'Pending', variant: 'secondary', icon: Clock },
    quoting: { label: '报价中', labelEn: 'Quoting', variant: 'default', icon: FileText },
    quoted: { label: '已报价', labelEn: 'Quoted', variant: 'default', icon: CheckCircle },
    confirmed: { label: '已确认', labelEn: 'Confirmed', variant: 'outline', icon: CheckCircle },
  };

  const formatDate = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const money = (v: number) => (lang === 'zh' ? fmtCny(v) : fmtCnyEn(v));

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-medium">{lang === 'zh' ? '我的询价' : 'My Inquiries'}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {lang === 'zh' ? '查看您的询价记录和状态' : 'View your inquiry records and status'}
            </p>
          </div>
          <Button onClick={() => navigate('/explore')}>
            {lang === 'zh' ? '新建询价' : 'New Inquiry'}
          </Button>
        </div>

        {inquiries.length === 0 ? (
          <div className="flex min-h-[400px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 p-8">
            <FileText className="mb-4 size-12 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              {lang === 'zh' ? '暂无询价记录' : 'No inquiry records yet'}
            </p>
            <Button variant="outline" className="mt-4" onClick={() => navigate('/explore')}>
              {lang === 'zh' ? '开始询价' : 'Start Inquiry'}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {inquiries.map((inquiry) => {
              const status = statusConfig[inquiry.status];
              const Icon = status.icon;

              return (
                <div
                  key={inquiry.id}
                  className="rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent/50 sm:p-6"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1">
                      <div className="flex items-start gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium">{inquiry.productName || inquiry.region}</h3>
                            <Badge variant={status.variant} className="gap-1">
                              <Icon className="size-3" />
                              {lang === 'zh' ? status.label : status.labelEn}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {lang === 'zh' ? '询价单号' : 'Inquiry'}: {inquiry.code}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {inquiry.areaKm2 > 0 && (
                          <div>
                            <div className="text-xs text-muted-foreground">{t.common.area}</div>
                            <div className="mt-1 text-sm font-medium">{inquiry.areaKm2} km²</div>
                          </div>
                        )}
                        {inquiry.expectRes && (
                          <div>
                            <div className="text-xs text-muted-foreground">{t.inquiry.expectRes}</div>
                            <div className="mt-1 text-sm font-medium">{inquiry.expectRes}</div>
                          </div>
                        )}
                        {inquiry.refPrice > 0 && (
                          <div>
                            <div className="text-xs text-muted-foreground">{lang === 'zh' ? '参考价格' : 'Ref. Price'}</div>
                            <div className="mt-1 text-sm font-medium text-primary">
                              {money(inquiry.refPrice)} {lang === 'zh' ? '元' : 'CNY'}
                            </div>
                          </div>
                        )}
                        <div>
                          <div className="text-xs text-muted-foreground">{lang === 'zh' ? '提交时间' : 'Submitted'}</div>
                          <div className="mt-1 text-sm font-medium">{formatDate(inquiry.createdAt)}</div>
                        </div>
                      </div>

                      {inquiry.usage && (
                        <div className="mt-3 rounded-md bg-muted/50 p-3">
                          <div className="text-xs text-muted-foreground">{t.inquiry.usage}</div>
                          <div className="mt-1 text-sm">{inquiry.usage}</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
