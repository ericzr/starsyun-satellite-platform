import { useState } from 'react';
import { CheckCircle2, Download, ExternalLink, Loader2 } from 'lucide-react';
import { useI18n } from '../i18n';
import { recordPublicDownload } from '../lib/downloads';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

type DownloadState = 'idle' | 'preparing' | 'ready';
type AuditState = 'idle' | 'saved';

interface PublicDownloadDialogProps {
  productId: string;
  sourceUrl: string;
  productCode: string;
  productName: string;
  provider: string;
  fileFormat: string;
  className?: string;
  size?: 'default' | 'sm' | 'lg';
}

/**
 * Open-data records are hosted by the upstream provider. This dialog makes
 * that hand-off explicit and gives the user a visible download state instead
 * of silently navigating away from the product page.
 */
export function PublicDownloadDialog({
  productId,
  sourceUrl,
  productCode,
  productName,
  provider,
  fileFormat,
  className,
  size = 'default',
}: PublicDownloadDialogProps) {
  const { lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<DownloadState>('idle');
  const [auditState, setAuditState] = useState<AuditState>('idle');

  const startDownload = () => {
    setState('preparing');
    // `noopener` deliberately makes window.open return null in modern
    // browsers, so its return value cannot be used as a popup-block signal.
    // The customer action is what we can audit; upstream completion remains
    // owned by the public data provider.
    window.open(sourceUrl, '_blank', 'noopener,noreferrer');
    void recordPublicDownload({
      productId,
      productCode,
      productName,
      provider,
      fileFormat,
      sourceUrl,
    }).then(() => setAuditState('saved')).catch(() => undefined);
    window.setTimeout(() => setState('ready'), 350);
  };

  const labels =
    lang === 'zh'
      ? {
          trigger: '免费下载',
          title: '准备免费下载',
          description:
            '该数据由公开数据源托管，平台不会收取费用。点击继续后将在新窗口打开数据源下载页面。',
          preparing: '正在打开数据源…',
          ready: '已发起下载请求，请在新窗口完成下载。',
          saved: '已保存到“订单与下载记录”。',
          source: '数据源',
          format: '文件格式',
          continue: '继续下载',
          close: '关闭',
          fallback: '打开数据源',
        }
      : {
          trigger: 'Free download',
          title: 'Prepare free download',
          description:
            'This record is hosted by a public data source. No platform fee applies; the source download page will open in a new window.',
          preparing: 'Opening data source…',
          ready: 'Your download request has started. Finish the download in the new window.',
          saved: 'Saved to your orders and downloads.',
          source: 'Source',
          format: 'File format',
          continue: 'Continue download',
          close: 'Close',
          fallback: 'Open data source',
        };

  return (
    <>
      <Button type="button" size={size} className={className} onClick={() => setOpen(true)}>
        <Download className="size-4" />
        {labels.trigger}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setState('idle');
          if (!next) setAuditState('idle');
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{labels.title}</DialogTitle>
            <DialogDescription>{labels.description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">{labels.source}</span>
              <span className="max-w-[65%] truncate font-mono text-xs">{productCode}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">{labels.format}</span>
              <span className="text-right text-xs">{fileFormat || '—'}</span>
            </div>
          </div>
          {state === 'preparing' && (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {labels.preparing}
            </p>
          )}
          {state === 'ready' && (
            <p role="status" className="flex items-center gap-2 text-sm text-primary">
              <CheckCircle2 className="size-4" />
              {labels.ready}
            </p>
          )}
          {auditState === 'saved' && (
            <p role="status" className="text-xs text-muted-foreground">{labels.saved}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {labels.close}
            </Button>
            <Button type="button" onClick={startDownload} disabled={state === 'preparing'}>
              <ExternalLink className="size-4" />
              {state === 'ready' ? labels.fallback : labels.continue}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
