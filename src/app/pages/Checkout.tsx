import { useState } from 'react';
import { useNavigate } from 'react-router';
import { CreditCard, ArrowLeft } from 'lucide-react';
import { useI18n } from '../i18n';
import { useCart } from '../context/CartContext';
import { Button } from '../components/ui/button';
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group';
import { Label } from '../components/ui/label';
import { fmtCny, fmtCnyEn } from '../lib/pricing';

export function Checkout() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const { items, cartTotal, createOrder } = useCart();
  const [paymentMethod, setPaymentMethod] = useState<'alipay' | 'wechat' | 'bank'>('alipay');

  const money = (v: number) => (lang === 'zh' ? fmtCny(v) : fmtCnyEn(v));
  const cny = lang === 'zh' ? '元' : 'CNY';

  const handleCheckout = () => {
    const order = createOrder(paymentMethod);
    // 模拟支付成功
    navigate(`/orders/${order.id}`);
  };

  if (items.length === 0) {
    navigate('/cart');
    return null;
  }

  const processLevelLabels = {
    raw: lang === 'zh' ? '原始数据' : 'Raw Data',
    standard: lang === 'zh' ? '标准处理' : 'Standard',
    analysis: lang === 'zh' ? '分析就绪' : 'Analysis Ready',
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1200px] px-6 py-8">
        <Button variant="ghost" size="sm" className="mb-4 gap-1" onClick={() => navigate('/cart')}>
          <ArrowLeft className="size-4" />
          {lang === 'zh' ? '返回购物车' : 'Back to Cart'}
        </Button>

        <h1 className="text-2xl">{lang === 'zh' ? '确认订单' : 'Checkout'}</h1>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          {/* Order details */}
          <div className="space-y-6 lg:col-span-2">
            {/* Items */}
            <section className="rounded-lg border border-border bg-card p-5">
              <h3 className="tech-label mb-4 text-xs text-muted-foreground">
                {lang === 'zh' ? '订单明细' : 'Order Items'}
              </h3>
              <div className="space-y-3">
                {items.map((item) => (
                  <div
                    key={`${item.product.id}-${item.processLevel}`}
                    className="flex items-center justify-between border-b border-border pb-3 last:border-0"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        {lang === 'zh' ? item.product.productName : item.product.productNameEn}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {processLevelLabels[item.processLevel]} × {item.quantity}
                      </p>
                    </div>
                    <p className="font-mono text-sm">
                      {money(item.price)} {cny}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* Payment method */}
            <section className="rounded-lg border border-border bg-card p-5">
              <h3 className="tech-label mb-4 text-xs text-muted-foreground">
                {lang === 'zh' ? '支付方式' : 'Payment Method'}
              </h3>
              <RadioGroup value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as any)}>
                <div className="flex items-center space-x-2 rounded border border-border p-3">
                  <RadioGroupItem value="alipay" id="alipay" />
                  <Label htmlFor="alipay" className="flex-1 cursor-pointer">
                    {lang === 'zh' ? '支付宝' : 'Alipay'}
                  </Label>
                </div>
                <div className="flex items-center space-x-2 rounded border border-border p-3">
                  <RadioGroupItem value="wechat" id="wechat" />
                  <Label htmlFor="wechat" className="flex-1 cursor-pointer">
                    {lang === 'zh' ? '微信支付' : 'WeChat Pay'}
                  </Label>
                </div>
                <div className="flex items-center space-x-2 rounded border border-border p-3">
                  <RadioGroupItem value="bank" id="bank" />
                  <Label htmlFor="bank" className="flex-1 cursor-pointer">
                    {lang === 'zh' ? '银行转账' : 'Bank Transfer'}
                  </Label>
                </div>
              </RadioGroup>
            </section>
          </div>

          {/* Summary and checkout */}
          <div className="lg:col-span-1">
            <div className="sticky top-6 rounded-lg border border-border bg-card p-5">
              <h3 className="tech-label mb-4 text-xs text-muted-foreground">
                {lang === 'zh' ? '订单摘要' : 'Order Summary'}
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>{lang === 'zh' ? '商品总额' : 'Subtotal'}</span>
                  <span className="font-mono">
                    {money(cartTotal)} {cny}
                  </span>
                </div>
                <div className="border-t border-border pt-2">
                  <div className="flex justify-between text-lg">
                    <span className="font-medium">{lang === 'zh' ? '应付金额' : 'Total'}</span>
                    <span className="font-mono text-primary">
                      {money(cartTotal)} {cny}
                    </span>
                  </div>
                </div>
              </div>
              <Button size="lg" className="mt-6 w-full" onClick={handleCheckout}>
                <CreditCard className="size-4" />
                {lang === 'zh' ? '确认支付' : 'Confirm Payment'}
              </Button>
              <p className="mt-4 text-center text-xs text-muted-foreground">
                {lang === 'zh' ? '点击后将跳转到支付页面' : 'You will be redirected to payment'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
