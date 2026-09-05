import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Search, Square, Trash2, GitCompare, Crosshair, SlidersHorizontal, List, Upload, MapPinned, ChevronDown, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useI18n } from '../i18n';
import { PRODUCTS, REGIONS, type Product } from '../data/products';
import { coverageRatio, intersects, bboxAreaKm2, geometryAreaKm2, fmtArea, parseCoords, parseVectorFile, type BBox } from '../lib/geo';
import { MapCanvas, type Footprint } from '../components/MapCanvas';
import { FilterPanel, DEFAULT_FILTERS, type Filters } from '../components/FilterPanel';
import { ResultCard } from '../components/ResultCard';
import { CompareDrawer } from '../components/CompareDrawer';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Sheet, SheetContent, SheetTitle } from '../components/ui/sheet';
import { useInquiryDraft } from '../context/InquiryContext';
import { useCart } from '../context/CartContext';
import { searchEarthSearch } from '../services/stac';
import { fetchCatalogProducts } from '../services/catalog';
import { fetchGlobalCities, fetchGlobalCountries, fetchGlobalDistricts, fetchGlobalStates, getGlobalAdminArea, searchGlobalAdminAreas, type GlobalCity, type GlobalCountry, type GlobalState } from '../services/admin';
import { toast } from 'sonner';

function countryLabel(country: GlobalCountry, lang: string) {
  if (lang !== 'zh') return country.name;
  try {
    return new Intl.DisplayNames(['zh-CN'], { type: 'region' }).of(country.iso2) ?? country.name;
  } catch {
    return country.name;
  }
}

function stateLabel(state: GlobalState) {
  return state.name;
}

function cityLabel(city: GlobalCity) {
  return city.name;
}

