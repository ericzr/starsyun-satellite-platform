import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useI18n } from '../i18n';
import { useUser } from '../context/UserContext';
import { useCart } from '../context/CartContext';
import { VALUE_ADDED_SERVICES } from '../data/products';
import { loadCustomerInquiries, type Inquiry, type InquiryStatus } from '../lib/inquiries';
import { acceptQuote, loadCustomerQuotes, type Quote } from '../lib/quotes';
import { loadCustomerOrders, type ServerOrder } from '../lib/orders';
import { loadPublicDownloads, type PublicDownload } from '../lib/downloads';
import { fmtCny, fmtCnyEn } from '../lib/pricing';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { User, ShoppingCart, Package, FileText, Settings, LogOut, Trash2, Plus, Minus, Clock, CheckCircle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

type TabValue = 'cart' | 'orders' | 'inquiries';

export function Profile() {
  const { lang } = useI18n();
  const navigate = useNavigate();
  const { user, logout } = useUser();
  const { items, orders, removeFromCart, updateQuantity } = useCart();
  const demoDataEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_MOCK_DATA === 'true';
  const localOrders = demoDataEnabled ? orders : [];
  const checkoutEnabled = import.meta.env.DEV
    || import.meta.env.VITE_ENABLE_MOCK_DATA === 'true'
    || import.meta.env.VITE_ENABLE_CHECKOUT === 'true';
  const [activeTab, setActiveTab] = useState<TabValue>('cart');

  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [serverOrders, setServerOrders] = useState<ServerOrder[]>([]);
  const [downloads, setDownloads] = useState<PublicDownload[]>([]);
  const [acceptingQuote, setAcceptingQuote] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadCustomerInquiries(user?.email, user?.phone).then(({ inquiries: next }) => {
      if (active) setInquiries(next);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [user?.email, user?.phone]);

  useEffect(() => {
    let active = true;
    loadCustomerQuotes().then((next) => {
      if (active) setQuotes(next);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [user?.id]);

  useEffect(() => {
    let active = true;
    loadPublicDownloads().then((next) => {
      if (active) setDownloads(next);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [user?.id]);

  useEffect(() => {
    let active = true;
    loadCustomerOrders().then((next) => {
      if (active) setServerOrders(next);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [user?.id]);

  const cartCount = items.reduce((sum, item) => sum + item.quantity, 0);
  // CartItem.price is the current line total (CartContext updates it when the
  // quantity changes), so multiplying by quantity here would double-count it.
  const cartTotal = items.reduce((sum, item) => sum + item.price, 0);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const handleCheckout = () => {
    if (items.length === 0) {
      toast.error(lang === 'zh' ? '购物车为空' : 'Cart is empty');
      return;
    }
    navigate('/checkout');
  };

  const money = (v: number) => (lang === 'zh' ? fmtCny(v) : fmtCnyEn(v));

  const acceptCustomerQuote = async (quote: Quote) => {
    setAcceptingQuote(quote.id);
    try {
      const result = await acceptQuote(quote.id);
      setQuotes((current) => current.map((item) => item.id === quote.id ? result.quote : item));
      if (result.order) setServerOrders((current) => [result.order!, ...current.filter((item) => item.id !== result.order?.id)]);
      toast.success(lang === 'zh' ? `报价已接受，订单 ${result.order?.orderNo ?? ''} 已生成` : `Quote accepted. Order ${result.order?.orderNo ?? ''} created.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (lang === 'zh' ? '接受报价失败' : 'Could not accept quote'));
    } finally {
      setAcceptingQuote(null);
    }
  };

  const statusConfig: Record<InquiryStatus, { label: string; labelEn: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: any }> = {
    submitted: { label: '已提交', labelEn: 'Submitted', variant: 'secondary', icon: Clock },
    pending: { label: '处理中', labelEn: 'Pending', variant: 'secondary', icon: Clock },
    quoting: { label: '报价中', labelEn: 'Quoting', variant: 'default', icon: FileText },
    quoted: { label: '已报价', labelEn: 'Quoted', variant: 'default', icon: CheckCircle },
    confirmed: { label: '已确认', labelEn: 'Confirmed', variant: 'outline', icon: CheckCircle },
  };

  const orderStatusConfig: Record<string, { label: string; labelEn: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    pending: { label: '待支付', labelEn: 'Pending', variant: 'secondary' },
    paid: { label: '已支付', labelEn: 'Paid', variant: 'default' },
    processing: { label: '处理中', labelEn: 'Processing', variant: 'default' },
    completed: { label: '已完成', labelEn: 'Completed', variant: 'outline' },
    cancelled: { label: '已取消', labelEn: 'Cancelled', variant: 'destructive' },
  };

  const formatDate = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {/* User Info Card */}
        <Card className="p-4 sm:p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="shrink-0">
                {user?.avatar ? (
                  <img src={user.avatar} alt={user.name} className="size-12 rounded-full sm:size-16" />
                ) : (
                  <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 sm:size-16">
                    <User className="size-6 text-primary sm:size-8" />
                  </div>
                )}
              </div>
              <div className="flex-1">
                <h2 className="text-base font-medium sm:text-lg">{user?.name}</h2>
                <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{user?.email}</p>
                {user?.phone && (
                  <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{user.phone}</p>
                )}
                {user?.company && (
                  <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{user.company}</p>
                )}
                {user?.role === 'admin' && (
                  <span className="mt-2 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    {lang === 'zh' ? '管理员' : 'Admin'}
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              {user?.role === 'admin' && (
                <Button variant="outline" size="sm" onClick={() => navigate('/admin')}>
                  <Settings className="size-4" />
                  <span className="ml-2 hidden sm:inline">{lang === 'zh' ? '控制台' : 'Admin'}</span>
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut className="size-4" />
                <span className="ml-2 hidden sm:inline">{lang === 'zh' ? '退出' : 'Logout'}</span>
              </Button>
            </div>
          </div>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)} className="mt-6">
          <TabsList className="w-full">
            <TabsTrigger value="cart" className="flex-1 gap-2">
              <ShoppingCart className="size-4" />
              {lang === 'zh' ? '购物车' : 'Cart'}
              {cartCount > 0 && <Badge variant="secondary" className="ml-1">{cartCount}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="orders" className="flex-1 gap-2">
              <Package className="size-4" />
              {lang === 'zh' ? '订单' : 'Orders'}
              {localOrders.length + serverOrders.length + downloads.length > 0 && <Badge variant="secondary" className="ml-1">{localOrders.length + serverOrders.length + downloads.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="inquiries" className="flex-1 gap-2">
              <FileText className="size-4" />
              {lang === 'zh' ? '询价' : 'Inquiries'}
              {inquiries.length > 0 && <Badge variant="secondary" className="ml-1">{inquiries.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          {/* Cart Tab */}
          <TabsContent value="cart" className="mt-6">
            {items.length === 0 ? (
              <div className="flex min-h-[300px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 p-8">
                <ShoppingCart className="mb-4 size-12 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">{lang === 'zh' ? '购物车为空' : 'Cart is empty'}</p>
                <Button variant="outline" className="mt-4" onClick={() => navigate('/explore')}>
                  {lang === 'zh' ? '去选购' : 'Browse Products'}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {items.map((item) => (
                  <div key={`${item.product.id}-${item.processLevel}-${(item.services ?? []).join('-')}`} className="rounded-lg border border-border bg-card p-4">
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <h3 className="font-medium">{lang === 'zh' ? item.product.productName : item.product.productNameEn}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {lang === 'zh' ? '处理级别' : 'Processing'}: {({
                            raw: lang === 'zh' ? '原始数据' : 'Raw Data',
                            standard: lang === 'zh' ? '标准处理' : 'Standard',
                            analysis: lang === 'zh' ? '分析就绪' : 'Analysis Ready',
                            L1: lang === 'zh' ? 'L1 原始数据' : 'L1 Raw Data',
                            L2: lang === 'zh' ? 'L2 标准产品' : 'L2 Standard Product',
                            L3: lang === 'zh' ? 'L3 正射影像' : 'L3 Orthorectified',
                            L4: lang === 'zh' ? 'L4 增值产品' : 'L4 Value-Added',
                          }[item.processLevel])}
                        </p>
                        {(item.services ?? []).length > 0 && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {lang === 'zh' ? '增值服务' : 'Services'}: {(item.services ?? []).map((id) => VALUE_ADDED_SERVICES.find((service) => service.id === id)?.[lang === 'zh' ? 'name' : 'nameEn'] ?? id).join(', ')}
                          </p>
                        )}
                        <p className="mt-2 text-lg font-medium text-primary">
                          {money(item.price)} {lang === 'zh' ? '元' : 'CNY'}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeFromCart(item.product.id, item.processLevel, item.services ?? [])}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            className="size-8"
                            onClick={() => updateQuantity(item.product.id, Math.max(1, item.quantity - 1), item.processLevel, item.services ?? [])}
                          >
                            <Minus className="size-3" />
                          </Button>
                          <span className="w-8 text-center">{item.quantity}</span>
                          <Button
                            variant="outline"
                            size="icon"
                            className="size-8"
                            onClick={() => updateQuantity(item.product.id, item.quantity + 1, item.processLevel, item.services ?? [])}
                          >
                            <Plus className="size-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                <div className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-medium">{lang === 'zh' ? '总计' : 'Total'}</span>
                    <span className="text-2xl font-medium text-primary">
                      {money(cartTotal)} {lang === 'zh' ? '元' : 'CNY'}
                    </span>
                  </div>
                  <Button className="mt-4 w-full" size="lg" disabled={!checkoutEnabled} onClick={handleCheckout}>
                    {checkoutEnabled
                      ? (lang === 'zh' ? '去结算' : 'Checkout')
                      : (lang === 'zh' ? '在线结算未开放' : 'Checkout unavailable')}
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Orders Tab */}
          <TabsContent value="orders" className="mt-6">
            {localOrders.length === 0 && serverOrders.length === 0 && downloads.length === 0 ? (
              <div className="flex min-h-[300px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 p-8">
                <Package className="mb-4 size-12 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">{lang === 'zh' ? '暂无订单' : 'No orders yet'}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {serverOrders.map((order) => {
                  const status = {
                    pending_payment: { label: '待支付', labelEn: 'Pending payment', variant: 'secondary' as const },
                    paid: { label: '已支付', labelEn: 'Paid', variant: 'default' as const },
                    fulfillment: { label: '交付处理中', labelEn: 'Fulfillment', variant: 'default' as const },
                    delivered: { label: '已交付', labelEn: 'Delivered', variant: 'outline' as const },
                    cancelled: { label: '已取消', labelEn: 'Cancelled', variant: 'destructive' as const },
                  }[order.status];
                  return (
                    <div key={order.id} className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm text-primary">{order.orderNo}</span>
                            <Badge variant={status.variant}>{lang === 'zh' ? status.label : status.labelEn}</Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{lang === 'zh' ? '报价单' : 'Quote'}: {order.quoteNo} · {formatDate(order.createdAt)}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {lang === 'zh' ? '订单明细' : 'Line items'}: {order.items?.length ?? 0}
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-lg text-primary">{order.total.toLocaleString()} {order.currency}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{lang === 'zh' ? '支付状态' : 'Payment'}: {order.paymentStatus}</div>
                        </div>
                      </div>
                      {(order.items?.length ?? 0) > 0 && (
                        <div className="mt-3 space-y-1 border-t border-primary/20 pt-3 text-xs text-muted-foreground">
                          {order.items.map((item) => {
                            const snapshot = item.productSnapshot ?? {};
                            const name = typeof snapshot.productName === 'string' && snapshot.productName ? snapshot.productName : item.itemType;
                            return (
                              <div key={item.id} className="flex items-center justify-between gap-3">
                                <span className="truncate">{name} × {item.quantity}</span>
                                <span className="shrink-0 font-mono">{money(item.unitPrice)} {item.currency}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                {localOrders.map((order) => {
                  const statusInfo = orderStatusConfig[order.status];
                  return (
                    <div
                      key={order.id}
                      className="cursor-pointer rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent/50"
                      onClick={() => navigate(`/orders/${order.id}`)}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm">{order.id}</span>
                            <Badge variant={statusInfo.variant}>
                              {lang === 'zh' ? statusInfo.label : statusInfo.labelEn}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatDate(order.createdAt)}
                          </p>
                        </div>
                        <ExternalLink className="size-4 text-muted-foreground" />
                      </div>
                      <div className="mt-3 text-sm text-muted-foreground">
                        {order.items.length} {lang === 'zh' ? '个商品' : 'items'}
                      </div>
                      <div className="mt-2 text-lg font-medium text-primary">
                        {money(order.totalAmount)} {lang === 'zh' ? '元' : 'CNY'}
                      </div>
                    </div>
                  );
                })}
                {downloads.length > 0 && (
                  <section className="pt-2">
                    <h3 className="tech-label mb-3 text-xs text-muted-foreground">{lang === 'zh' ? '公开数据下载记录' : 'Public data downloads'}</h3>
                    <div className="space-y-3">
                      {downloads.map((download) => (
                        <div key={download.id} className="rounded-lg border border-border bg-card p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="truncate font-medium">{download.productName}</span>
                                <Badge variant="secondary">{lang === 'zh' ? '公开数据' : 'Open data'}</Badge>
                              </div>
                              <p className="mt-1 font-mono text-xs text-muted-foreground">{download.productCode}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {download.provider || (lang === 'zh' ? '公开数据源' : 'Public source')} · {formatDate(download.requestedAt)}
                              </p>
                              {download.fileFormat && <p className="mt-1 text-xs text-muted-foreground">{download.fileFormat}</p>}
                            </div>
                            <a
                              href={download.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                            >
                              <ExternalLink className="size-3.5" />
                              {lang === 'zh' ? '打开数据源' : 'Open source'}
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </TabsContent>

          {/* Inquiries Tab */}
          <TabsContent value="inquiries" className="mt-6">
            {inquiries.length === 0 ? (
              <div className="flex min-h-[300px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 p-8">
                <FileText className="mb-4 size-12 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">{lang === 'zh' ? '暂无询价记录' : 'No inquiries yet'}</p>
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
                    <div key={inquiry.id} className="rounded-lg border border-border bg-card p-4">
                      <div className="flex items-start justify-between">
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
                      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {inquiry.areaKm2 > 0 && (
                          <div>
                            <div className="text-xs text-muted-foreground">{lang === 'zh' ? '面积' : 'Area'}</div>
                            <div className="mt-1 text-sm font-medium">{inquiry.areaKm2} km²</div>
                          </div>
                        )}
                        {inquiry.expectRes && (
                          <div>
                            <div className="text-xs text-muted-foreground">{lang === 'zh' ? '分辨率' : 'Resolution'}</div>
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
                      {quotes.filter((quote) => quote.inquiryId === inquiry.id).map((quote) => (
                        <div key={quote.id} className="mt-3 flex flex-col gap-3 rounded-md border border-primary/30 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs text-primary">{quote.quoteNo}</span>
                              <Badge variant={quote.status === 'accepted' ? 'outline' : 'default'}>{quote.status === 'accepted' ? (lang === 'zh' ? '已接受' : 'Accepted') : (lang === 'zh' ? '正式报价' : 'Official quote')}</Badge>
                            </div>
                            <div className="mt-1 text-sm font-medium">{quote.total.toLocaleString()} {quote.currency}</div>
                            <div className="mt-1 text-xs text-muted-foreground">{lang === 'zh' ? `${quote.deliveryDays} 天交付 · 有效至 ${quote.validUntil}` : `${quote.deliveryDays} day delivery · valid until ${quote.validUntil}`}</div>
                            {quote.notes && <div className="mt-2 text-xs text-muted-foreground">{quote.notes}</div>}
                          </div>
                          {quote.status === 'sent' && (
                            <Button size="sm" onClick={() => acceptCustomerQuote(quote)} disabled={acceptingQuote === quote.id}>
                              {acceptingQuote === quote.id ? (lang === 'zh' ? '处理中...' : 'Accepting...') : (lang === 'zh' ? '接受报价' : 'Accept quote')}
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
