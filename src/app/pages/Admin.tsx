import { useEffect, useMemo, useState } from 'react';
import { TrendingUp, FileStack, MapPin, Target, CheckCircle2, FilePlus2, RotateCcw } from 'lucide-react';
import { useI18n } from '../i18n';
import {
  loadAdminInquiries,
  saveInquiryStatus,
  type Inquiry,
  type InquiryStatus,
} from '../lib/inquiries';
import { fmtCny, fmtCnyEn } from '../lib/pricing';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { toast } from 'sonner';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
import { createQuote, loadAdminQuotes, updateQuoteStatus, type Quote, type QuoteCurrency, type QuoteStatus } from '../lib/quotes';
import { createDeliveryAsset, loadAdminOrders, loadDeliveryAssets, revokeDeliveryAsset, updateOrderDeliveryStatus, type DeliveryAsset, type ServerOrder } from '../lib/orders';

const STATUS_ORDER: InquiryStatus[] = ['submitted', 'pending', 'quoting', 'quoted', 'confirmed'];

const STATUS_VARIANT: Record<InquiryStatus, 'default' | 'secondary' | 'outline'> = {
  submitted: 'default',
  pending: 'secondary',
  quoting: 'secondary',
  quoted: 'outline',
  confirmed: 'outline',
};

