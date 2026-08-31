import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Search, Square, Trash2, GitCompare, Crosshair, SlidersHorizontal, List, Upload, MapPinned, LocateFixed, PencilLine } from 'lucide-react';
import { motion } from 'motion/react';
import { useI18n } from '../i18n';
import { PRODUCTS, REGIONS, type Product } from '../data/products';
import { coverageRatio, intersects, bboxAreaKm2, fmtArea, parseCoords, parseVectorFile, type BBox } from '../lib/geo';
import { MapCanvas, type Footprint } from '../components/MapCanvas';
import { FilterPanel, DEFAULT_FILTERS, type Filters } from '../components/FilterPanel';
import { ResultCard } from '../components/ResultCard';
import { CompareDrawer } from '../components/CompareDrawer';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '../components/ui/sheet';
import { useInquiryDraft } from '../context/InquiryContext';
import { useCart } from '../context/CartContext';
import { searchEarthSearch } from '../services/stac';
import { toast } from 'sonner';

function matchRegion(q: string) {
  const s = q.trim().toLowerCase();
  if (!s) return null;
  return (
    REGIONS.find((r) => r.aliases.some((a) => a.toLowerCase().includes(s) || s.includes(a.toLowerCase()))) ??
    null
  );
}

const TIME_DAYS: Record<string, number> = { '1': 1, '7': 7, '30': 30, '90': 90, '365': 365, all: Infinity };

function regionSearchBbox(region: (typeof REGIONS)[number]): BBox {
  const [lng, lat] = region.center;
  return [lng - 0.35, lat - 0.25, lng + 0.35, lat + 0.25];
}

function pointSearchBbox([lng, lat]: [number, number]): BBox {
  return [lng - 0.25, lat - 0.2, lng + 0.25, lat + 0.2];
}

function datetimeForFilters(filters: Filters): string | undefined {
  if (filters.timeMode === 'single' && filters.dateStart) {
    return `${filters.dateStart}T00:00:00Z/${filters.dateStart}T23:59:59Z`;
  }
  if (filters.timeMode === 'range' && filters.dateStart && filters.dateEnd) {
    return `${filters.dateStart}T00:00:00Z/${filters.dateEnd}T23:59:59Z`;
  }
  if (filters.timeMode === 'preset' && filters.timePreset !== 'all') {
    const start = new Date(Date.now() - TIME_DAYS[filters.timePreset] * 86400000).toISOString();
    return `${start}/${new Date().toISOString()}`;
  }
  return undefined;
}

