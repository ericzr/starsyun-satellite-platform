import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useI18n } from '../i18n';
import { useUser } from '../context/UserContext';
import { useCart } from '../context/CartContext';
import { loadInquiries, type InquiryStatus } from '../lib/inquiries';
import { fmtCny, fmtCnyEn } from '../lib/pricing';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { User, ShoppingCart, Package, FileText, Settings, LogOut, Trash2, Plus, Minus, Clock, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

type TabValue = 'cart' | 'orders' | 'inquiries';

export function Profile() {
  const { lang } = useI18n();
  const navigate = useNavigate();
  const { user, logout } = useUser();
  const { items, orders, removeFromCart, updateQuantity, getOrder } = useCart();
  const [activeTab, setActiveTab] = useState<TabValue>('cart');

  const inquiries = loadInquiries().filter(inquiry =>
    inquiry.email === user?.email || inquiry.phone === user?.phone
  );

  const cartCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

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
              {orders.length > 0 && <Badge variant="secondary" className="ml-1">{orders.length}</Badge>}
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
                  <div key={item.id} className="rounded-lg border border-border bg-card p-4">
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <h3 className="font-medium">{item.productName}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {lang === 'zh' ? '处理级别' : 'Processing'}: {item.processLevel}
                        </p>
                        <p className="mt-2 text-lg font-medium text-primary">
                          {money(item.price)} {lang === 'zh' ? '元' : 'CNY'}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeFromCart(item.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            className="size-8"
                            onClick={() => updateQuantity(item.id, Math.max(1, item.quantity - 1))}
                          >
                            <Minus className="size-3" />
                          </Button>
                          <span className="w-8 text-center">{item.quantity}</span>
                          <Button
                            variant="outline"
                            size="icon"
                            className="size-8"
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
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
                  <Button className="mt-4 w-full" size="lg" onClick={handleCheckout}>
                    {lang === 'zh' ? '去结算' : 'Checkout'}
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Orders Tab */}
          <TabsContent value="orders" className="mt-6">
            {orders.length === 0 ? (
              <div className="flex min-h-[300px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 p-8">
                <Package className="mb-4 size-12 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">{lang === 'zh' ? '暂无订单' : 'No orders yet'}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {orders.map((order) => {
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
                            <span className="font-mono text-sm">{order.orderNumber}</span>
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
