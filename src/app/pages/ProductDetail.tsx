import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, Archive, Satellite, BarChart3 } from 'lucide-react';
import { useI18n } from '../i18n';
import { getProduct, type Product, type ProcessingLevel } from '../data/products';
import { fetchRemoteProduct, getRemoteProduct } from '../services/stac';
import { fetchCatalogProduct } from '../services/catalog';
import { fmtCny, fmtCnyEn } from '../lib/pricing';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card } from '../components/ui/card';
import { DATA_TYPE_LABEL, pick } from '../lib/labels';
import { useInquiryDraft } from '../context/InquiryContext';
import { useCart } from '../context/CartContext';
import { toast } from 'sonner';
import { PublicDownloadDialog } from '../components/PublicDownloadDialog';

export function ProductDetail() {
  const { id } = useParams();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const { setDraft } = useInquiryDraft();
  const { addToCart } = useCart();
  const demoDataEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_MOCK_DATA === 'true';
  // Demo inventory must never be reachable through a guessed product URL in
  // production. Public STAC records and verified catalog records are loaded
  // separately so both survive a direct detail-page refresh.
  const localProduct = id
    ? (demoDataEnabled ? getProduct(id) : undefined) ?? getRemoteProduct(id)
    : undefined;
  const [remoteProduct, setRemoteProduct] = useState<Product | undefined>(localProduct);
  const [remoteLoading, setRemoteLoading] = useState(Boolean(id && (id.startsWith('earth-search-') || id.startsWith('catalog-')) && !localProduct));
  const product = localProduct ?? remoteProduct;

  useEffect(() => {
    let cancelled = false;
    const cached = id
      ? (demoDataEnabled ? getProduct(id) : undefined) ?? getRemoteProduct(id)
      : undefined;
    setRemoteProduct(cached);

    if ((!id?.startsWith('earth-search-') && !id?.startsWith('catalog-')) || cached) {
      setRemoteLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setRemoteLoading(true);
    // Clear a previous route's record immediately. Without this, navigating
    // between direct product URLs can briefly render stale pricing/options.
    const resolver = id.startsWith('earth-search-') ? fetchRemoteProduct(id) : fetchCatalogProduct(id);
    resolver
      .then((resolved) => {
        if (!cancelled) setRemoteProduct(resolved);
      })
      .catch(() => {
        if (!cancelled) setRemoteProduct(undefined);
      })
      .finally(() => {
        if (!cancelled) setRemoteLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [demoDataEnabled, id]);

  // The catalog price already belongs to the supplier's published product
  // level. The storefront must not invent L1-L4 variants or derive prices by
  // multiplying a different level's price.
  const offeredPrice = useMemo(() => {
    if (!product || (product.priceType !== 'fixed' && product.priceType !== 'estimated')) return 0;
    return Math.round(product.unitPrice * Math.max(product.area, product.minArea));
  }, [product]);

  if (remoteLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        {lang === 'zh' ? '正在加载公开卫星数据…' : 'Loading open satellite data…'}
      </div>
    );
  }

  if (!product) {
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
  // A source URL is also retained for some licensed products as provenance.
  // Only free records with a public URL are eligible for the upstream
  // download flow; paid products must remain in the inquiry/checkout flow.
  const isOpenData = product.priceType === 'free' && Boolean(product.sourceUrl);
  const hasFixedPrice = product.priceType === 'fixed' && product.unitPrice > 0;
  // Product detail uses the local cart only for development/mock inventory.
  // Production paid orders are created from accepted server quotes, so an
  // environment flag must not make this page advertise a fake checkout.
  const checkoutEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_MOCK_DATA === 'true';

  const categoryInfo = {
    archive: { icon: Archive, label: lang === 'zh' ? '历史存档' : 'Archive' },
    tasking: { icon: Satellite, label: lang === 'zh' ? '任务拍摄' : 'Tasking' },
    analysis: { icon: BarChart3, label: lang === 'zh' ? '分析服务' : 'Analysis' },
  };

  const CategoryIcon = categoryInfo[product.category].icon;

  const levelInfo: Record<ProcessingLevel, { name: string }> = {
    L1: {
      name: lang === 'zh' ? 'L1 原始数据' : 'L1 Raw Data',
    },
    L2: {
      name: lang === 'zh' ? 'L2 标准产品' : 'L2 Standard Product',
    },
    L3: {
      name: lang === 'zh' ? 'L3 正射影像' : 'L3 Orthorectified',
    },
    L4: {
      name: lang === 'zh' ? 'L4 增值产品' : 'L4 Value-Added',
    },
  };

  const specs: { label: string; value: React.ReactNode }[] = [
    { label: t.common.satellite, value: product.satelliteName },
    { label: t.common.provider, value: product.provider },
    { label: t.detail.captureTime, value: <span className="font-mono">{product.captureTime}</span> },
    { label: t.common.dataType, value: pick(DATA_TYPE_LABEL[product.dataType], lang) },
    { label: t.common.resolution, value: <span className="font-mono">{product.resolution}m</span> },
    { label: t.detail.band, value: <span className="font-mono">{product.bands}</span> },
    { label: t.detail.level, value: <span className="font-mono">{product.productLevel || product.processingLevel}</span> },
    { label: t.common.cloud, value: <span className="font-mono">{product.cloudCover}%</span> },
    { label: t.common.area, value: <span className="font-mono">{product.area} km²</span> },
    { label: lang === 'zh' ? '交付时间' : 'Delivery', value: `${product.deliveryDays} ${lang === 'zh' ? '天' : 'days'}` },
  ];

  const handleAddToCart = () => {
    addToCart(product, product.processingLevel, offeredPrice);
    toast.success(lang === 'zh' ? '已加入购物车' : 'Added to cart');
  };

  const handleBuyNow = () => {
    addToCart(product, product.processingLevel, offeredPrice);
    toast.success(lang === 'zh' ? '已加入购物车' : 'Added to cart');
    navigate('/cart');
  };

  const handleInquire = () => {
    if (product.category === 'analysis') {
      navigate('/analysis');
      return;
    }
    setDraft({
      type: product.category === 'tasking' ? 'tasking' : 'history',
      productId: product.id,
      productName: lang === 'zh' ? product.productName : product.productNameEn,
      areaKm2: product.area,
      refPrice: hasFixedPrice || product.priceType === 'estimated' ? offeredPrice : 0,
      expectRes: `≤ ${product.resolution}m`,
    });
    navigate('/inquiry/new');
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6">
        <Button variant="ghost" size="sm" className="mb-4 gap-1 text-muted-foreground" onClick={() => navigate(-1)}>
          <ArrowLeft className="size-4" />
          {t.common.back}
        </Button>

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="font-mono text-xs text-muted-foreground">{product.productCode}</div>
            <h1 className="mt-1 text-xl sm:text-2xl">{lang === 'zh' ? product.productName : product.productNameEn}</h1>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="secondary" className="gap-1 text-[10px]">
                <CategoryIcon className="size-3" />
                {categoryInfo[product.category].label}
              </Badge>
              <Badge variant="outline" className="tech-label text-[10px]">
                {pick(DATA_TYPE_LABEL[product.dataType], lang)}
              </Badge>
              <Badge variant="outline" className="tech-label text-[10px]">
                {levelInfo[product.processingLevel].name}
              </Badge>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Left: Image + Specs */}
          <div className="space-y-4">
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="aspect-video bg-secondary">
                <ImageWithFallback
                  src={product.thumbnail}
                  alt={product.satelliteName}
                  className="size-full object-cover"
                />
              </div>
            </div>

            <Card className="p-4">
              <h3 className="tech-label mb-3 text-xs text-muted-foreground">{t.detail.basicInfo}</h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {specs.map((s) => (
                  <div key={s.label} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">{s.label}</span>
                    <span className="font-medium">{s.value}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Right: Options */}
          <div className="space-y-4">
            {isOpenData ? (
              <Card className="p-4">
                <h3 className="text-sm font-medium">{lang === 'zh' ? '公开数据' : 'Open data'}</h3>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {lang === 'zh'
                    ? '该记录由公开数据源提供，平台不收取费用，也不提供额外处理套餐。点击下方按钮即可前往数据源下载。'
                    : 'This record is provided by a public source. There is no platform fee or paid processing package. Use the button below to download from the source.'}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge variant="secondary">{lang === 'zh' ? '免费' : 'Free'}</Badge>
                  <Badge variant="outline">{product.fileFormat}</Badge>
                  <Badge variant="outline">{product.processingLevel}</Badge>
                </div>
              </Card>
            ) : (
              <Card className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-medium">
                    {hasFixedPrice
                      ? (lang === 'zh' ? '供应商标准产品' : 'Supplier standard product')
                      : product.priceType === 'estimated'
                        ? (lang === 'zh' ? '参考估价' : 'Estimated pricing')
                        : (lang === 'zh' ? '按需询价' : 'Quote required')}
                  </h3>
                  <Badge variant="outline">{product.processingLevel}</Badge>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {hasFixedPrice
                    ? (lang === 'zh'
                      ? '处理级别和价格按供应商发布的实际产品记录展示，平台不会为同一影像虚构 L1—L4 变体。'
                      : 'The processing level and price come from the supplier record. StarSyun does not invent L1–L4 variants for the same scene.')
                    : product.priceType === 'estimated'
                      ? (lang === 'zh'
                        ? '该金额仅用于预算参考，正式价格以授权范围、处理要求和交付条件确认为准。'
                        : 'This amount is for budget planning only. Final pricing follows confirmation of licensing, processing, and delivery terms.')
                      : (lang === 'zh'
                        ? '该产品需确认授权范围、处理要求和交付条件后生成正式报价。'
                        : 'Licensing, processing, and delivery terms must be confirmed before a formal quote is issued.')}
                </p>
                {(hasFixedPrice || product.priceType === 'estimated') && offeredPrice > 0 && (
                  <div className="mt-3 flex items-baseline justify-between gap-3">
                    <span className="text-xs text-muted-foreground">
                      {lang === 'zh' ? '供应商产品价' : 'Supplier product price'}
                    </span>
                    <span className="font-mono text-lg text-primary">{money(offeredPrice)} {cny}</span>
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge variant="secondary">{levelInfo[product.processingLevel].name}</Badge>
                  <Badge variant="outline">{product.fileFormat}</Badge>
                </div>
              </Card>
            )}

            {/* 操作按钮 */}
            <div className="flex gap-2">
              {isOpenData ? (
                <PublicDownloadDialog
                  productId={product.id}
                  sourceUrl={product.sourceUrl!}
                  productCode={product.productCode}
                  productName={lang === 'zh' ? product.productName : product.productNameEn}
                  provider={product.provider}
                  fileFormat={product.fileFormat}
                  className="w-full"
                />
              ) : product.priceType === 'free' ? (
                <Button type="button" variant="outline" className="w-full" disabled>
                  {lang === 'zh' ? '暂无公开下载源' : 'No public download source'}
                </Button>
              ) : product.purchaseType === 'instant' && checkoutEnabled ? (
                <>
                  <Button variant="outline" className="flex-1" onClick={handleAddToCart}>
                    {lang === 'zh' ? '加入购物车' : 'Add to Cart'}
                  </Button>
                  <Button className="flex-1" onClick={handleBuyNow}>
                    {lang === 'zh' ? '立即购买' : 'Buy Now'}
                  </Button>
                </>
              ) : (
                <Button className="w-full" onClick={handleInquire}>
                  {lang === 'zh' ? '立即询价' : 'Inquire Now'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
