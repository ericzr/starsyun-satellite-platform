import { useNavigate } from 'react-router';
import { Trash2, ShoppingBag, ArrowRight } from 'lucide-react';
import { useI18n } from '../i18n';
import { useCart } from '../context/CartContext';
import { VALUE_ADDED_SERVICES } from '../data/products';
import { Button } from '../components/ui/button';
import { fmtCny, fmtCnyEn } from '../lib/pricing';

export function Cart() {
  const { lang } = useI18n();
  const navigate = useNavigate();
  const { items, removeFromCart, updateQuantity, cartTotal } = useCart();
  const checkoutEnabled = import.meta.env.DEV
    || import.meta.env.VITE_ENABLE_MOCK_DATA === 'true'
    || import.meta.env.VITE_ENABLE_CHECKOUT === 'true';

  const money = (v: number) => (lang === 'zh' ? fmtCny(v) : fmtCnyEn(v));
  const cny = lang === 'zh' ? '元' : 'CNY';

  const processLevelLabels = {
    raw: lang === 'zh' ? '原始数据' : 'Raw Data',
    standard: lang === 'zh' ? '标准处理' : 'Standard',
    analysis: lang === 'zh' ? '分析就绪' : 'Analysis Ready',
    L1: lang === 'zh' ? 'L1 原始数据' : 'L1 Raw Data',
    L2: lang === 'zh' ? 'L2 标准产品' : 'L2 Standard Product',
    L3: lang === 'zh' ? 'L3 正射影像' : 'L3 Orthorectified',
    L4: lang === 'zh' ? 'L4 增值产品' : 'L4 Value-Added',
  };

  if (items.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
        <ShoppingBag className="size-16 opacity-50" />
        <p>{lang === 'zh' ? '购物车是空的' : 'Your cart is empty'}</p>
        <Button onClick={() => navigate('/explore')}>
          {lang === 'zh' ? '去选购' : 'Browse Products'}
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1200px] px-6 py-8">
        <h1 className="text-2xl">{lang === 'zh' ? '购物车' : 'Shopping Cart'}</h1>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          {/* Cart items */}
          <div className="space-y-4 lg:col-span-2">
            {items.map((item) => (
              <div key={`${item.product.id}-${item.processLevel}-${(item.services ?? []).join('-')}`} className="rounded-lg border border-border bg-card p-4">
                <div className="flex gap-4">
                  <img
                    src={item.product.thumbnail}
                    alt={lang === 'zh' ? item.product.productName : item.product.productNameEn}
                    className="size-24 rounded object-cover"
                  />
                  <div className="flex-1">
                    <h3 className="font-medium">
                      {lang === 'zh' ? item.product.productName : item.product.productNameEn}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.product.productCode} · {processLevelLabels[item.processLevel]}
                    </p>
                    {(item.services ?? []).length > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {lang === 'zh' ? '增值服务' : 'Services'}: {(item.services ?? []).map((id) => VALUE_ADDED_SERVICES.find((service) => service.id === id)?.[lang === 'zh' ? 'name' : 'nameEn'] ?? id).join(', ')}
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateQuantity(item.product.id, item.quantity - 1, item.processLevel, item.services ?? [])}
                        >
                          -
                        </Button>
                        <span className="w-8 text-center">{item.quantity}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateQuantity(item.product.id, item.quantity + 1, item.processLevel, item.services ?? [])}
                        >
                          +
                        </Button>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeFromCart(item.product.id, item.processLevel, item.services ?? [])}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-lg text-primary">
                      {money(item.price)} {cny}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="lg:col-span-1">
            <div className="sticky top-6 rounded-lg border border-border bg-card p-5">
              <h3 className="tech-label mb-4 text-xs text-muted-foreground">
                {lang === 'zh' ? '订单摘要' : 'Order Summary'}
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>{lang === 'zh' ? '商品数量' : 'Items'}</span>
                  <span>{items.reduce((sum, item) => sum + item.quantity, 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>{lang === 'zh' ? '小计' : 'Subtotal'}</span>
                  <span className="font-mono">
                    {money(cartTotal)} {cny}
                  </span>
                </div>
                <div className="border-t border-border pt-2">
                  <div className="flex justify-between text-lg">
                    <span className="font-medium">{lang === 'zh' ? '总计' : 'Total'}</span>
                    <span className="font-mono text-primary">
                      {money(cartTotal)} {cny}
                    </span>
                  </div>
                </div>
              </div>
              <Button size="lg" className="mt-6 w-full" disabled={!checkoutEnabled} onClick={() => navigate('/checkout')}>
                {checkoutEnabled
                  ? (lang === 'zh' ? '去结算' : 'Proceed to Checkout')
                  : (lang === 'zh' ? '在线结算未开放' : 'Checkout unavailable')}
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