function matchRegion(q: string) {
  const s = q.trim().toLowerCase();
  if (s.length < 2) return null;
  const compact = (value: string) => value.toLowerCase().replace(/[\s,，.·'’\-_/]+/g, '');
  const compactQuery = compact(s);
  const candidates = REGIONS.flatMap((region) => [
    ...region.aliases.map((alias) => ({ region, value: alias.toLowerCase() })),
    { region, value: region.name.toLowerCase() },
    { region, value: region.nameEn.toLowerCase() },
  ]);
  return candidates
    .map(({ region, value }) => ({
      region,
      score: value === s
        ? 0
        : value.startsWith(s)
          ? 1
          : value.includes(s)
            ? 2
            : compactQuery.includes(compact(value))
              ? 3
              : compact(value).includes(compactQuery)
                ? 4
                : 99,
    }))
    .filter((candidate) => candidate.score < 99)
    .sort((a, b) => a.score - b.score || a.region.name.length - b.region.name.length)[0]?.region ?? null;
}

const TIME_DAYS: Record<string, number> = { '1': 1, '7': 7, '30': 30, '90': 90, '365': 365, all: Infinity };

type CategoryQuery = 'archive' | 'latest' | 'tasking' | 'sar' | 'dem' | 'analysis';

function filtersForCategory(value: string | null): Filters {
  const base = { ...DEFAULT_FILTERS };
  switch (value as CategoryQuery | null) {
    case 'archive':
      return { ...base, categories: ['archive'] };
    case 'latest':
      return { ...base, categories: ['archive'], timeMode: 'preset', timePreset: '30' };
    case 'tasking':
      return { ...base, categories: ['tasking'] };
    case 'sar':
      return { ...base, dataTypes: ['sar'] };
    case 'dem':
      return { ...base, dataTypes: ['dem'] };
    case 'analysis':
      return { ...base, categories: ['analysis'] };
    default:
      return base;
  }
}

function regionSearchBbox(region: (typeof REGIONS)[number]): BBox {
  const [lng, lat] = region.center;
  return boundedBbox(lng - 0.35, lat - 0.25, lng + 0.35, lat + 0.25);
}

function pointSearchBbox([lng, lat]: [number, number]): BBox {
  return boundedBbox(lng - 0.25, lat - 0.2, lng + 0.25, lat + 0.2);
}

function boundedBbox(west: number, south: number, east: number, north: number): BBox {
  // Keep a longitude just outside [-180, 180] when the search window crosses
  // the date line. `splitBBox` converts it into legal provider requests while
  // preserving the narrow area and both sides of the globe.
  const w = Math.max(-540, Math.min(540, Math.min(west, east)));
  const e = Math.max(-540, Math.min(540, Math.max(west, east)));
  const s = Math.max(-90, Math.min(90, south));
  const n = Math.max(-90, Math.min(90, north));
  return [w, s, Math.max(w + 0.0001, e), Math.max(s + 0.0001, n)];
}

function datetimeForFilters(filters: Filters): string | undefined {
  if (filters.timeMode === 'single' && filters.dateStart) {
    return `${filters.dateStart}T00:00:00Z/${filters.dateStart}T23:59:59Z`;
  }
  if (filters.timeMode === 'range' && filters.dateStart && filters.dateEnd) {
    const [start, end] = filters.dateStart <= filters.dateEnd
      ? [filters.dateStart, filters.dateEnd]
      : [filters.dateEnd, filters.dateStart];
    return `${start}T00:00:00Z/${end}T23:59:59Z`;
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
  const queryParam = params.get('q');
  const categoryParam = params.get('category');
  const adminLang = lang === 'zh' ? 'zh' : 'en';

  const [search, setSearch] = useState('');
  const [selectionMode, setSelectionMode] = useState<'admin' | 'vector'>('admin');
  const [areaSelectorOpen, setAreaSelectorOpen] = useState(false);
  const [adminCountry, setAdminCountry] = useState('');
  const [adminLevel1, setAdminLevel1] = useState('');
  const [adminLevel2, setAdminLevel2] = useState('');
  const [adminLevel3, setAdminLevel3] = useState('');
  const [globalCountries, setGlobalCountries] = useState<GlobalCountry[]>([]);
  const [globalStates, setGlobalStates] = useState<GlobalState[]>([]);
  const [globalCities, setGlobalCities] = useState<GlobalCity[]>([]);
  const [globalDistricts, setGlobalDistricts] = useState<GlobalCity[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const stateRequestRef = useRef(0);
  const cityRequestRef = useRef(0);
  const districtRequestRef = useRef(0);
  const adminGeoRequestRef = useRef(0);
  const [vectorName, setVectorName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [regionId, setRegionId] = useState<string | null>(null);
  const [aoi, setAoi] = useState<BBox | null>(null);
  const [boundary, setBoundary] = useState<GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null>(null);
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
  const searchRequestRef = useRef(0);
  const [catalogProducts, setCatalogProducts] = useState<Product[] | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState(false);
  const demoDataEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_MOCK_DATA === 'true';

  useEffect(() => {
    let cancelled = false;
    setCatalogLoading(true);
    fetchCatalogProducts({ limit: 100 })
      .then((products) => {
        if (!cancelled) {
          setCatalogProducts(products);
          setCatalogError(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCatalogProducts([]);
          setCatalogError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchGlobalCountries(adminLang)
      .then((countries) => {
        if (!cancelled) setGlobalCountries(countries);
      })
      .catch(() => {
        if (!cancelled) setGlobalCountries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [adminLang]);

  // Home category cards carry a filter intent in the URL so deep links and
  // refreshes open the same product view instead of an unfiltered explorer.
  useEffect(() => {
    setFilters(filtersForCategory(categoryParam));
  }, [categoryParam]);

  // Handle ?q= from home
  useEffect(() => {
    if (queryParam) {
      setSearch(queryParam);
      // URL changes are the source of truth for shareable searches. The
      // handler below navigates first and returns, so this effect performs
      // the actual search exactly once for the new query.
      void runSearch(queryParam, false);
    } else if (searchRequestRef.current > 0) {
      // Navigating back to the plain explorer URL must not leave the previous
      // coordinate/place result and map focus mounted in the same component.
      searchRequestRef.current += 1;
      adminGeoRequestRef.current += 1;
      setSearch('');
      setAoi(null);
      setBoundary(null);
      setVectorName('');
      setRegionId(null);
      setRemoteBbox(null);
      setRemoteProducts(null);
      setRemoteError(false);
      setAdminCountry('');
      setAdminLevel1('');
      setAdminLevel2('');
      setAdminLevel3('');
      setGlobalStates([]);
      setGlobalCities([]);
      setGlobalDistricts([]);
      focusKey.current += 1;
      setFocus(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryParam]);

  async function runSearch(q: string, syncUrl = true) {
    const query = q.trim();
    if (!query) return;
    // Keep the search addressable and shareable. This also makes a search
    // entered directly in the explorer behave the same as a home-page search.
    if (syncUrl && queryParam !== query) {
      setSearch(query);
      navigate(`/explore?q=${encodeURIComponent(query)}`, { replace: true });
      return;
    }
    const requestId = ++searchRequestRef.current;
    adminGeoRequestRef.current += 1;
    setDrawing(false);
    setSearch(query);
    setAoi(null);
    setBoundary(null);
    setVectorName('');
    setRegionId(null);
    setRemoteBbox(null);
    setRemoteProducts(null);
    setRemoteError(false);
    setAdminCountry('');
    setAdminLevel1('');
    setAdminLevel2('');
    setAdminLevel3('');
    setGlobalStates([]);
    setGlobalCities([]);
    setGlobalDistricts([]);
    const coords = parseCoords(query);
    if (coords) {
      focusKey.current += 1;
      setFocus({ center: coords, zoom: 12, key: focusKey.current });
      setRemoteBbox(pointSearchBbox(coords));
      return;
    }
    const region = matchRegion(query);
    if (region) {
      selectRegion(region);
      return;
    }

    // Resolve arbitrary global place names against the versioned ADM0-ADM3
    // directory. The request is server-side, cached and rate-limited.
    try {
      const matches = await searchGlobalAdminAreas(query, adminLang);
      if (requestId !== searchRequestRef.current) return;
      const match = matches[0];
      if (match) {
        if (match.level === 0) {
          selectGlobalCountry(match.id);
          setAreaSelectorOpen(true);
        } else {
          await focusAdminArea(match.id, match.level ?? 1);
        }
        return;
      }
    } catch {
      // Keep the user-facing error concise; the server logs the upstream cause.
    }
    if (requestId === searchRequestRef.current) {
      toast.error(lang === 'zh' ? '未找到该地点，请输入城市、行政区或经纬度' : 'Place not found. Enter a city, administrative area, or coordinates.');
    }
  }

  async function focusAdminArea(id: string, level: 0 | 1 | 2 | 3) {
    const requestId = ++adminGeoRequestRef.current;
    const area = await getGlobalAdminArea(id, adminLang).catch(() => null);
    if (requestId !== adminGeoRequestRef.current || !area) return;
    if (!Number.isFinite(area.lat) || !Number.isFinite(area.lon)) {
      toast.error(lang === 'zh' ? '该行政区缺少可用边界数据' : 'This administrative area has no usable boundary data.');
      return;
    }
    const bbox = area.bbox ?? pointSearchBbox([area.lon, area.lat]);
    focusKey.current += 1;
    setRegionId(null);
    setSearch(area.name);
    setBoundary(area.boundary ?? null);
    setAoi(bbox);
    setFocus({ center: [area.lon, area.lat], zoom: area.boundary ? [3, 5, 7, 9][level] : 10, key: focusKey.current });
    setRemoteBbox(bbox);
  }

  function selectGlobalCountry(countryId: string) {
    setAdminCountry(countryId);
    setAdminLevel1('');
    setAdminLevel2('');
    setAdminLevel3('');
    setGlobalStates([]);
    setGlobalCities([]);
    setGlobalDistricts([]);
    void focusAdminArea(countryId, 0);
  }

  function selectGlobalCity(city: GlobalCity, level: 'city' | 'district' = 'city') {
    if (level === 'city') {
      setAdminLevel2(city.id);
      setAdminLevel3('');
      setGlobalDistricts([]);
      void focusAdminArea(city.id, 2);
    } else {
      setAdminLevel3(city.id);
      void focusAdminArea(city.id, 3);
    }
  }

  function clearAdminCountry() {
    adminGeoRequestRef.current += 1;
    setAdminCountry('');
    setAdminLevel1('');
    setAdminLevel2('');
    setAdminLevel3('');
    setGlobalStates([]);
    setGlobalCities([]);
    setGlobalDistricts([]);
    setRegionId(null);
    setBoundary(null);
    setAoi(null);
    setRemoteBbox(null);
  }

  function clearAdminLevel1() {
    setAdminLevel1('');
    setAdminLevel2('');
    setAdminLevel3('');
    setGlobalCities([]);
    setGlobalDistricts([]);
    if (adminCountry) void focusAdminArea(adminCountry, 0);
  }

  function clearAdminLevel2() {
    setAdminLevel2('');
    setAdminLevel3('');
    setGlobalDistricts([]);
    if (adminLevel1) void focusAdminArea(adminLevel1, 1);
  }

  function clearAdminLevel3() {
    setAdminLevel3('');
    const city = globalCities.find((item) => item.id === adminLevel2);
    if (city) void focusAdminArea(city.id, 2);
  }

  function selectGlobalState(stateId: string) {
    setAdminLevel1(stateId);
    setAdminLevel2('');
    setAdminLevel3('');
    setGlobalDistricts([]);
    setGlobalCities([]);
    void focusAdminArea(stateId, 1);
  }

  function selectRegion(region: (typeof REGIONS)[number]) {
    focusKey.current += 1;
    setSearch(lang === 'zh' ? region.name : region.nameEn);
    setRegionId(region.id);
    setAoi(null);
    setBoundary(null);
    setFocus({ center: region.center, zoom: region.zoom, key: focusKey.current });
    setRemoteBbox(regionSearchBbox(region));
  }

  useEffect(() => {
    const country = globalCountries.find((item) => item.id === adminCountry);
    if (!country) {
      setGlobalStates([]);
      return;
    }
    const requestId = ++stateRequestRef.current;
    setAdminLoading(true);
    fetchGlobalStates(country.iso3, adminLang)
      .then((states) => {
        if (requestId === stateRequestRef.current) setGlobalStates(states);
      })
      .catch(() => {
        if (requestId === stateRequestRef.current) setGlobalStates([]);
      })
      .finally(() => {
        if (requestId === stateRequestRef.current) setAdminLoading(false);
      });
  }, [adminCountry, adminLang, globalCountries]);

  useEffect(() => {
    if (!adminLevel1) {
      setGlobalCities([]);
      return;
    }
    const requestId = ++cityRequestRef.current;
    setAdminLoading(true);
    fetchGlobalCities(adminLevel1, adminLang)
      .then((cities) => {
        if (requestId === cityRequestRef.current) setGlobalCities(cities);
      })
      .catch(() => {
        if (requestId === cityRequestRef.current) setGlobalCities([]);
      })
      .finally(() => {
        if (requestId === cityRequestRef.current) setAdminLoading(false);
      });
  }, [adminLang, adminLevel1]);

  useEffect(() => {
    if (!adminLevel2) {
      setGlobalDistricts([]);
      return;
    }
    const requestId = ++districtRequestRef.current;
    setAdminLoading(true);
    fetchGlobalDistricts(adminLevel2, adminLang)
      .then((districts) => {
        if (requestId === districtRequestRef.current) setGlobalDistricts(districts);
      })
      .catch(() => {
        if (requestId === districtRequestRef.current) setGlobalDistricts([]);
      })
      .finally(() => {
        if (requestId === districtRequestRef.current) setAdminLoading(false);
      });
  }, [adminLang, adminLevel2]);

  async function handleVectorFile(file?: File) {
    if (!file) return;
    try {
      const bbox = await parseVectorFile(file);
      if (bbox[2] - bbox[0] < 0.0001 || bbox[3] - bbox[1] < 0.0001) throw new Error('Vector extent is too small');
      focusKey.current += 1;
      setVectorName(file.name);
      setAoi(bbox);
      setBoundary(null);
      setRegionId(null);
      setAdminCountry('');
      setAdminLevel1('');
      setAdminLevel2('');
      setAdminLevel3('');
      setGlobalStates([]);
      setGlobalCities([]);
      setGlobalDistricts([]);
      setRemoteBbox(bbox);
      setFocus({ center: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2], zoom: 10, key: focusKey.current });
      toast.success(lang === 'zh' ? `已加载 ${file.name}` : `${file.name} loaded`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : lang === 'zh' ? '矢量文件解析失败' : 'Could not read vector file');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function renderAreaSelector() {
    const selectedGlobalCountry = globalCountries.find((country) => country.id === adminCountry);
    const selectedLevel1 = globalStates.find((state) => state.id === adminLevel1);
    return (
      <div className="mt-3 space-y-3 border-t border-border pt-3">
        <div className="grid grid-cols-2 gap-1 rounded-md border border-border bg-input-background p-1">
          {([
            ['admin', MapPinned, t.explore.adminRegion],
            ['vector', Upload, t.explore.uploadVector],
          ] as const).map(([mode, Icon, label]) => (
            <button
              key={mode}
              type="button"
              className={`flex h-9 min-w-0 items-center justify-center gap-1.5 rounded px-2 text-xs transition-colors ${selectionMode === mode ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
              onClick={() => {
                if (selectionMode === mode) setAreaSelectorOpen((open) => !open);
                else { setSelectionMode(mode); setAreaSelectorOpen(true); }
              }}
              title={label}
              aria-expanded={selectionMode === mode ? areaSelectorOpen : undefined}
            >
              <Icon className="size-3.5 shrink-0" />
              <span className="truncate">{label}</span>
              {selectionMode === mode && <ChevronDown className={`size-3 shrink-0 transition-transform ${areaSelectorOpen ? 'rotate-180' : ''}`} />}
            </button>
          ))}
        </div>
        {selectionMode === 'admin' && areaSelectorOpen && (
          <div className="space-y-2">
            <label className="block space-y-1">
              <span className="flex items-center justify-between"><span className="tech-label text-[9px] text-muted-foreground">{t.explore.country}</span>{adminCountry && <button type="button" aria-label={lang === 'zh' ? '清除国家或地区' : 'Clear country or region'} className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={(event) => { event.preventDefault(); clearAdminCountry(); }}><X className="size-3" /></button>}</span>
              <div className="relative">
                <select
                  value={adminCountry}
                  onChange={(event) => {
                    if (!event.target.value) { clearAdminCountry(); return; }
                    selectGlobalCountry(event.target.value);
                  }}
                  className="h-8 w-full appearance-none rounded-md border border-border bg-input-background py-0 pl-2 pr-8 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">{t.explore.countryPlaceholder}</option>
                  {globalCountries.map((country) => <option key={country.id} value={country.id}>{countryLabel(country, lang)}</option>)}
                </select>
                <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
              </div>
            </label>
            {adminCountry && <label className="block space-y-1">
              <span className="flex items-center justify-between"><span className="tech-label text-[9px] text-muted-foreground">{t.explore.adminLevel1}</span>{adminLevel1 && <button type="button" aria-label={lang === 'zh' ? '清除一级行政区' : 'Clear first-level area'} className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={(event) => { event.preventDefault(); clearAdminLevel1(); }}><X className="size-3" /></button>}</span>
              <div className="relative"><select
                value={adminLevel1}
                disabled={!selectedGlobalCountry}
                onChange={(event) => {
                  if (!event.target.value) { clearAdminLevel1(); return; }
                  void selectGlobalState(event.target.value);
                }}
                className="h-8 w-full appearance-none rounded-md border border-border bg-input-background py-0 pl-2 pr-8 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">{t.explore.adminLevel1Placeholder}</option>
                {globalStates.map((area) => <option key={area.id} value={area.id}>{stateLabel(area)}</option>)}
              </select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" /></div>
            </label>}
            {adminCountry && adminLevel1 && <label className="block space-y-1">
              <span className="flex items-center justify-between"><span className="tech-label text-[9px] text-muted-foreground">{t.explore.adminLevel2}</span>{adminLevel2 && <button type="button" aria-label={lang === 'zh' ? '清除二级行政区' : 'Clear second-level area'} className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={(event) => { event.preventDefault(); clearAdminLevel2(); }}><X className="size-3" /></button>}</span>
              <div className="relative"><select
                value={adminLevel2}
                disabled={!selectedLevel1}
                onChange={(event) => {
                  if (!event.target.value) { clearAdminLevel2(); return; }
                  setAdminLevel2(event.target.value);
                  setAdminLevel3('');
                  setGlobalDistricts([]);
                  const city = globalCities.find((item) => item.id === event.target.value);
                  if (city) void selectGlobalCity(city);
                }}
                className="h-8 w-full appearance-none rounded-md border border-border bg-input-background py-0 pl-2 pr-8 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">{adminLoading ? (lang === 'zh' ? '加载城市中…' : 'Loading cities…') : t.explore.adminLevel2Placeholder}</option>
                {globalCities.map((city) => <option key={city.id} value={city.id}>{cityLabel(city)}</option>)}
              </select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" /></div>
            </label>}
            {adminCountry && adminLevel1 && adminLevel2 && <label className="block space-y-1">
              <span className="flex items-center justify-between"><span className="tech-label text-[9px] text-muted-foreground">{t.explore.adminLevel3}</span><button type="button" aria-label={lang === 'zh' ? '清除三级行政区' : 'Clear third-level area'} title={lang === 'zh' ? '清除三级行政区' : 'Clear third-level area'} className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={(event) => { event.preventDefault(); clearAdminLevel3(); }}><X className="size-3" /></button></span>
              <div className="relative"><select
                value={adminLevel3}
                disabled={!adminLevel2}
                onChange={(event) => {
                  if (!event.target.value) { clearAdminLevel3(); return; }
                  const district = globalDistricts.find((item) => item.id === event.target.value);
                  setAdminLevel3(event.target.value);
                  if (district) void selectGlobalCity(district, 'district');
                }}
                className="h-8 w-full appearance-none rounded-md border border-border bg-input-background py-0 pl-2 pr-8 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">{globalDistricts.length ? t.explore.adminLevel3Placeholder : (lang === 'zh' ? '暂无三级行政区数据' : 'No third-level areas')}</option>
                {globalDistricts.map((district) => <option key={district.id} value={district.id}>{cityLabel(district)}</option>)}
              </select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" /></div>
            </label>}
          </div>
        )}
        {selectionMode === 'vector' && areaSelectorOpen && (
          <div>
            <input ref={fileInputRef} type="file" accept=".kml,.kmz,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz" className="hidden" onChange={(event) => handleVectorFile(event.target.files?.[0])} />
            <Button type="button" variant="outline" size="sm" className="h-8 w-full text-xs" onClick={() => fileInputRef.current?.click()}><Upload className="size-3.5" />{vectorName || t.explore.uploadVectorHint}</Button>
            <p className="mt-1 text-[10px] text-muted-foreground">{t.explore.uploadVectorDesc}</p>
          </div>
        )}
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
  }, [remoteBbox, filters]);

  // Filtered results
  const sourceProducts = useMemo(
    () => remoteProducts ?? (catalogProducts && catalogProducts.length > 0 ? catalogProducts : demoDataEnabled ? PRODUCTS : []),
    [catalogProducts, demoDataEnabled, remoteProducts],
  );
  const isRemote = remoteProducts !== null;
  const isDemoProducts = remoteProducts === null && demoDataEnabled && (!catalogProducts || catalogProducts.length === 0);
  const results = useMemo(() => {
    let list: Product[] = sourceProducts;
    if (isDemoProducts && regionId) list = list.filter((p) => p.regionId === regionId);
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

    if (!isRemote && filters.cloudMax !== 'all') list = list.filter((p) => p.cloudCover <= parseFloat(filters.cloudMax));

    // 时间筛选
    if (filters.timeMode === 'preset' && filters.timePreset !== 'all') {
      const cutoff = Date.now() - TIME_DAYS[filters.timePreset] * 86400000;
      list = list.filter((p) => new Date(p.captureTime).getTime() >= cutoff);
    } else if (filters.timeMode === 'range' && filters.dateStart && filters.dateEnd) {
      const [startDate, endDate] = filters.dateStart <= filters.dateEnd
        ? [filters.dateStart, filters.dateEnd]
        : [filters.dateEnd, filters.dateStart];
      const startTime = new Date(startDate).getTime();
      const endTime = new Date(endDate).getTime() + 86400000; // 包含结束日期当天
      list = list.filter((p) => {
        const captureTime = new Date(p.captureTime).getTime();
        return captureTime >= startTime && captureTime < endTime;
      });
    } else if (filters.timeMode === 'single' && filters.dateStart) {
      const targetDate = filters.dateStart;
      list = list.filter((p) => p.captureTime === targetDate);
    }

    return [...list].sort((a, b) => (a.captureTime < b.captureTime ? 1 : -1));
  }, [aoi, filters, isDemoProducts, isRemote, regionId, sourceProducts]);

  const footprints: Footprint[] = useMemo(
    () => results.map((p) => ({ id: p.id, bbox: p.bbox })),
    [results],
  );

  const areaKm2 = boundary ? geometryAreaKm2(boundary.geometry) : aoi ? bboxAreaKm2(aoi) : 0;

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
    // Preserve the product's normalized level so list-page purchases match the
    // detail page, cart line item, and eventual order snapshot.
    addToCart(p, p.processingLevel, price);
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
        <SheetContent side="left" className="w-80 p-0 pt-14">
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
          boundary={boundary}
          footprints={footprints}
          highlightId={highlightId}
          drawing={drawing}
          focus={focus}
          onDraw={(b) => {
            setAoi(b);
            setBoundary(null);
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
              className={drawing ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-card/90 backdrop-blur'}
              onClick={() => {
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
                  setBoundary(null);
                  setVectorName('');
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
            {catalogLoading && !remoteProducts && <div className="mt-1 text-[10px] text-primary">{lang === 'zh' ? '正在加载已核验产品…' : 'Loading verified products…'}</div>}
            {catalogError && !remoteProducts && !demoDataEnabled && <div className="mt-1 text-[10px] text-warning">{lang === 'zh' ? '产品目录暂不可用，请稍后重试' : 'Product catalog is temporarily unavailable'}</div>}
            {remoteLoading && <div className="mt-1 text-[10px] text-primary">{lang === 'zh' ? '正在查询公开卫星数据…' : 'Querying open satellite data…'}</div>}
            {remoteError && <div className="mt-1 text-[10px] text-warning">{lang === 'zh' ? (demoDataEnabled ? '公开数据源暂不可用，已回退示例数据' : '公开数据源暂不可用') : (demoDataEnabled ? 'Open source unavailable; showing demo data' : 'Open source unavailable')}</div>}
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
        <SheetContent side="right" className="w-full p-0 pt-14 sm:max-w-md">
          <SheetTitle className="sr-only">{t.explore.results}</SheetTitle>
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <h3 className="text-sm">{t.explore.results}</h3>
                <div className="tech-label text-[10px] text-muted-foreground">
                  {t.explore.resultsCount(results.length)}
                </div>
                {catalogLoading && !remoteProducts && <div className="mt-1 text-[10px] text-primary">{lang === 'zh' ? '正在加载已核验产品…' : 'Loading verified products…'}</div>}
                {catalogError && !remoteProducts && !demoDataEnabled && <div className="mt-1 text-[10px] text-warning">{lang === 'zh' ? '产品目录暂不可用，请稍后重试' : 'Product catalog is temporarily unavailable'}</div>}
                {remoteLoading && <div className="mt-1 text-[10px] text-primary">{lang === 'zh' ? '正在查询公开卫星数据…' : 'Querying open satellite data…'}</div>}
                {remoteError && <div className="mt-1 text-[10px] text-warning">{lang === 'zh' ? (demoDataEnabled ? '公开数据源暂不可用，已回退示例数据' : '公开数据源暂不可用') : (demoDataEnabled ? 'Open source unavailable; showing demo data' : 'Open source unavailable')}</div>}
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