export function Admin() {
  const { t, lang } = useI18n();
  const [list, setList] = useState<Inquiry[]>([]);
  const [selected, setSelected] = useState<Inquiry | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteForm, setQuoteForm] = useState({ currency: 'CNY' as QuoteCurrency, subtotal: '', taxRate: '0', deliveryDays: '7', validUntil: defaultValidUntil(), notes: '' });
  const [orders, setOrders] = useState<ServerOrder[]>([]);
  const [deliveryOrder, setDeliveryOrder] = useState<ServerOrder | null>(null);
  const [deliveryAssets, setDeliveryAssets] = useState<DeliveryAsset[]>([]);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [deliveryBusy, setDeliveryBusy] = useState(false);
  const [assetForm, setAssetForm] = useState({ objectKey: '', fileName: '', contentType: 'application/zip', sizeBytes: '', sha256: '' });

  useEffect(() => {
    let active = true;
    Promise.all([loadAdminInquiries(), loadAdminQuotes(), loadAdminOrders()])
      .then(([{ inquiries }, nextQuotes, nextOrders]) => {
        if (!active) return;
        setList(inquiries);
        setQuotes(nextQuotes);
        setOrders(nextOrders);
      })
      .catch(() => active && setList([]));
    return () => { active = false; };
  }, []);

  const openDelivery = async (order: ServerOrder) => {
    setDeliveryOrder(order);
    setDeliveryAssets([]);
    setAssetForm({ objectKey: '', fileName: '', contentType: 'application/zip', sizeBytes: '', sha256: '' });
    setDeliveryLoading(true);
    try {
      setDeliveryAssets(await loadDeliveryAssets(order.id, true));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (lang === 'zh' ? '交付文件加载失败' : 'Could not load delivery files'));
    } finally {
      setDeliveryLoading(false);
    }
  };

  const addDeliveryFile = async () => {
    if (!deliveryOrder || !assetForm.objectKey.trim() || !assetForm.fileName.trim()) return;
    setDeliveryBusy(true);
    try {
      const asset = await createDeliveryAsset(deliveryOrder.id, {
        objectKey: assetForm.objectKey.trim(), fileName: assetForm.fileName.trim(), contentType: assetForm.contentType.trim() || 'application/octet-stream',
        sizeBytes: assetForm.sizeBytes ? Number(assetForm.sizeBytes) : undefined, sha256: assetForm.sha256.trim() || undefined,
      });
      setDeliveryAssets((current) => [asset, ...current]);
      setAssetForm({ objectKey: '', fileName: '', contentType: 'application/zip', sizeBytes: '', sha256: '' });
      toast.success(lang === 'zh' ? '交付文件已登记' : 'Delivery file registered');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (lang === 'zh' ? '交付文件登记失败' : 'Could not register delivery file'));
    } finally {
      setDeliveryBusy(false);
    }
  };

  const revokeDeliveryFile = async (asset: DeliveryAsset) => {
    if (!deliveryOrder || asset.revokedAt) return;
    setDeliveryBusy(true);
    try {
      const next = await revokeDeliveryAsset(deliveryOrder.id, asset.id);
      setDeliveryAssets((current) => current.map((item) => item.id === next.id ? next : item));
      toast.success(lang === 'zh' ? '文件已撤销' : 'Delivery file revoked');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (lang === 'zh' ? '文件撤销失败' : 'Could not revoke delivery file'));
    } finally {
      setDeliveryBusy(false);
    }
  };

  const markDelivered = async () => {
    if (!deliveryOrder) return;
    setDeliveryBusy(true);
    try {
      const next = await updateOrderDeliveryStatus(deliveryOrder.id, 'delivered');
      setDeliveryOrder(next);
      setOrders((current) => current.map((item) => item.id === next.id ? next : item));
      toast.success(lang === 'zh' ? '订单已标记为已交付' : 'Order marked as delivered');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (lang === 'zh' ? '交付状态更新失败' : 'Could not update delivery status'));
    } finally {
      setDeliveryBusy(false);
    }
  };

  const openInquiry = (inquiry: Inquiry) => {
    setSelected(inquiry);
    setQuoteForm((current) => ({ ...current, subtotal: inquiry.refPrice ? String(inquiry.refPrice) : '' }));
  };

  const createDraftQuote = async () => {
    if (!selected) return;
    setQuoteBusy(true);
    try {
      const quote = await createQuote({
        inquiryId: selected.id,
        currency: quoteForm.currency,
        subtotal: Number(quoteForm.subtotal),
        taxRate: Number(quoteForm.taxRate),
        deliveryDays: Number(quoteForm.deliveryDays),
        validUntil: quoteForm.validUntil,
        notes: quoteForm.notes,
      });
      setQuotes((current) => [quote, ...current]);
      toast.success(lang === 'zh' ? `报价草稿 ${quote.quoteNo} 已创建` : `Quote draft ${quote.quoteNo} created`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (lang === 'zh' ? '报价创建失败' : 'Could not create quote'));
    } finally {
      setQuoteBusy(false);
    }
  };

  const changeQuoteStatus = async (quote: Quote, status: QuoteStatus) => {
    try {
      const next = await updateQuoteStatus(quote.id, status);
      setQuotes((current) => current.map((item) => item.id === quote.id ? next : item));
      toast.success(lang === 'zh' ? '报价状态已更新' : 'Quote status updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (lang === 'zh' ? '报价状态更新失败' : 'Could not update quote status'));
    }
  };

  const statusLabel: Record<InquiryStatus, string> = {
    submitted: t.admin.st1,
    pending: t.admin.st2,
    quoting: t.admin.st3,
    quoted: t.admin.st4,
    confirmed: t.admin.st5,
  };

  const money = (v: number) => (lang === 'zh' ? fmtCny(v) : fmtCnyEn(v));

  const stats = useMemo(() => {
    const today = new Date().toDateString();
    const todayCount = list.filter((i) => new Date(i.createdAt).toDateString() === today).length;
    const monthAmount = list.reduce((s, i) => s + i.refPrice, 0);
    const regionCount: Record<string, number> = {};
    list.forEach((i) => {
      if (i.region) regionCount[i.region] = (regionCount[i.region] ?? 0) + 1;
    });
    const topRegion = Object.entries(regionCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
    const conv = list.length ? Math.round((list.filter((i) => i.status === 'confirmed' || i.status === 'quoted').length / list.length) * 100) : 0;
    return { todayCount, monthAmount, topRegion, conv };
  }, [list]);

  const changeStatus = async (id: string, status: InquiryStatus) => {
    try {
      const { inquiry, persisted } = await saveInquiryStatus(id, status);
      setList((current) => current.map((item) => (item.id === id ? inquiry : item)));
      setSelected((current) => (current && current.id === id ? inquiry : current));
      if (!persisted) {
        toast.message(lang === 'zh' ? '状态仅更新到当前设备，后台服务尚未启用' : 'Status updated on this device only; the backend is unavailable');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (lang === 'zh' ? '状态更新失败' : 'Could not update inquiry status'));
    }
  };

  const cards = [
    { icon: FileStack, label: t.admin.todayInquiry, value: String(stats.todayCount) },
    { icon: TrendingUp, label: t.admin.monthAmount, value: `${money(stats.monthAmount)} ${lang === 'zh' ? '元' : 'CNY'}` },
    { icon: MapPin, label: t.admin.hotRegion, value: stats.topRegion },
    { icon: Target, label: t.admin.convRate, value: `${stats.conv}%` },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="text-xl sm:text-2xl">{t.admin.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t.admin.subtitle}</p>

        {/* Dashboard */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:mt-6 sm:gap-4 lg:grid-cols-4">
          {cards.map((c) => (
            <div key={c.label} className="rounded-lg border border-border bg-card p-4 sm:p-5">
              <div className="flex items-center gap-1.5 text-muted-foreground sm:gap-2">
                <c.icon className="size-3.5 sm:size-4" />
                <span className="tech-label text-[9px] sm:text-[10px]">{c.label}</span>
              </div>
              <div className="mt-2 font-mono text-lg text-primary sm:mt-3 sm:text-2xl">{c.value}</div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card sm:mt-8">
          <div className="border-b border-border px-4 py-2.5 sm:px-5 sm:py-3">
            <h3 className="text-xs sm:text-sm">{t.admin.inquiryList}</h3>
          </div>
          {list.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground sm:px-5 sm:py-16">{t.admin.empty}</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="tech-label text-[9px] sm:text-[10px]">{t.admin.orderNo}</TableHead>
                    <TableHead className="tech-label text-[9px] sm:text-[10px]">{t.admin.customer}</TableHead>
                    <TableHead className="tech-label hidden text-[9px] sm:table-cell sm:text-[10px]">{t.admin.company}</TableHead>
                    <TableHead className="tech-label hidden text-[9px] md:table-cell sm:text-[10px]">{t.admin.region}</TableHead>
                    <TableHead className="tech-label hidden text-[9px] lg:table-cell sm:text-[10px]">{t.admin.refPrice}</TableHead>
                    <TableHead className="tech-label text-[9px] sm:text-[10px]">{t.admin.status}</TableHead>
                    <TableHead className="tech-label hidden text-[9px] sm:table-cell sm:text-[10px]">{t.admin.time}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((i) => (
                    <TableRow key={i.id} className="cursor-pointer" onClick={() => openInquiry(i)}>
                      <TableCell className="font-mono text-[10px] text-primary sm:text-xs">{i.code}</TableCell>
                      <TableCell className="text-xs sm:text-sm">{i.name}</TableCell>
                      <TableCell className="hidden text-xs sm:table-cell sm:text-sm">{i.company}</TableCell>
                      <TableCell className="hidden max-w-[160px] truncate text-xs text-muted-foreground md:table-cell sm:text-sm">{i.region || '—'}</TableCell>
                      <TableCell className="hidden font-mono text-[10px] lg:table-cell sm:text-xs">
                        {i.refPrice ? money(i.refPrice) : '—'}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Select value={i.status} onValueChange={(v) => changeStatus(i.id, v as InquiryStatus)}>
                          <SelectTrigger className="h-6 w-24 text-[10px] sm:h-7 sm:w-28 sm:text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_ORDER.map((s) => (
                              <SelectItem key={s} value={s} className="text-[10px] sm:text-xs">
                                {statusLabel[s]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="hidden font-mono text-[10px] text-muted-foreground sm:table-cell sm:text-xs">
                        {new Date(i.createdAt).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card sm:mt-8">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5 sm:px-5 sm:py-3">
            <div>
              <h3 className="text-xs sm:text-sm">{lang === 'zh' ? '订单交付' : 'Order delivery'}</h3>
              <p className="mt-1 text-[11px] text-muted-foreground">{lang === 'zh' ? '登记私有 COS 文件并在确认后开放短时下载' : 'Register private COS files and release short-lived downloads after confirmation'}</p>
            </div>
            <span className="font-mono text-xs text-muted-foreground">{orders.length}</span>
          </div>
          {orders.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">{lang === 'zh' ? '暂无服务器订单' : 'No server orders'}</div>
          ) : (
            <div className="divide-y divide-border">
              {orders.map((order) => (
                <div key={order.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-primary">{order.orderNo}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{order.total.toLocaleString()} {order.currency} · {order.quoteNo}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={order.status === 'delivered' ? 'outline' : order.status === 'cancelled' ? 'destructive' : 'secondary'}>{orderStatusLabel(order.status, lang)}</Badge>
                    <Button size="sm" variant="outline" onClick={() => void openDelivery(order)}>{lang === 'zh' ? '管理交付' : 'Manage'}</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-mono">{selected?.code}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-2 text-sm">
              <Detail label={t.admin.customer} value={selected.name} />
              <Detail label={t.inquiry.phone} value={selected.phone} />
              <Detail label={t.inquiry.email} value={selected.email} />
              <Detail label={t.admin.company} value={selected.company} />
              <Detail label={t.admin.region} value={selected.region || '—'} />
              <Detail label={t.inquiry.usage} value={selected.usage || '—'} />
              <Detail label={t.inquiry.product} value={selected.productName || '—'} />
              <Detail label={t.inquiry.expectRes} value={selected.expectRes || '—'} />
              <Detail
                label={t.common.price}
                value={selected.refPrice ? `${money(selected.refPrice)} ${lang === 'zh' ? '元' : 'CNY'}` : '—'}
              />
              <Detail label={t.admin.assignee} value={selected.assignee} />
              {selected.note && (
                <div className="rounded-md border border-border bg-panel p-3 text-muted-foreground">
                  {selected.note}
                </div>
              )}
              <div className="mt-4 space-y-3 border-t border-border pt-4">
                <div className="flex items-center justify-between">
                  <span className="tech-label text-[10px] text-muted-foreground">{lang === 'zh' ? '报价版本' : 'Quote versions'}</span>
                  <span className="text-xs text-muted-foreground">{quotes.filter((quote) => quote.inquiryId === selected.id).length}</span>
                </div>
                {quotes.filter((quote) => quote.inquiryId === selected.id).map((quote) => (
                  <div key={quote.id} className="flex items-center justify-between gap-3 rounded-md border border-border bg-panel p-2 text-xs">
                    <div>
                      <div className="font-mono text-primary">{quote.quoteNo} · v{quote.version}</div>
                      <div className="mt-1 text-muted-foreground">{quote.total.toLocaleString()} {quote.currency} · {quote.deliveryDays}d · {quote.status}</div>
                    </div>
                    {quote.status === 'draft' && (
                      <Button size="sm" variant="outline" onClick={() => changeQuoteStatus(quote, 'sent')}>
                        {lang === 'zh' ? '发送' : 'Send'}
                      </Button>
                    )}
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px]">{lang === 'zh' ? '金额' : 'Subtotal'}</Label>
                    <Input value={quoteForm.subtotal} onChange={(event) => setQuoteForm((current) => ({ ...current, subtotal: event.target.value }))} type="number" min="0" className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">{lang === 'zh' ? '币种' : 'Currency'}</Label>
                    <Select value={quoteForm.currency} onValueChange={(value) => setQuoteForm((current) => ({ ...current, currency: value as QuoteCurrency }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{(['CNY', 'USD', 'EUR', 'AED'] as QuoteCurrency[]).map((currency) => <SelectItem key={currency} value={currency}>{currency}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">{lang === 'zh' ? '税率 %' : 'Tax %'}</Label>
                    <Input value={quoteForm.taxRate} onChange={(event) => setQuoteForm((current) => ({ ...current, taxRate: event.target.value }))} type="number" min="0" max="100" className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">{lang === 'zh' ? '交付天数' : 'Delivery days'}</Label>
                    <Input value={quoteForm.deliveryDays} onChange={(event) => setQuoteForm((current) => ({ ...current, deliveryDays: event.target.value }))} type="number" min="1" max="365" className="h-8 text-xs" />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-[10px]">{lang === 'zh' ? '有效期' : 'Valid until'}</Label>
                    <Input value={quoteForm.validUntil} onChange={(event) => setQuoteForm((current) => ({ ...current, validUntil: event.target.value }))} type="date" className="h-8 text-xs" />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-[10px]">{lang === 'zh' ? '报价说明' : 'Notes'}</Label>
                    <Textarea value={quoteForm.notes} onChange={(event) => setQuoteForm((current) => ({ ...current, notes: event.target.value }))} rows={2} className="text-xs" />
                  </div>
                </div>
                <Button size="sm" className="w-full" onClick={createDraftQuote} disabled={quoteBusy || !quoteForm.subtotal || !quoteForm.validUntil}>
                  {quoteBusy ? (lang === 'zh' ? '创建中...' : 'Creating...') : (lang === 'zh' ? '创建报价草稿' : 'Create quote draft')}
                </Button>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <Badge variant={STATUS_VARIANT[selected.status]}>{statusLabel[selected.status]}</Badge>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!deliveryOrder} onOpenChange={(open) => !open && setDeliveryOrder(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-mono">{deliveryOrder?.orderNo} · {lang === 'zh' ? '交付管理' : 'Delivery management'}</DialogTitle>
          </DialogHeader>
          {deliveryOrder && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-panel p-3 text-xs">
                <span>{lang === 'zh' ? '当前状态' : 'Current status'}：<Badge variant="secondary">{orderStatusLabel(deliveryOrder.status, lang)}</Badge></span>
                {deliveryOrder.status !== 'delivered' && deliveryOrder.status !== 'cancelled' && (
                  <Button size="sm" onClick={() => void markDelivered()} disabled={deliveryBusy || deliveryAssets.filter((asset) => !asset.revokedAt).length === 0}>
                    <CheckCircle2 className="size-3.5" />{lang === 'zh' ? '标记已交付' : 'Mark delivered'}
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between"><Label className="text-xs">{lang === 'zh' ? '交付文件' : 'Delivery files'}</Label><span className="text-xs text-muted-foreground">{deliveryAssets.length}</span></div>
                {deliveryLoading ? <p className="text-xs text-muted-foreground">{lang === 'zh' ? '加载中…' : 'Loading…'}</p> : deliveryAssets.length === 0 ? <p className="text-xs text-muted-foreground">{lang === 'zh' ? '尚未登记文件' : 'No files registered'}</p> : deliveryAssets.map((asset) => (
                  <div key={asset.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-2 text-xs">
                    <div className="min-w-0"><p className={`truncate ${asset.revokedAt ? 'text-muted-foreground line-through' : ''}`}>{asset.fileName}</p><p className="mt-1 text-[11px] text-muted-foreground">{asset.contentType} · {formatBytes(asset.sizeBytes)}</p></div>
                    {!asset.revokedAt && <Button size="sm" variant="ghost" onClick={() => void revokeDeliveryFile(asset)} disabled={deliveryBusy}><RotateCcw className="size-3.5" />{lang === 'zh' ? '撤销' : 'Revoke'}</Button>}
                  </div>
                ))}
              </div>
              {deliveryOrder.status !== 'delivered' && deliveryOrder.status !== 'cancelled' && (
                <div className="space-y-2 border-t border-border pt-3">
                  <Label className="text-xs">{lang === 'zh' ? '登记 COS 对象' : 'Register COS object'}</Label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input placeholder="delivery/2026/order.zip" value={assetForm.objectKey} onChange={(event) => setAssetForm((current) => ({ ...current, objectKey: event.target.value }))} className="h-8 text-xs sm:col-span-2" />
                    <Input placeholder={lang === 'zh' ? '文件名' : 'File name'} value={assetForm.fileName} onChange={(event) => setAssetForm((current) => ({ ...current, fileName: event.target.value }))} className="h-8 text-xs" />
                    <Input placeholder="application/zip" value={assetForm.contentType} onChange={(event) => setAssetForm((current) => ({ ...current, contentType: event.target.value }))} className="h-8 text-xs" />
                    <Input placeholder={lang === 'zh' ? '大小（字节，可选）' : 'Size in bytes (optional)'} value={assetForm.sizeBytes} onChange={(event) => setAssetForm((current) => ({ ...current, sizeBytes: event.target.value }))} type="number" min="0" className="h-8 text-xs" />
                    <Input placeholder="SHA-256（可选）" value={assetForm.sha256} onChange={(event) => setAssetForm((current) => ({ ...current, sha256: event.target.value }))} className="h-8 text-xs" />
                  </div>
                  <Button size="sm" className="w-full" onClick={() => void addDeliveryFile()} disabled={deliveryBusy || !assetForm.objectKey.trim() || !assetForm.fileName.trim()}><FilePlus2 className="size-3.5" />{deliveryBusy ? (lang === 'zh' ? '处理中…' : 'Working…') : (lang === 'zh' ? '登记文件' : 'Register file')}</Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function defaultValidUntil() {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().slice(0, 10);
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 pb-2">
      <span className="tech-label shrink-0 text-[10px] text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

function orderStatusLabel(status: ServerOrder['status'], lang: string) {
  const labels: Record<ServerOrder['status'], [string, string]> = {
    pending_payment: ['待支付', 'Pending payment'],
    paid: ['已支付', 'Paid'],
    fulfillment: ['交付中', 'Fulfillment'],
    delivered: ['已交付', 'Delivered'],
    cancelled: ['已取消', 'Cancelled'],
  };
  return labels[status][lang === 'zh' ? 0 : 1];
}

function formatBytes(value?: number) {
  if (value == null || !Number.isFinite(value)) return '—';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
