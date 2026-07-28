import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, Download, Package } from 'lucide-react';
import { useI18n } from '../i18n';
import { useCart } from '../context/CartContext';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { fmtCny, fmtCnyEn } from '../lib/pricing';

export function OrderDetail() {
  const { id } = useParams();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const { getOrder } = useCart();

  const order = id ? getOrder(id) : undefined;

  const money = (v: number) => (lang === 'zh' ? fmtCny(v) : fmtCnyEn(v));
  const cny = lang === 'zh' ? '元' : 'CNY';

  const statusLabels = {
    pending: { zh: '待支付', en: 'Pending', variant: 'secondary' as const },
    paid: { zh: '已支付', en: 'Paid', variant: 'default' as const },
    processing: { zh: '处理中', en: 'Processing', variant: 'default' as const },
    completed: { zh: '已完成', en: 'Completed', variant: 'outline' as const },
    cancelled: { zh: '已取消', en: 'Cancelled', variant: 'destructive' as const },
  };

  const processLevelLabels = {
    raw: lang === 'zh' ? '原始数据' : 'Raw Data',
    standard: lang === 'zh' ? '标准处理' : 'Standard',
    analysis: lang === 'zh' ? '分析就绪' : 'Analysis Ready',
  };

  const paymentMethodLabels = {
    alipay: lang === 'zh' ? '支付宝' : 'Alipay',
    wechat: lang === 'zh' ? '微信支付' : 'WeChat Pay',
    bank: lang === 'zh' ? '银行转账' : 'Bank Transfer',
  };

  if (!order) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
        <Package className="size-16 opacity-50" />
        <p>{lang === 'zh' ? '订单不存在' : 'Order not found'}</p>
        <Button onClick={() => navigate('/orders')}>
          {lang === 'zh' ? '返回订单列表' : 'Back to Orders'}
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1200px] px-6 py-8">
        <Button variant="ghost" size="sm" className="mb-4 gap-1" onClick={() => navigate('/orders')}>
          <ArrowLeft className="size-4" />
          {lang === 'zh' ? '返回订单列表' : 'Back to Orders'}
        </Button>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl">{lang === 'zh' ? '订单详情' : 'Order Details'}</h1>
            <p className="mt-1 font-mono text-sm text-muted-foreground">{order.id}</p>
          </div>
          <Badge variant={statusLabels[order.status].variant} className="text-sm">
            {lang === 'zh' ? statusLabels[order.status].zh : statusLabels[order.status].en}
          </Badge>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          {/* Order info */}
          <div className="space-y-6 lg:col-span-2">
            {/* Items */}
            <section className="rounded-lg border border-border bg-card p-5">
              <h3 className="tech-label mb-4 text-xs text-muted-foreground">
                {lang === 'zh' ? '订单商品' : 'Order Items'}
              </h3>
              <div className="space-y-4">
                {order.items.map((item, idx) => (
                  <div key={idx} className="flex gap-4 border-b border-border pb-4 last:border-0 last:pb-0">
                    <img
                      src={item.product.thumbnail}
                      alt={lang === 'zh' ? item.product.productName : item.product.productNameEn}
                      className="size-20 rounded object-cover"
                    />
                    <div className="flex-1">
                      <h4 className="font-medium">
                        {lang === 'zh' ? item.product.productName : item.product.productNameEn}
                      </h4>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.product.productCode} · {processLevelLabels[item.processLevel]}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {lang === 'zh' ? '数量' : 'Quantity'}: {item.quantity}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono">
                        {money(item.price)} {cny}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Timeline */}
            <section className="rounded-lg border border-border bg-card p-5">
              <h3 className="tech-label mb-4 text-xs text-muted-foreground">
                {lang === 'zh' ? '订单进度' : 'Order Timeline'}
              </h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="mt-1 size-2 rounded-full bg-primary" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{lang === 'zh' ? '订单创建' : 'Order Created'}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(order.createdAt).toLocaleString(lang)}
                    </p>
                  </div>
                </div>
                {order.paidAt && (
                  <div className="flex items-start gap-3">
                    <div className="mt-1 size-2 rounded-full bg-primary" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{lang === 'zh' ? '支付完成' : 'Payment Completed'}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(order.paidAt).toLocaleString(lang)}
                      </p>
                    </div>
                  </div>
                )}
                {order.deliveredAt && (
                  <div className="flex items-start gap-3">
                    <div className="mt-1 size-2 rounded-full bg-primary" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{lang === 'zh' ? '交付完成' : 'Delivered'}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(order.deliveredAt).toLocaleString(lang)}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Download section */}
            {order.status === 'completed' && order.deliveryUrl && (
              <section className="rounded-lg border border-border bg-card p-5">
                <h3 className="tech-label mb-4 text-xs text-muted-foreground">
                  {lang === 'zh' ? '数据下载' : 'Download Data'}
                </h3>
                <Button className="w-full" onClick={() => window.open(order.deliveryUrl, '_blank')}>
                  <Download className="size-4" />
                  {lang === 'zh' ? '下载数据' : 'Download Data'}
                </Button>
                <p className="mt-2 text-xs text-muted-foreground">
                  {lang === 'zh' ? '下载链接有效期30天' : 'Download link valid for 30 days'}
                </p>
              </section>
            )}
          </div>

          {/* Summary */}
          <div className="lg:col-span-1">
            <div className="sticky top-6 space-y-6">
              <section className="rounded-lg border border-border bg-card p-5">
                <h3 className="tech-label mb-4 text-xs text-muted-foreground">
                  {lang === 'zh' ? '订单信息' : 'Order Info'}
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{lang === 'zh' ? '支付方式' : 'Payment'}</span>
                    <span>{order.paymentMethod ? paymentMethodLabels[order.paymentMethod] : '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{lang === 'zh' ? '商品数量' : 'Items'}</span>
                    <span>{order.items.reduce((sum, item) => sum + item.quantity, 0)}</span>
                  </div>
                  <div className="border-t border-border pt-2">
                    <div className="flex justify-between text-lg">
                      <span className="font-medium">{lang === 'zh' ? '订单金额' : 'Total'}</span>
                      <span className="font-mono text-primary">
                        {money(order.totalAmount)} {cny}
                      </span>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
