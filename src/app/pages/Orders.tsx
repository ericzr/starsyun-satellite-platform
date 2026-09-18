import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ChevronDown, ExternalLink, Eye, FileJson, MapPin, Package } from 'lucide-react';
import { useI18n } from '../i18n';
import { useCart } from '../context/CartContext';
import { loadCustomerOrders, type ServerOrder } from '../lib/orders';
import { loadPublicDownloads, type PublicDownload } from '../lib/downloads';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { fmtCny, fmtCnyEn } from '../lib/pricing';

function snapshotText(snapshot: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = snapshot[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

function orderRegions(order: ServerOrder) {
  return Array.from(
    new Set(
      order.items
        .map((item) =>
          snapshotText(item.productSnapshot, ['region', 'regionName', 'area', 'targetArea']),
        )
        .filter(Boolean),
    ),
  );
}

function orderDataTypes(order: ServerOrder) {
  return Array.from(
    new Set(
      order.items
        .map(
          (item) =>
            snapshotText(item.productSnapshot, [
              'dataType',
              'sensorType',
              'productType',
              'itemType',
            ]) || item.itemType,
        )
        .filter(Boolean),
    ),
  );
}

export function Orders() {
  const { lang } = useI18n();
  const navigate = useNavigate();
  const { orders } = useCart();
  const [serverOrders, setServerOrders] = useState<ServerOrder[]>([]);
  const [downloads, setDownloads] = useState<PublicDownload[]>([]);
  const [expandedOrders, setExpandedOrders] = useState<string[]>([]);
  const demoDataEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_MOCK_DATA === 'true';
  const localOrders = demoDataEnabled ? orders : [];

  useEffect(() => {
    loadCustomerOrders()
      .then(setServerOrders)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    loadPublicDownloads()
      .then(setDownloads)
      .catch(() => undefined);
  }, []);

  const money = (v: number) => (lang === 'zh' ? fmtCny(v) : fmtCnyEn(v));
  const cny = lang === 'zh' ? '元' : 'CNY';

  const orderSummary = useMemo(
    () => ({
      total: serverOrders.length + localOrders.length,
      active: serverOrders.filter(
        (order) => order.status === 'paid' || order.status === 'fulfillment',
      ).length,
      delivered: serverOrders.filter((order) => order.status === 'delivered').length,
      downloads: downloads.length,
    }),
    [downloads.length, localOrders.length, serverOrders],
  );

  const statusLabels = {
    pending: { zh: '待支付', en: 'Pending', variant: 'secondary' as const },
    paid: { zh: '已支付', en: 'Paid', variant: 'default' as const },
    processing: { zh: '处理中', en: 'Processing', variant: 'default' as const },
    completed: { zh: '已完成', en: 'Completed', variant: 'outline' as const },
    cancelled: { zh: '已取消', en: 'Cancelled', variant: 'destructive' as const },
  };

  if (localOrders.length === 0 && serverOrders.length === 0 && downloads.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
        <Package className="size-16 opacity-50" />
        <p>{lang === 'zh' ? '暂无订单' : 'No orders yet'}</p>
        <Button onClick={() => navigate('/explore')}>
          {lang === 'zh' ? '去选购' : 'Browse Products'}
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1200px] px-6 py-8">
        <h1 className="text-2xl">{lang === 'zh' ? '我的订单与下载记录' : 'Orders & Downloads'}</h1>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            [lang === 'zh' ? '订单总数' : 'Orders', orderSummary.total],
            [lang === 'zh' ? '处理中' : 'Active', orderSummary.active],
            [lang === 'zh' ? '已交付' : 'Delivered', orderSummary.delivered],
            [lang === 'zh' ? '下载记录' : 'Downloads', orderSummary.downloads],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-2 font-mono text-2xl text-primary">{value}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 space-y-4">
          {serverOrders.length > 0 && (
            <section className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h2 className="text-sm font-medium">
                  {lang === 'zh' ? '服务器订单' : 'Server orders'}
                </h2>
                <span className="text-xs text-muted-foreground">{serverOrders.length}</span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{lang === 'zh' ? '订单编号' : 'Order No.'}</TableHead>
                    <TableHead>{lang === 'zh' ? '订单时间' : 'Created'}</TableHead>
                    <TableHead>{lang === 'zh' ? '数据类型' : 'Data type'}</TableHead>
                    <TableHead>{lang === 'zh' ? '数据景数' : 'Items'}</TableHead>
                    <TableHead>{lang === 'zh' ? '状态' : 'Status'}</TableHead>
                    <TableHead className="text-right">
                      {lang === 'zh' ? '操作' : 'Actions'}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {serverOrders.map((order) => {
                    const status = {
                      pending_payment: {
                        zh: '待支付',
                        en: 'Pending payment',
                        variant: 'secondary' as const,
                      },
                      paid: { zh: '已支付', en: 'Paid', variant: 'default' as const },
                      fulfillment: {
                        zh: '交付处理中',
                        en: 'Fulfillment',
                        variant: 'default' as const,
                      },
                      delivered: { zh: '已交付', en: 'Delivered', variant: 'outline' as const },
                      cancelled: { zh: '已取消', en: 'Cancelled', variant: 'destructive' as const },
                    }[order.status];
                    const expanded = expandedOrders.includes(order.id);
                    const regions = orderRegions(order);
                    const dataTypes = orderDataTypes(order);
                    return (
                      <Fragment key={order.id}>
                        <TableRow>
                          <TableCell className="font-mono text-xs text-primary">
                            {order.orderNo}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(order.createdAt).toLocaleString(lang)}
                          </TableCell>
                          <TableCell className="max-w-[180px] truncate text-xs">
                            {dataTypes.join(' / ') || '—'}
                          </TableCell>
                          <TableCell className="text-xs">{order.items?.length ?? 0}</TableCell>
                          <TableCell>
                            <Badge variant={status.variant}>
                              {lang === 'zh' ? status.zh : status.en}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 gap-1 px-2 text-xs"
                                onClick={() =>
                                  setExpandedOrders((current) =>
                                    current.includes(order.id)
                                      ? current.filter((id) => id !== order.id)
                                      : [...current, order.id],
                                  )
                                }
                              >
                                <ChevronDown
                                  className={`size-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
                                />
                                {lang === 'zh' ? '展开' : 'Expand'}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 gap-1 px-2 text-xs"
                                onClick={() => navigate(`/orders/${order.id}`)}
                              >
                                <Eye className="size-3.5" />
                                {lang === 'zh' ? '详情' : 'Details'}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {expanded && (
                          <TableRow className="bg-muted/20 hover:bg-muted/20">
                            <TableCell colSpan={6} className="whitespace-normal p-0">
                              <div className="grid gap-4 px-4 py-4 md:grid-cols-3">
                                <div>
                                  <p className="flex items-center gap-1 text-xs font-medium">
                                    <MapPin className="size-3.5 text-primary" />
                                    {lang === 'zh' ? '订单范围' : 'Order scope'}
                                  </p>
                                  <p className="mt-2 text-xs text-muted-foreground">
                                    {regions.join('、') ||
                                      (lang === 'zh' ? '未记录区域' : 'No area recorded')}
                                  </p>
                                </div>
                                <div>
                                  <p className="flex items-center gap-1 text-xs font-medium">
                                    <FileJson className="size-3.5 text-primary" />
                                    {lang === 'zh' ? '订单元数据' : 'Order metadata'}
                                  </p>
                                  <p className="mt-2 text-xs text-muted-foreground">
                                    {order.quoteNo} · {order.currency} · {order.paymentStatus}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs font-medium">
                                    {lang === 'zh' ? '金额与交付' : 'Amount & delivery'}
                                  </p>
                                  <p className="mt-2 text-xs text-muted-foreground">
                                    {order.total.toLocaleString()} {order.currency} ·{' '}
                                    {order.deliveryDays} {lang === 'zh' ? '天' : 'days'}
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </section>
          )}

          {localOrders.map((order) => (
            <div key={order.id} className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm text-muted-foreground">{order.id}</span>
                    <Badge variant={statusLabels[order.status].variant}>
                      {lang === 'zh'
                        ? statusLabels[order.status].zh
                        : statusLabels[order.status].en}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {lang === 'zh' ? '下单时间' : 'Created'}:{' '}
                    {new Date(order.createdAt).toLocaleString(lang)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-lg text-primary">
                    {money(order.totalAmount)} {cny}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={() => navigate(`/orders/${order.id}`)}
                  >
                    <Eye className="size-4" />
                    {lang === 'zh' ? '查看详情' : 'View Details'}
                  </Button>
                </div>
              </div>

              <div className="mt-4 border-t border-border pt-4">
                <p className="text-xs text-muted-foreground">
                  {lang === 'zh' ? '商品数量' : 'Items'}:{' '}
                  {order.items.reduce((sum, item) => sum + item.quantity, 0)}
                </p>
              </div>
            </div>
          ))}
          {downloads.length > 0 && (
            <section className="pt-2">
              <h2 className="tech-label mb-3 text-xs text-muted-foreground">
                {lang === 'zh' ? '公开数据下载记录' : 'Public data downloads'}
              </h2>
              <div className="space-y-3">
                {downloads.map((download) => (
                  <div key={download.id} className="rounded-lg border border-border bg-card p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-medium">{download.productName}</span>
                          <Badge variant="secondary">
                            {lang === 'zh' ? '公开数据' : 'Open data'}
                          </Badge>
                        </div>
                        <p className="mt-2 font-mono text-xs text-muted-foreground">
                          {download.productCode}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {download.provider || (lang === 'zh' ? '公开数据源' : 'Public source')} ·{' '}
                          {new Date(download.requestedAt).toLocaleString(lang)}
                        </p>
                        {download.fileFormat && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {download.fileFormat}
                          </p>
                        )}
                      </div>
                      <a
                        href={download.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                      >
                        <ExternalLink className="size-4" />
                        {lang === 'zh' ? '打开数据源' : 'Open source'}
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
