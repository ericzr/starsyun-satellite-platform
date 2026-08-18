import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, GitCompare, Headset, MessageSquareQuote, ShoppingCart } from 'lucide-react';
import { useI18n } from '../i18n';
import { getProduct } from '../data/products';
import { getSatellite } from '../data/satellites';
import { estimatePrice, fmtCny, fmtCnyEn, type ProcessLevel } from '../lib/pricing';
import { MapCanvas } from '../components/MapCanvas';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Slider } from '../components/ui/slider';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { DATA_TYPE_LABEL, STATUS_LABEL, pick } from '../lib/labels';
import { useInquiryDraft } from '../context/InquiryContext';
import { useCart } from '../context/CartContext';
import { toast } from 'sonner';

export function ProductDetail() {
  const { id } = useParams();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const { setDraft } = useInquiryDraft();
  const { addToCart } = useCart();
  const product = id ? getProduct(id) : undefined;
  const [level, setLevel] = useState<ProcessLevel>('raw');
  const [opacity, setOpacity] = useState(100);

  const sat = product ? getSatellite(product.satelliteId) : undefined;

  const price = useMemo(
    () => (product ? estimatePrice(product, product.area, level) : null),
    [product, level],
  );

  if (!product || !price) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="text-center">
          <p>404</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate('/explore')}>
            {t.common.back}
          </Button>
        </div>
      </div>
    );
  }

  const money = (v: number) => (lang === 'zh' ? fmtCny(v) : fmtCnyEn(v));
  const cny = lang === 'zh' ? '元' : 'CNY';

  const specs: { label: string; value: React.ReactNode }[] = [
    { label: t.common.satellite, value: product.satelliteName },
    { label: t.common.provider, value: product.provider },
    { label: t.detail.captureTime, value: <span className="font-mono">{product.captureTime}</span> },
    { label: t.common.dataType, value: pick(DATA_TYPE_LABEL[product.dataType], lang) },
    { label: t.common.resolution, value: <span className="font-mono">{product.resolution}m</span> },
    { label: t.detail.timeRes, value: sat?.revisit ?? '-' },
    { label: t.detail.band, value: <span className="font-mono">{product.bands}</span> },
    { label: t.common.cloud, value: <span className="font-mono">{product.cloudCover}%</span> },
    { label: t.detail.incidence, value: <span className="font-mono">{product.incidence}°</span> },
    { label: t.detail.sunElev, value: <span className="font-mono">{product.sunElevation}°</span> },
    { label: t.detail.level, value: <span className="font-mono">{product.productLevel}</span> },
    { label: t.detail.crs, value: <span className="font-mono">{product.crs}</span> },
    { label: t.detail.format, value: <span className="font-mono">{product.fileFormat}</span> },
    { label: t.detail.size, value: <span className="font-mono">{product.size}</span> },
    { label: t.common.area, value: <span className="font-mono">{product.area} km²</span> },
    { label: t.detail.license, value: product.license },
    { label: t.detail.deliveryTime, value: product.deliveryTime },
  ];

  const buyOpts = [
    { key: 'raw' as const, title: t.detail.buyRaw, desc: t.detail.buyRawDesc },
    { key: 'standard' as const, title: t.detail.buyStandard, desc: t.detail.buyStandardDesc },
    { key: 'analysis' as const, title: t.detail.buyAnalysis, desc: t.detail.buyAnalysisDesc },
  ];

  const inquire = () => {
    setDraft({
      type: level === 'analysis' ? 'analysis' : 'history',
      productId: product.id,
      productName: lang === 'zh' ? product.productName : product.productNameEn,
      areaKm2: product.area,
      refPrice: product.priceType === 'inquiry' ? 0 : Math.round(price.total),
      expectRes: `≤ ${product.resolution}m`,
    });
    navigate('/inquiry/new');
  };

  const buyNow = () => {
    if (!price) return;
    addToCart(product, level, price.total);
    toast.success(lang === 'zh' ? '已加入购物车' : 'Added to cart');
    navigate('/cart');
  };

  const addCart = () => {
    if (!price) return;
    addToCart(product, level, price.total);
    toast.success(lang === 'zh' ? '已加入购物车' : 'Added to cart');
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1200px] px-6 py-6">
        <Button variant="ghost" size="sm" className="mb-4 gap-1 text-muted-foreground" onClick={() => navigate(-1)}>
          <ArrowLeft className="size-4" />
          {t.common.back}
        </Button>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="font-mono text-xs text-muted-foreground">{product.productCode}</div>
            <h1 className="mt-1 text-2xl">{lang === 'zh' ? product.productName : product.productNameEn}</h1>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="outline" className="tech-label text-[10px]">
                {pick(DATA_TYPE_LABEL[product.dataType], lang)}
              </Badge>
              <Badge variant="secondary" className="tech-label text-[10px]">
                {pick(STATUS_LABEL[product.status], lang)}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {product.origin === 'cn' ? (lang === 'zh' ? '中国卫星' : 'China') : (lang === 'zh' ? '国际卫星' : 'International')}
              </Badge>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Left: specs + price */}
          <div className="space-y-6">
            <section className="rounded-lg border border-border bg-card p-5">
              <h3 className="tech-label mb-4 text-xs text-muted-foreground">{t.detail.basicInfo}</h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                {specs.map((s) => (
                  <div key={s.label} className="flex items-center justify-between gap-2 border-b border-border/60 pb-2">
                    <span className="text-xs text-muted-foreground">{s.label}</span>
                    <span className="text-right text-sm">{s.value}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-border bg-card p-5">
              <h3 className="tech-label mb-4 text-xs text-muted-foreground">{t.detail.priceModule}</h3>
              {product.priceType === 'inquiry' ? (
                <div className="rounded-md border border-warning/40 bg-warning/10 p-4 text-sm text-warning">
                  {t.common.needInquiry}
                </div>
              ) : (
                <div className="space-y-2 font-mono text-sm">
                  <Row label={t.detail.unitPrice} value={`${product.unitPrice} ${cny}/km²`} />
                  <Row label={t.detail.minArea} value={`${product.minArea} km²`} />
                  <Row label={t.detail.selectedArea} value={`${price.billableArea.toFixed(0)} km²`} />
                  <Row label={t.detail.processFee} value={`${money(price.processFee)} ${cny}`} />
                  <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                    <span className="text-muted-foreground">{t.detail.total}</span>
                    <span className="text-xl text-primary">{money(price.total)} {cny}</span>
                  </div>
                </div>
              )}
              <p className="mt-4 text-xs text-muted-foreground">{t.detail.priceNote}</p>
            </section>
          </div>

          {/* Right: preview + buy + CTA */}
          <div className="space-y-6">
            <section className="rounded-lg border border-border bg-card p-5">
              <h3 className="tech-label mb-4 text-xs text-muted-foreground">{t.detail.mapPreview}</h3>
              <div className="relative h-64 overflow-hidden rounded-md border border-border">
                <MapCanvas
                  className="absolute inset-0 size-full"
                  interactive={false}
                  footprints={[{ id: product.id, bbox: product.bbox }]}
                  highlightId={product.id}
                  fitBBox={product.bbox}
                />
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{ opacity: opacity / 100 }}
                >
                  <ImageWithFallback src={product.thumbnail} alt="preview" className="size-full object-cover mix-blend-luminosity" />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <span className="tech-label shrink-0 text-[10px] text-muted-foreground">{t.detail.opacity}</span>
                <Slider value={[opacity]} min={0} max={100} step={1} onValueChange={(v) => setOpacity(v[0])} />
                <span className="w-10 shrink-0 text-right font-mono text-xs">{opacity}%</span>
              </div>
            </section>

            <section className="rounded-lg border border-border bg-card p-5">
              <h3 className="tech-label mb-4 text-xs text-muted-foreground">{t.detail.buyOptions}</h3>
              <Tabs value={level} onValueChange={(v) => setLevel(v as ProcessLevel)}>
                <TabsList className="w-full">
                  {buyOpts.map((o) => (
                    <TabsTrigger key={o.key} value={o.key} className="flex-1 text-xs">
                      {o.title}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {buyOpts.map((o) => (
                  <TabsContent key={o.key} value={o.key} className="mt-3 text-sm text-muted-foreground">
                    {o.desc}
                  </TabsContent>
                ))}
              </Tabs>
            </section>

            <div className="flex flex-wrap gap-3">
              {product.purchaseType === 'instant' ? (
                <>
                  <Button size="lg" className="flex-1" onClick={buyNow}>
                    <ShoppingCart className="size-4" />
                    {lang === 'zh' ? '立即购买' : 'Buy Now'}
                  </Button>
                  <Button size="lg" variant="outline" onClick={addCart}>
                    {lang === 'zh' ? '加入购物车' : 'Add to Cart'}
                  </Button>
                  <Button size="lg" variant="ghost" onClick={inquire}>
                    <MessageSquareQuote className="size-4" />
                    {t.common.getQuote}
                  </Button>
                </>
              ) : (
                <Button size="lg" className="flex-1" onClick={inquire}>
                  <MessageSquareQuote className="size-4" />
                  {t.common.getQuote}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