export function Explore() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const { setDraft } = useInquiryDraft();
  const { addToCart } = useCart();
  const [params] = useSearchParams();

  const [search, setSearch] = useState('');
  const [selectionMode, setSelectionMode] = useState<'coordinate' | 'admin' | 'vector' | 'draw'>('coordinate');
  const [coordinateInput, setCoordinateInput] = useState('');
  const [adminSelection, setAdminSelection] = useState('');
  const [vectorName, setVectorName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [regionId, setRegionId] = useState<string | null>(null);
  const [aoi, setAoi] = useState<BBox | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [focus, setFocus] = useState<{ center: [number, number]; zoom: number; key: number } | null>(null);
  const focusKey = useRef(0);
  const [filterOpen, setFilterOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [remoteBbox, setRemoteBbox] = useState<BBox | null>(null);
  const [remoteProducts, setRemoteProducts] = useState<Product[] | null>(null);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState(false);

  // Handle ?q= from home
  useEffect(() => {
    const q = params.get('q');
    if (q) {
      setSearch(q);
      runSearch(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function runSearch(q: string) {
    setAoi(null);
    setVectorName('');
    const coords = parseCoords(q);
    if (coords) {
      focusKey.current += 1;
      setFocus({ center: coords, zoom: 12, key: focusKey.current });
      setRegionId(null);
      setRemoteBbox(pointSearchBbox(coords));
      return;
    }
    const region = matchRegion(q);
    if (region) {
      focusKey.current += 1;
      setFocus({ center: region.center, zoom: region.zoom, key: focusKey.current });
      setRegionId(region.id);
      setRemoteBbox(regionSearchBbox(region));
    } else {
      toast.error(lang === 'zh' ? '未找到该地点，试试迪拜 / 上海 / 深圳' : 'Place not found. Try Dubai / Shanghai.');
    }
  }

  function selectRegion(region: (typeof REGIONS)[number]) {
    focusKey.current += 1;
    setSearch(lang === 'zh' ? region.name : region.nameEn);
    setAdminSelection(region.id);
    setRegionId(region.id);
    setAoi(null);
    setFocus({ center: region.center, zoom: region.zoom, key: focusKey.current });
    setRemoteBbox(regionSearchBbox(region));
  }

  function submitCoordinates() {
    const coords = parseCoords(coordinateInput);
    if (!coords) {
      toast.error(lang === 'zh' ? '请输入“纬度, 经度”，例如 31.2304, 121.4737' : 'Enter “latitude, longitude”, e.g. 31.2304, 121.4737');
      return;
    }
    setSearch(coordinateInput);
    runSearch(coordinateInput);
  }

  async function handleVectorFile(file?: File) {
    if (!file) return;
    try {
      const bbox = await parseVectorFile(file);
      if (bbox[2] - bbox[0] < 0.0001 || bbox[3] - bbox[1] < 0.0001) throw new Error('Vector extent is too small');
      focusKey.current += 1;
      setVectorName(file.name);
      setAoi(bbox);
      setRegionId(null);
      setRemoteBbox(bbox);
      setFocus({ center: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2], zoom: 10, key: focusKey.current });
      toast.success(lang === 'zh' ? `已加载 ${file.name}` : `${file.name} loaded`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : lang === 'zh' ? '矢量文件解析失败' : 'Could not read vector file');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function chooseMode(mode: 'coordinate' | 'admin' | 'vector' | 'draw') {
    setSelectionMode(mode);
    if (mode === 'draw') setDrawing(true);
  }

  function renderAreaSelector() {
    return (
      <div className="mt-3 space-y-3 border-t border-border pt-3">
        <div className="grid grid-cols-4 gap-1 rounded-md border border-border bg-input-background p-1">
          {([
            ['coordinate', LocateFixed, t.explore.coordinate],
            ['admin', MapPinned, t.explore.adminRegion],
            ['vector', Upload, t.explore.uploadVector],
            ['draw', PencilLine, t.explore.drawArea],
          ] as const).map(([mode, Icon, label]) => (
            <button
              key={mode}
              type="button"
              className={`flex min-w-0 flex-col items-center gap-1 rounded px-1 py-2 text-[10px] transition-colors ${selectionMode === mode ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
              onClick={() => chooseMode(mode)}
              title={label}
            >
              <Icon className="size-3.5" />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>
        {selectionMode === 'coordinate' && (
          <div className="flex gap-2">
            <Input value={coordinateInput} onChange={(event) => setCoordinateInput(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && submitCoordinates()} placeholder={t.explore.coordinatePlaceholder} className="h-8 text-xs" />
            <Button type="button" size="sm" className="h-8 shrink-0 px-3" onClick={submitCoordinates}>{t.common.search}</Button>
          </div>
        )}
        {selectionMode === 'admin' && (
          <select
            value={adminSelection}
            onChange={(event) => {
              const region = REGIONS.find((item) => item.id === event.target.value);
              if (region) selectRegion(region);
            }}
            className="h-8 w-full rounded-md border border-border bg-input-background px-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">{t.explore.adminPlaceholder}</option>
            {REGIONS.map((region) => <option key={region.id} value={region.id}>{lang === 'zh' ? region.name : region.nameEn}</option>)}
          </select>
        )}
        {selectionMode === 'vector' && (
          <div>
            <input ref={fileInputRef} type="file" accept=".kml,.kmz,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz" className="hidden" onChange={(event) => handleVectorFile(event.target.files?.[0])} />
            <Button type="button" variant="outline" size="sm" className="h-8 w-full text-xs" onClick={() => fileInputRef.current?.click()}><Upload className="size-3.5" />{vectorName || t.explore.uploadVectorHint}</Button>
            <p className="mt-1 text-[10px] text-muted-foreground">{t.explore.uploadVectorDesc}</p>
          </div>
        )}
        {selectionMode === 'draw' && <p className="text-[10px] text-muted-foreground">{t.explore.drawHint}</p>}
      </div>
    );
  }

  // Query public Sentinel-2 STAC data for an explicit region/AOI.
  useEffect(() => {
    if (!remoteBbox) {
      setRemoteProducts(null);
      setRemoteError(false);
      return;
    }
    let cancelled = false;
    setRemoteLoading(true);
    setRemoteError(false);
    searchEarthSearch({
      bbox: remoteBbox,
      datetime: datetimeForFilters(filters),
      cloudCoverMax: filters.cloudMax === 'all' ? undefined : Number(filters.cloudMax),
      limit: 80,
    })
      .then((products) => {
        if (!cancelled) setRemoteProducts(products);
      })
      .catch(() => {
        if (!cancelled) {
          setRemoteProducts(null);
          setRemoteError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setRemoteLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [remoteBbox, filters.cloudMax, filters.dateEnd, filters.dateStart, filters.timeMode, filters.timePreset]);

  // Filtered results
  const sourceProducts = remoteProducts ?? PRODUCTS;
  const isRemote = remoteProducts !== null;
  const results = useMemo(() => {
    let list: Product[] = sourceProducts;
    if (!isRemote && regionId) list = list.filter((p) => p.regionId === regionId);
    if (aoi) list = list.filter((p) => intersects(aoi, p.bbox));
    if (filters.categories.length) list = list.filter((p) => filters.categories.includes(p.category));
    if (filters.processingLevels.length) list = list.filter((p) => filters.processingLevels.includes(p.processingLevel));
    if (filters.dataTypes.length) list = list.filter((p) => filters.dataTypes.includes(p.dataType));

    // 分辨率筛选
    if (filters.resMode === 'preset' && filters.resMax !== 'all') {
      list = list.filter((p) => p.resolution <= parseFloat(filters.resMax));
    } else if (filters.resMode === 'range') {
      if (filters.resMin !== undefined) {
        list = list.filter((p) => p.resolution >= filters.resMin!);
      }
      if (filters.resMaxCustom !== undefined) {
        list = list.filter((p) => p.resolution <= filters.resMaxCustom!);
      }
    }

    if (filters.cloudMax !== 'all') list = list.filter((p) => p.cloudCover < parseFloat(filters.cloudMax));

    // 时间筛选
    if (filters.timeMode === 'preset' && filters.timePreset !== 'all') {
      const cutoff = Date.now() - TIME_DAYS[filters.timePreset] * 86400000;
      list = list.filter((p) => new Date(p.captureTime).getTime() >= cutoff);
    } else if (filters.timeMode === 'range' && filters.dateStart && filters.dateEnd) {
      const startTime = new Date(filters.dateStart).getTime();
      const endTime = new Date(filters.dateEnd).getTime() + 86400000; // 包含结束日期当天
      list = list.filter((p) => {
        const captureTime = new Date(p.captureTime).getTime();
        return captureTime >= startTime && captureTime < endTime;
      });
    } else if (filters.timeMode === 'single' && filters.dateStart) {
      const targetDate = filters.dateStart;
      list = list.filter((p) => p.captureTime === targetDate);
    }

    return [...list].sort((a, b) => (a.captureTime < b.captureTime ? 1 : -1));
  }, [aoi, filters, isRemote, regionId, sourceProducts]);

  const footprints: Footprint[] = useMemo(
    () => results.map((p) => ({ id: p.id, bbox: p.bbox })),
    [results],
  );

  const areaKm2 = aoi ? bboxAreaKm2(aoi) : 0;

  const compareProducts = useMemo(
    () => compareIds.map((id) => sourceProducts.find((p) => p.id === id)!).filter(Boolean),
    [compareIds, sourceProducts],
  );

  function toggleCompare(p: Product) {
    setCompareIds((ids) => {
      if (ids.includes(p.id)) return ids.filter((x) => x !== p.id);
      if (ids.length >= 3) {
        toast.error(lang === 'zh' ? '最多对比 3 个产品' : 'Compare up to 3 products');
        return ids;
      }
      return [...ids, p.id];
    });
  }

  function inquire(p: Product) {
    setDraft({
      type: 'history',
      productId: p.id,
      productName: lang === 'zh' ? p.productName : p.productNameEn,
      region: regionId ? (lang === 'zh' ? REGIONS.find((r) => r.id === regionId)?.name : REGIONS.find((r) => r.id === regionId)?.nameEn) : undefined,
      areaKm2: aoi ? Math.round(areaKm2) : p.area,
      refPrice: p.priceType === 'inquiry' ? 0 : Math.round(Math.max(aoi ? areaKm2 : p.area, p.minArea) * p.unitPrice),
      expectRes: `≤ ${p.resolution}m`,
    });
    navigate('/inquiry/new');
  }

  function buyProduct(p: Product) {
    const price = Math.round(Math.max(aoi ? areaKm2 : p.area, p.minArea) * p.unitPrice);
    addToCart(p, 'raw', price);
    toast.success(lang === 'zh' ? '已加入购物车' : 'Added to cart');
  }

  return (
    <motion.div
      className="flex h-full flex-col lg:flex-row"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    >
      {/* Left: search + filters - Desktop */}
      <motion.aside
        className="hidden w-80 shrink-0 flex-col border-r border-border bg-panel lg:flex"
        initial={{ x: -320, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.2, ease: [0.43, 0.13, 0.23, 0.96] }}
      >
        <div className="border-b border-border p-4">
          <div className="flex items-center gap-2 rounded-md border border-border bg-input-background px-2">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runSearch(search)}
              placeholder={t.explore.searchPlace}
              className="border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
            />
          </div>
          {renderAreaSelector()}
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <FilterPanel filters={filters} onChange={setFilters} />
        </div>
      </motion.aside>

      {/* Mobile Filter Sheet */}
      <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
        <SheetContent side="left" className="w-80 p-0">
          <SheetTitle className="sr-only">{t.explore.filters || '筛选'}</SheetTitle>
          <div className="border-b border-border p-4">
            <div className="flex items-center gap-2 rounded-md border border-border bg-input-background px-2">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    runSearch(search);
                    setFilterOpen(false);
                  }
                }}
                placeholder={t.explore.searchPlace}
                className="border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
              />
            </div>
            {renderAreaSelector()}
          </div>
          <div className="overflow-y-auto p-4">
            <FilterPanel filters={filters} onChange={setFilters} />
          </div>
        </SheetContent>
      </Sheet>

      {/* Center: map */}
      <motion.div
        className="relative flex min-h-0 flex-1 flex-col lg:block"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <MapCanvas
          className="absolute inset-0 size-full"
          center={[30, 20]}
          zoom={1.6}
          aoi={aoi}
          footprints={footprints}
          highlightId={highlightId}
          drawing={drawing}
          focus={focus}
          onDraw={(b) => {
            setAoi(b);
            setDrawing(false);
            setRemoteBbox(b);
          }}
          onFootprintClick={(id) => navigate(`/product/${id}`)}
          onFootprintHover={setHighlightId}
        />

        {/* toolbar */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-2 p-2 sm:p-3">
          <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 sm:gap-2">
            {/* Mobile filter button */}
            <Button
              variant="outline"
              size="sm"
              className="bg-card/90 backdrop-blur lg:hidden"
              onClick={() => setFilterOpen(true)}
            >
              <SlidersHorizontal className="size-3.5" />
              <span className="hidden sm:inline">{t.explore.filters || '筛选'}</span>
            </Button>

            <Button
              variant={drawing ? 'default' : 'outline'}
              size="sm"
              className="bg-card/90 backdrop-blur"
              onClick={() => {
                setSelectionMode('draw');
                setDrawing((d) => !d);
              }}
            >
              <Square className="size-3.5" />
              <span className="hidden sm:inline">{drawing ? t.explore.drawing : t.explore.drawRect}</span>
            </Button>
            {aoi && (
              <Button
                variant="outline"
                size="sm"
                className="bg-card/90 backdrop-blur"
                onClick={() => {
                  setAoi(null);
                  setVectorName('');
                  setAdminSelection('');
                  if (regionId) {
                    const region = REGIONS.find((item) => item.id === regionId);
                    setRemoteBbox(region ? regionSearchBbox(region) : null);
                  } else {
                    setRemoteBbox(null);
                  }
                }}
              >
                <Trash2 className="size-3.5" />
                <span className="hidden sm:inline">{t.explore.clearArea}</span>
              </Button>
            )}

            {/* Mobile results button */}
            <Button
              variant="outline"
              size="sm"
              className="ml-auto bg-card/90 backdrop-blur xl:hidden"
              onClick={() => setResultOpen(true)}
            >
              <List className="size-3.5" />
              <span className="hidden sm:inline">{results.length}</span>
            </Button>

            {drawing && (
              <span className="hidden rounded-md border border-border bg-card/90 px-2 py-1 text-xs text-muted-foreground backdrop-blur sm:inline">
                {t.explore.drawHint}
              </span>
            )}
          </div>
        </div>

        {/* AOI readout */}
        {aoi && (
          <div className="pointer-events-none absolute bottom-2 left-2 rounded-md border border-border bg-card/90 px-2 py-1.5 backdrop-blur sm:bottom-3 sm:left-3 sm:px-3 sm:py-2">
            <div className="tech-label text-[9px] text-muted-foreground sm:text-[10px]">{t.explore.targetArea}</div>
            <div className="font-mono text-base text-primary sm:text-lg">
              {fmtArea(areaKm2)} <span className="text-xs text-muted-foreground sm:text-sm">{lang === 'zh' ? 'km²' : 'km²'}</span>
            </div>
            <div className="font-mono text-[9px] text-muted-foreground sm:text-[10px]">
              {aoi[1].toFixed(5)}, {aoi[0].toFixed(5)} → {aoi[3].toFixed(5)}, {aoi[2].toFixed(5)}
            </div>
          </div>
        )}

        {/* compare bar */}
        {compareIds.length > 0 && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 sm:bottom-3">
            <Button className="shadow-lg" size="sm" onClick={() => setCompareOpen(true)}>
              <GitCompare className="size-3.5 sm:size-4" />
              <span className="text-xs sm:text-sm">{t.explore.compare} ({compareIds.length}/3)</span>
            </Button>
          </div>
        )}
      </motion.div>

      {/* Right: results - Desktop */}
      <motion.aside
        className="hidden w-[380px] shrink-0 flex-col border-l border-border bg-panel xl:flex"
        initial={{ x: 380, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.2, ease: [0.43, 0.13, 0.23, 0.96] }}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h3 className="text-sm">{t.explore.results}</h3>
            <div className="tech-label text-[10px] text-muted-foreground">
              {t.explore.resultsCount(results.length)}
            </div>
            {remoteLoading && <div className="mt-1 text-[10px] text-primary">{lang === 'zh' ? '正在查询公开卫星数据…' : 'Querying open satellite data…'}</div>}
            {!remoteLoading && isRemote && <div className="mt-1 text-[10px] text-emerald-500">Earth Search / Sentinel-2</div>}
            {remoteError && <div className="mt-1 text-[10px] text-warning">{lang === 'zh' ? '公开数据源暂不可用，已回退示例数据' : 'Open source unavailable; showing demo data'}</div>}
          </div>
          {!aoi && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Crosshair className="size-3" />
              {lang === 'zh' ? '绘制区域看覆盖率' : 'Draw AOI for coverage'}
            </span>
          )}
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {results.length === 0 && (
            <div className="pt-16 text-center text-sm text-muted-foreground">{t.common.noResults}</div>
          )}
          {results.map((p) => (
            <ResultCard
              key={p.id}
              product={p}
              coverage={aoi ? coverageRatio(aoi, p.bbox) : undefined}
              active={highlightId === p.id}
              inCompare={compareIds.includes(p.id)}
              onDetail={() => navigate(`/product/${p.id}`)}
              onCompare={() => toggleCompare(p)}
              onInquire={() => inquire(p)}
              onBuy={() => buyProduct(p)}
              onHover={(h) => setHighlightId(h ? p.id : null)}
            />
          ))}
        </div>
      </motion.aside>

      {/* Mobile Results Sheet */}
      <Sheet open={resultOpen} onOpenChange={setResultOpen}>
        <SheetContent side="right" className="w-full p-0 sm:max-w-md">
          <SheetTitle className="sr-only">{t.explore.results}</SheetTitle>
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <h3 className="text-sm">{t.explore.results}</h3>
                <div className="tech-label text-[10px] text-muted-foreground">
                  {t.explore.resultsCount(results.length)}
                </div>
                {remoteLoading && <div className="mt-1 text-[10px] text-primary">{lang === 'zh' ? '正在查询公开卫星数据…' : 'Querying open satellite data…'}</div>}
                {!remoteLoading && isRemote && <div className="mt-1 text-[10px] text-emerald-500">Earth Search / Sentinel-2</div>}
                {remoteError && <div className="mt-1 text-[10px] text-warning">{lang === 'zh' ? '公开数据源暂不可用，已回退示例数据' : 'Open source unavailable; showing demo data'}</div>}
              </div>
              {!aoi && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Crosshair className="size-3" />
                  <span className="hidden sm:inline">{lang === 'zh' ? '绘制区域看覆盖率' : 'Draw AOI'}</span>
                </span>
              )}
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {results.length === 0 && (
                <div className="pt-16 text-center text-sm text-muted-foreground">{t.common.noResults}</div>
              )}
              {results.map((p) => (
                <ResultCard
                  key={p.id}
                  product={p}
                  coverage={aoi ? coverageRatio(aoi, p.bbox) : undefined}
                  active={highlightId === p.id}
                  inCompare={compareIds.includes(p.id)}
                  onDetail={() => {
                    navigate(`/product/${p.id}`);
                    setResultOpen(false);
                  }}
                  onCompare={() => toggleCompare(p)}
                  onInquire={() => {
                    inquire(p);
                    setResultOpen(false);
                  }}
                  onBuy={() => {
                    buyProduct(p);
                    setResultOpen(false);
                  }}
                  onHover={(h) => setHighlightId(h ? p.id : null)}
                />
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <CompareDrawer
        products={compareProducts}
        open={compareOpen}
        onOpenChange={setCompareOpen}
        onRemove={(id) => setCompareIds((ids) => ids.filter((x) => x !== id))}
        onInquire={(p) => {
          setCompareOpen(false);
          inquire(p);
        }}
      />
    </motion.div>
  );
}
