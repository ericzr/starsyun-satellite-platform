import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, Check, Archive, Satellite, BarChart3, Clock, Package } from 'lucide-react';
import { useI18n } from '../i18n';
import { getProduct, VALUE_ADDED_SERVICES, type ProcessingLevel, type ValueAddedService } from '../data/products';
import { getSatellite } from '../data/satellites';
import { fmtCny, fmtCnyEn } from '../lib/pricing';
import { MapCanvas } from '../components/MapCanvas';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group';
import { Label } from '../components/ui/label';
import { Checkbox } from '../components/ui/checkbox';
import { Card } from '../components/ui/card';
import { DATA_TYPE_LABEL, STATUS_LABEL, pick } from '../lib/labels';
import { useInquiryDraft } from '../context/InquiryContext';
import { useCart } from '../context/CartContext';
import { toast } from 'sonner';

type ViewTab = 'basic' | 'services' | 'packages';

export function ProductDetail() {
  const { id } = useParams();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const { setDraft } = useInquiryDraft();
  const { addToCart } = useCart();
  const product = id ? getProduct(id) : undefined;

  const [viewTab, setViewTab] = useState<ViewTab>('basic');
  const [selectedLevel, setSelectedLevel] = useState<ProcessingLevel>('L2');
  const [selectedServices, setSelectedServices] = useState<ValueAddedService[]>([]);
  const [opacity, setOpacity] = useState(100);

  const sat = product ? getSatellite(product.satelliteId) : undefined;

  // 处理级别定价（基于产品的基础价格）
  const levelPricing = useMemo(() => {
    if (!product) return null;
    const basePrice = product.unitPrice * product.area;
    return {
      L1: Math.round(basePrice * 0.6),
      L2: Math.round(basePrice),
      L3: Math.round(basePrice * 1.3),
      L4: Math.round(basePrice * 1.8),
    };
  }, [product]);

  // 计算总价
  const totalPrice = useMemo(() => {
    if (!levelPricing) return 0;
    const basePrice = levelPricing[selectedLevel];
    const servicesPrice = selectedServices.reduce((sum, serviceId) => {
      const service = VALUE_ADDED_SERVICES.find(s => s.id === serviceId);
      return sum + (service ? service.priceRange[0] : 0);
    }, 0);
    return basePrice + servicesPrice;
  }, [levelPricing, selectedLevel, selectedServices]);

  if (!product || !levelPricing) {
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

  const categoryInfo = {
    archive: { icon: Archive, label: lang === 'zh' ? '历史存档' : 'Archive' },
    tasking: { icon: Satellite, label: lang === 'zh' ? '任务拍摄' : 'Tasking' },
    analysis: { icon: BarChart3, label: lang === 'zh' ? '分析服务' : 'Analysis' },
  };

  const CategoryIcon = categoryInfo[product.category].icon;

  // 处理级别信息
  const levelInfo = {
    L1: {
      name: lang === 'zh' ? 'L1 原始数据' : 'L1 Raw Data',
      desc: lang === 'zh' ? '传感器原始数据，适合研究机构' : 'Sensor raw data for research',
      features: lang === 'zh' ? ['原始DN值', '无几何校正', '需专业处理'] : ['Raw DN', 'No correction', 'Expert processing'],
    },
    L2: {
      name: lang === 'zh' ? 'L2 标准产品' : 'L2 Standard Product',
      desc: lang === 'zh' ? '几何校正 + 辐射定标，适合GIS专业人员' : 'Corrected for GIS professionals',
      features: lang === 'zh' ? ['几何校正', '辐射定标', 'WGS84坐标'] : ['Geometric', 'Radiometric', 'WGS84'],
    },
    L3: {
      name: lang === 'zh' ? 'L3 正射影像' : 'L3 Orthorectified',
      desc: lang === 'zh' ? '地理配准，可直接使用' : 'Geo-registered, ready to use',
      features: lang === 'zh' ? ['正射校正', '地理配准', '投影坐标系'] : ['Ortho', 'Geo-registered', 'Projected'],
    },
    L4: {
      name: lang === 'zh' ? 'L4 增值产品' : 'L4 Value-Added',
      desc: lang === 'zh' ? '专业分析结果，适合决策者' : 'Analysis results for decision makers',
      features: lang === 'zh' ? ['专业分析', '可视化报告', '决策支持'] : ['Analysis', 'Report', 'Decision support'],
    },
  };

  const specs: { label: string; value: React.ReactNode }[] = [
    { label: t.common.satellite, value: product.satelliteName },
    { label: t.common.provider, value: product.provider },
    { label: t.detail.captureTime, value: <span className="font-mono">{product.captureTime}</span> },
    { label: t.common.dataType, value: pick(DATA_TYPE_LABEL[product.dataType], lang) },
    { label: t.common.resolution, value: <span className="font-mono">{product.resolution}m</span> },
    { label: t.detail.band, value: <span className="font-mono">{product.bands}</span> },
    { label: t.common.cloud, value: <span className="font-mono">{product.cloudCover}%</span> },
    { label: t.common.area, value: <span className="font-mono">{product.area} km²</span> },
    { label: lang === 'zh' ? '交付时间' : 'Delivery', value: `${product.deliveryDays} ${lang === 'zh' ? '天' : 'days'}` },
  ];

  const toggleService = (serviceId: ValueAddedService) => {
    setSelectedServices(prev =>
      prev.includes(serviceId)
        ? prev.filter(s => s !== serviceId)
        : [...prev, serviceId]
    );
  };

  const handleAddToCart = () => {
    addToCart(product, 'raw', totalPrice);
    toast.success(lang === 'zh' ? '已加入购物车' : 'Added to cart');
  };

  const handleBuyNow = () => {
    addToCart(product, 'raw', totalPrice);
    toast.success(lang === 'zh' ? '已加入购物车' : 'Added to cart');
    navigate('/cart');
  };

  const handleInquire = () => {
    setDraft({
      type: 'history',
      productId: product.id,
      productName: lang === 'zh' ? product.productName : product.productNameEn,
      areaKm2: product.area,
      refPrice: totalPrice,
      expectRes: `≤ ${product.resolution}m`,
    });
    navigate('/inquiry/new');
  };

  const availableServices = VALUE_ADDED_SERVICES.filter(s =>
    product.availableServices?.includes(s.id)
  );

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
            <Tabs value={viewTab} onValueChange={(v) => setViewTab(v as ViewTab)}>
              <TabsList className="w-full">
                <TabsTrigger value="basic" className="flex-1">
                  {lang === 'zh' ? '基础影像' : 'Basic Image'}
                </TabsTrigger>
                <TabsTrigger value="services" className="flex-1" disabled={!availableServices.length}>
                  {lang === 'zh' ? '增值服务' : 'Services'}
                </TabsTrigger>
                <TabsTrigger value="packages" className="flex-1" disabled>
                  {lang === 'zh' ? '套餐' : 'Packages'}
                </TabsTrigger>
              </TabsList>

              {/* 基础影像 */}
              <TabsContent value="basic" className="mt-4 space-y-4">
                <Card className="p-4">
                  <h3 className="mb-3 text-sm font-medium">{lang === 'zh' ? '选择处理级别' : 'Processing Level'}</h3>
                  <RadioGroup value={selectedLevel} onValueChange={(v) => setSelectedLevel(v as ProcessingLevel)}>
                    {(['L1', 'L2', 'L3', 'L4'] as ProcessingLevel[]).map((level) => (
                      <Label
                        key={level}
                        htmlFor={level}
                        className="flex cursor-pointer items-start space-x-3 rounded-lg border-2 border-border p-4 transition-all hover:border-primary/50 hover:bg-accent has-[:checked]:border-primary has-[:checked]:bg-accent/50"
                      >
                        <RadioGroupItem value={level} id={level} className="mt-0.5" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{levelInfo[level].name}</span>
                            {level === 'L2' && (
                              <Badge variant="secondary" className="text-[9px]">
                                {lang === 'zh' ? '推荐' : 'Recommended'}
                              </Badge>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{levelInfo[level].desc}</p>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {levelInfo[level].features.map((f, i) => (
                              <Badge key={i} variant="outline" className="text-[9px]">
                                {f}
                              </Badge>
                            ))}
                          </div>
                          <p className="mt-3 font-mono text-sm font-medium text-primary">
                            {money(levelPricing[level])} {cny}
                          </p>
                        </div>
                      </Label>
                    ))}
                  </RadioGroup>
                </Card>
              </TabsContent>

              {/* 增值服务 */}
              <TabsContent value="services" className="mt-4 space-y-4">
                <Card className="p-4">
                  <h3 className="mb-3 text-sm font-medium">{lang === 'zh' ? '可选增值服务' : 'Optional Services'}</h3>
                  <div className="space-y-3">
                    {availableServices.map((service) => (
                      <Label
                        key={service.id}
                        htmlFor={service.id}
                        className="flex cursor-pointer items-start space-x-3 rounded-lg border-2 border-border p-4 transition-all hover:border-primary/50 hover:bg-accent has-[:checked]:border-primary has-[:checked]:bg-accent/50"
                      >
                        <Checkbox
                          id={service.id}
                          checked={selectedServices.includes(service.id)}
                          onCheckedChange={() => toggleService(service.id)}
                          className="mt-0.5"
                        />
                        <div className="flex-1">
                          <div className="font-medium">
                            {lang === 'zh' ? service.name : service.nameEn}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {lang === 'zh' ? service.description : service.descriptionEn}
                          </p>
                          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                            <Clock className="size-3" />
                            <span>{service.deliveryDays} {lang === 'zh' ? '天交付' : 'days'}</span>
                            <span>•</span>
                            <span className="font-mono text-primary">
                              {money(service.priceRange[0])} - {money(service.priceRange[1])} {cny}
                            </span>
                          </div>
                        </div>
                      </Label>
                    ))}
                  </div>
                </Card>
              </TabsContent>

              {/* 套餐（暂未实现） */}
              <TabsContent value="packages" className="mt-4">
                <Card className="p-8 text-center text-muted-foreground">
                  <Package className="mx-auto mb-2 size-12 opacity-50" />
                  <p>{lang === 'zh' ? '套餐功能即将推出' : 'Packages coming soon'}</p>
                </Card>
              </TabsContent>
            </Tabs>

            {/* 价格汇总 */}
            <Card className="p-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {levelInfo[selectedLevel].name}
                  </span>
                  <span className="font-mono">{money(levelPricing[selectedLevel])} {cny}</span>
                </div>
                {selectedServices.map((serviceId) => {
                  const service = VALUE_ADDED_SERVICES.find(s => s.id === serviceId);
                  if (!service) return null;
                  return (
                    <div key={serviceId} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        + {lang === 'zh' ? service.name : service.nameEn}
                      </span>
                      <span className="font-mono">{money(service.priceRange[0])} {cny}</span>
                    </div>
                  );
                })}
                <div className="border-t border-border pt-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{lang === 'zh' ? '总计' : 'Total'}</span>
                    <span className="text-xl font-medium text-primary">
                      {money(totalPrice)} {cny}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <Clock className="mr-1 inline size-3" />
                    {lang === 'zh' ? '预计' : 'Est.'} {product.deliveryDays} {lang === 'zh' ? '天交付' : 'days delivery'}
                  </p>
                </div>
              </div>
            </Card>

            {/* 操作按钮 */}
            <div className="flex gap-2">
              {product.purchaseType === 'instant' ? (
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
