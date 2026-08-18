import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Package, Eye } from 'lucide-react';
import { useI18n } from '../i18n';
import { useCart } from '../context/CartContext';
import { loadCustomerOrders, type ServerOrder } from '../lib/orders';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { fmtCny, fmtCnyEn } from '../lib/pricing';

export function Orders() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const { orders } = useCart();
  const [serverOrders, setServerOrders] = useState<ServerOrder[]>([]);

  useEffect(() => {
    loadCustomerOrders().then(setServerOrders).catch(() => undefined);
  }, []);

  const money = (v: number) => (lang === 'zh' ? fmtCny(v) : fmtCnyEn(v));
  const cny = lang === 'zh' ? '元' : 'CNY';

  const statusLabels = {
    pending: { zh: '待支付', en: 'Pending', variant: 'secondary' as const },
    paid: { zh: '已支付', en: 'Paid', variant: 'default' as const },
    processing: { zh: '处理中', en: 'Processing', variant: 'default' as const },
    completed: { zh: '已完成', en: 'Completed', variant: 'outline' as const },
    cancelled: { zh: '已取消', en: 'Cancelled', variant: 'destructive' as const },
  };

  if (orders.length === 0 && serverOrders.length === 0) {
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
        <h1 className="text-2xl">{lang === 'zh' ? '我的订单' : 'My Orders'}</h1>

        <div className="mt-6 space-y-4">
          {serverOrders.map((order) => {
            const status = {
              pending_payment: { zh: '待支付', en: 'Pending payment', variant: 'secondary' as const },
              paid: { zh: '已支付', en: 'Paid', variant: 'default' as const },
              fulfillment: { zh: '交付处理中', en: 'Fulfillment', variant: 'default' as const },
              delivered: { zh: '已交付', en: 'Delivered', variant: 'outline' as const },
              cancelled: { zh: '已取消', en: 'Cancelled', variant: 'destructive' as const },
            }[order.status];
            return (
              <div key={order.id} className="rounded-lg border border-primary/30 bg-primary/5 p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm text-primary">{order.orderNo}</span>
                      <Badge variant={status.variant}>{lang === 'zh' ? status.zh : status.en}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{lang === 'zh' ? '报价单' : 'Quote'}: {order.quoteNo} · {new Date(order.createdAt).toLocaleString(lang)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-lg text-primary">{order.total.toLocaleString()} {order.currency}</p>
                    <Button size="sm" variant="outline" className="mt-2" onClick={() => navigate(`/orders/${order.id}`)}>
                      <Eye className="size-4" />
                      {lang === 'zh' ? '查看详情' : 'View Details'}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
          {orders.map((order) => (
            <div key={order.id} className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm text-muted-foreground">{order.id}</span>
                    <Badge variant={statusLabels[order.status].variant}>
                      {lang === 'zh' ? statusLabels[order.status].zh : statusLabels[order.status].en}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {lang === 'zh' ? '下单时间' : 'Created'}: {new Date(order.createdAt).toLocaleString(lang)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-lg text-primary">
                    {money(order.totalAmount)} {cny}
                  </p>
                  <Button size="sm" variant="outline" className="mt-2" onClick={() => navigate(`/orders/${order.id}`)}>
                    <Eye className="size-4" />
                    {lang === 'zh' ? '查看详情' : 'View Details'}
                  </Button>
                </div>
              </div>

              <div className="mt-4 border-t border-border pt-4">
                <p className="text-xs text-muted-foreground">
                  {lang === 'zh' ? '商品数量' : 'Items'}: {order.items.reduce((sum, item) => sum + item.quantity, 0)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
