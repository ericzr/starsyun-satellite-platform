import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  Search,
  Square,
  Pentagon,
  Trash2,
  GitCompare,
  Crosshair,
  SlidersHorizontal,
  List,
  Upload,
  MapPinned,
  ChevronDown,
  X,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useI18n } from '../i18n';
import {
  PRODUCTS,
  REGIONS,
  type DataType,
  type Product,
  type ProductCategory,
  type ProcessingLevel,
  type ValueAddedService,
} from '../data/products';
import {
  coverageRatio,
  intersects,
  bboxAreaKm2,
  geometryAreaKm2,
  fmtArea,
  parseCoords,
  parseVectorFile,
  bboxToPolygon,
  type BBox,
} from '../lib/geo';
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
import {
  fetchGlobalCities,
  fetchGlobalCountries,
  fetchGlobalDistricts,
  fetchGlobalStates,
  getGlobalAdminArea,
  searchGlobalAdminAreas,
  type GlobalCity,
  type GlobalCountry,
  type GlobalState,
} from '../services/admin';
import { toast } from 'sonner';
import { todayInTimeZone, validTimeZone } from '../lib/capture-window';

function countryLabel(country: GlobalCountry) {
  return country.name;
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
  return (
    candidates
      .map(({ region, value }) => ({
        region,
        score:
          value === s
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
      .sort((a, b) => a.score - b.score || a.region.name.length - b.region.name.length)[0]
      ?.region ?? null
  );
}

type CategoryQuery = 'archive' | 'latest' | 'tasking' | 'sar' | 'dem' | 'analysis';

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function filtersForCategory(value: string | null): Filters {
  const base = { ...DEFAULT_FILTERS };
  switch (value as CategoryQuery | null) {
    case 'archive':
      return { ...base, categories: ['archive'] };
    case 'latest':
      return {
        ...base,
        categories: ['archive'],
        dateStart: dateOnly(new Date(Date.now() - 30 * 86400000)),
        dateEnd: dateOnly(new Date()),
      };
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

const FILTER_DATA_TYPES: DataType[] = [
  'optical',
  'multispectral',
  'hyperspectral',
  'sar',
  'nightlight',
  'dem',
  'video',
];
const FILTER_CATEGORIES: ProductCategory[] = ['archive', 'tasking', 'analysis'];
const FILTER_PROCESSING_LEVELS: ProcessingLevel[] = ['L1', 'L2', 'L3', 'L4'];
const FILTER_SERVICES: ValueAddedService[] = [
  'change-detection',
  'land-cover',
  'feature-extraction',
  'time-series',
  'custom-analysis',
];
const FILTER_URL_KEYS = [
  'ptype',
  'dt',
  'pl',
  'start',
  'end',
  'res',
  'rmax',
  'cloud',
  'angle',
  'delivery',
  'days',
  'service',
  'tz',
] as const;

function parseListParam<T extends string>(value: string | null, allowed: readonly T[]): T[] {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(
      (item, index, values): item is T =>
        allowed.includes(item as T) && values.indexOf(item) === index,
    );
}

function parseBoundedNumber(value: string | null, min: number, max: number) {
  if (value == null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
}

function filtersFromSearchParams(params: URLSearchParams, categoryParam: string | null): Filters {
  const base = filtersForCategory(categoryParam);
  const selectedCategory =
    parseListParam(params.get('ptype'), FILTER_CATEGORIES)[0] ?? base.categories[0];
  const rawResolution = params.get('res');
  const resolutionIsCustom = rawResolution === 'custom';
  const presetResolution = ['all', '0.3', '0.5', '1', '2.5', '5', '10', '30'].includes(
    rawResolution ?? '',
  )
    ? rawResolution!
    : base.resMax;
  const delivery = params.get('delivery');
  const deliveryMode =
    delivery === 'instant' || delivery === 'inquiry' ? delivery : base.deliveryMode;
  const service = params.get('service');

  const captureTimeZone = validTimeZone(params.get('tz')) ? params.get('tz')! : 'UTC';
  const taskingMinDate =
    selectedCategory === 'tasking' ? todayInTimeZone(captureTimeZone) : undefined;
  const dateStart = params.get('start') || base.dateStart;
  const dateEnd = params.get('end') || base.dateEnd;
  const normalizedStart =
    taskingMinDate && dateStart && dateStart < taskingMinDate ? taskingMinDate : dateStart;
  const normalizedEnd =
    taskingMinDate && dateEnd && dateEnd < taskingMinDate ? taskingMinDate : dateEnd;
  return {
    ...base,
    dataTypes: parseListParam(params.get('dt'), FILTER_DATA_TYPES),
    categories: parseListParam(params.get('ptype'), FILTER_CATEGORIES).slice(0, 1),
    processingLevels: parseListParam(params.get('pl'), FILTER_PROCESSING_LEVELS),
    dateStart: normalizedStart,
    dateEnd:
      normalizedStart && normalizedEnd && normalizedEnd < normalizedStart
        ? normalizedStart
        : normalizedEnd,
    captureTimeZone,
    resMode: resolutionIsCustom ? 'range' : 'preset',
    resMax: resolutionIsCustom ? 'all' : presetResolution,
    resMaxCustom: resolutionIsCustom ? parseBoundedNumber(params.get('rmax'), 0, 100) : undefined,
    cloudMax: parseBoundedNumber(params.get('cloud'), 0, 100) ?? base.cloudMax,
    offNadirMax: parseBoundedNumber(params.get('angle'), 0, 60) ?? base.offNadirMax,
    deliveryMode,
    deliveryMaxDays: [7, 14, 30].includes(Number(params.get('days')))
      ? Number(params.get('days'))
      : undefined,
    analysisService: FILTER_SERVICES.includes(service as ValueAddedService)
      ? (service as ValueAddedService)
      : undefined,
  };
}

function syncFilterParams(params: URLSearchParams, filters: Filters) {
  const next = new URLSearchParams(params);
  FILTER_URL_KEYS.forEach((key) => next.delete(key));
  if (filters.categories[0]) next.set('ptype', filters.categories[0]);
  if (filters.dataTypes.length) next.set('dt', filters.dataTypes.join(','));
  if (filters.processingLevels.length) next.set('pl', filters.processingLevels.join(','));
  if (filters.dateStart) next.set('start', filters.dateStart);
  if (filters.dateEnd) next.set('end', filters.dateEnd);
  if (filters.categories[0] === 'tasking') next.set('tz', filters.captureTimeZone ?? 'UTC');
  if (filters.resMode === 'range') {
    next.set('res', 'custom');
    if (filters.resMaxCustom != null) next.set('rmax', String(filters.resMaxCustom));
  } else if (filters.resMax !== 'all') {
    next.set('res', filters.resMax);
  }
  if (filters.cloudMax < 100) next.set('cloud', String(filters.cloudMax));
  if (filters.offNadirMax < 60) next.set('angle', String(filters.offNadirMax));
  if (filters.deliveryMode && filters.deliveryMode !== 'all')
    next.set('delivery', filters.deliveryMode);
  if (filters.deliveryMaxDays != null) next.set('days', String(filters.deliveryMaxDays));
  if (filters.analysisService) next.set('service', filters.analysisService);
  return next;
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
  if (filters.dateStart || filters.dateEnd) {
    const first = filters.dateStart || filters.dateEnd!;
    const second = filters.dateEnd || filters.dateStart!;
    const [start, end] = first <= second ? [first, second] : [second, first];
    return `${start}T00:00:00Z/${end}T23:59:59Z`;
  }
  return undefined;
}

export function Explore() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const { setDraft } = useInquiryDraft();
  const { addToCart } = useCart();
  const [params, setSearchParams] = useSearchParams();
  const queryParam = params.get('q');
  const categoryParam = params.get('category');
  const filterParamKey = FILTER_URL_KEYS.map((key) => `${key}=${params.get(key) ?? ''}`).join('&');
  // Administrative labels follow the active site language. The service layer
  // applies a deterministic translation/fallback policy for every locale.
  const adminLang = lang;

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
  const [boundary, setBoundary] = useState<GeoJSON.Feature<
    GeoJSON.Polygon | GeoJSON.MultiPolygon
  > | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [drawingMode, setDrawingMode] = useState<'rectangle' | 'polygon'>('rectangle');
  const initialFilters = filtersFromSearchParams(params, categoryParam);
  const [draftFilters, setDraftFilters] = useState<Filters>(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(initialFilters);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [focus, setFocus] = useState<{
    center: [number, number];
    zoom: number;
    key: number;
  } | null>(null);
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
  const filters = appliedFilters;

  function cloneFilters(value: Filters): Filters {
    return {
      ...value,
      dataTypes: [...value.dataTypes],
      categories: [...value.categories],
      processingLevels: [...value.processingLevels],
    };
  }

  function applyFilters() {
    const next = cloneFilters(draftFilters);
    setDraftFilters(next);
    setAppliedFilters(next);
    setSearchParams(syncFilterParams(params, next), { replace: true });
  }

  function resetFilters() {
    const next = filtersForCategory(categoryParam);
    setDraftFilters(next);
    setAppliedFilters(cloneFilters(next));
    setSearchParams(syncFilterParams(params, next), { replace: true });
  }

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
    return () => {
      cancelled = true;
    };
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

  // Do not leave labels from the previous locale visible while the new
  // language-specific directory requests are in flight. Keep the selected
  // IDs, then refresh the selected boundary so its search label changes too.
  useEffect(() => {
    setGlobalCountries([]);
    setGlobalStates([]);
    setGlobalCities([]);
    setGlobalDistricts([]);
    if (adminLevel3) void focusAdminArea(adminLevel3, 3);
    else if (adminLevel2) void focusAdminArea(adminLevel2, 2);
    else if (adminLevel1) void focusAdminArea(adminLevel1, 1);
    else if (adminCountry) void focusAdminArea(adminCountry, 0);
    // The selected IDs are intentionally stable across a locale switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminLang]);

  // Home category cards carry a filter intent in the URL so deep links and
  // refreshes open the same product view instead of an unfiltered explorer.
  useEffect(() => {
    const next = filtersFromSearchParams(params, categoryParam);
    setDraftFilters(next);
    setAppliedFilters(cloneFilters(next));
  }, [categoryParam, filterParamKey]);

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
      toast.error(
        lang === 'zh'
          ? '未找到该地点，请输入城市、行政区或经纬度'
          : 'Place not found. Enter a city, administrative area, or coordinates.',
      );
    }
  }

  async function focusAdminArea(id: string, level: 0 | 1 | 2 | 3) {
    const requestId = ++adminGeoRequestRef.current;
    const area = await getGlobalAdminArea(id, adminLang).catch(() => null);
    if (requestId !== adminGeoRequestRef.current || !area) return;
    if (!Number.isFinite(area.lat) || !Number.isFinite(area.lon)) {
      toast.error(
        lang === 'zh'
          ? '该行政区缺少可用边界数据'
          : 'This administrative area has no usable boundary data.',
      );
      return;
    }
    const bbox = area.bbox ?? pointSearchBbox([area.lon, area.lat]);
    focusKey.current += 1;
    setRegionId(null);
    setSearch(area.name);
    setBoundary(area.boundary ?? null);
    setAoi(bbox);
    setFocus({
      center: [area.lon, area.lat],
      zoom: area.boundary ? [3, 5, 7, 9][level] : 10,
      key: focusKey.current,
    });
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
      if (bbox[2] - bbox[0] < 0.0001 || bbox[3] - bbox[1] < 0.0001)
        throw new Error('Vector extent is too small');
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
      setFocus({
        center: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2],
        zoom: 10,
        key: focusKey.current,
      });
      toast.success(lang === 'zh' ? `已加载 ${file.name}` : `${file.name} loaded`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : lang === 'zh'
            ? '矢量文件解析失败'
            : 'Could not read vector file',
      );
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function renderAreaSelector() {
    const selectedGlobalCountry = globalCountries.find((country) => country.id === adminCountry);
    const selectedLevel1 = globalStates.find((state) => state.id === adminLevel1);
    return (
      <div className="mt-3 space-y-3 border-t border-border pt-3">
        <div className="flex items-center gap-1 rounded-md border border-border bg-input-background p-1">
          <button
            type="button"
            className={`flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded px-2 text-xs transition-colors ${selectionMode === 'admin' && areaSelectorOpen ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
            onClick={() => {
              const wasAdmin = selectionMode === 'admin';
              setSelectionMode('admin');
              setAreaSelectorOpen((open) => (wasAdmin ? !open : true));
            }}
            aria-expanded={selectionMode === 'admin' ? areaSelectorOpen : false}
          >
            <MapPinned className="size-3.5 shrink-0" />
            <span>{t.explore.areaSelection}</span>
            <ChevronDown
              className={`size-3 shrink-0 transition-transform ${selectionMode === 'admin' && areaSelectorOpen ? 'rotate-180' : ''}`}
            />
          </button>
          <button
            type="button"
            className={`flex size-9 shrink-0 items-center justify-center rounded transition-colors ${selectionMode === 'vector' && areaSelectorOpen ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
            onClick={() => {
              setSelectionMode('vector');
              setAreaSelectorOpen((open) => selectionMode !== 'vector' || !open);
            }}
            title={t.explore.uploadVector}
            aria-label={t.explore.uploadVector}
            aria-expanded={selectionMode === 'vector' ? areaSelectorOpen : false}
          >
            <Upload className="size-3.5" />
          </button>
        </div>
        {selectionMode === 'admin' && areaSelectorOpen && (
          <div className="space-y-2">
            <label className="block space-y-1">
              <span className="flex items-center justify-between">
                <span className="tech-label text-[9px] text-muted-foreground">
                  {t.explore.country}
                </span>
                {adminCountry && (
                  <button
                    type="button"
                    aria-label={lang === 'zh' ? '清除国家或地区' : 'Clear country or region'}
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={(event) => {
                      event.preventDefault();
                      clearAdminCountry();
                    }}
                  >
                    <X className="size-3" />
                  </button>
                )}
              </span>
              <div className="relative">
                <select
                  value={adminCountry}
                  onChange={(event) => {
                    if (!event.target.value) {
                      clearAdminCountry();
                      return;
                    }
                    selectGlobalCountry(event.target.value);
                  }}
                  className="h-8 w-full appearance-none rounded-md border border-border bg-input-background py-0 pl-2 pr-8 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">{t.explore.countryPlaceholder}</option>
                  {globalCountries.map((country) => (
                    <option key={country.id} value={country.id}>
                      {countryLabel(country)}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  aria-hidden="true"
                  className="pointer-events-none absolute right-2.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground"
                />
              </div>
            </label>
            {adminCountry && (
              <label className="block space-y-1">
                <span className="flex items-center justify-between">
                  <span className="tech-label text-[9px] text-muted-foreground">
                    {t.explore.adminLevel1}
                  </span>
                  {adminLevel1 && (
                    <button
                      type="button"
                      aria-label={lang === 'zh' ? '清除一级行政区' : 'Clear first-level area'}
                      className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={(event) => {
                        event.preventDefault();
                        clearAdminLevel1();
                      }}
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </span>
                <div className="relative">
                  <select
                    value={adminLevel1}
                    disabled={!selectedGlobalCountry}
                    onChange={(event) => {
                      if (!event.target.value) {
                        clearAdminLevel1();
                        return;
                      }
                      void selectGlobalState(event.target.value);
                    }}
                    className="h-8 w-full appearance-none rounded-md border border-border bg-input-background py-0 pl-2 pr-8 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">{t.explore.adminLevel1Placeholder}</option>
                    {globalStates.map((area) => (
                      <option key={area.id} value={area.id}>
                        {stateLabel(area)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    aria-hidden="true"
                    className="pointer-events-none absolute right-2.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground"
                  />
                </div>
              </label>
            )}
            {adminCountry && adminLevel1 && (
              <label className="block space-y-1">
                <span className="flex items-center justify-between">
                  <span className="tech-label text-[9px] text-muted-foreground">
                    {t.explore.adminLevel2}
                  </span>
                  {adminLevel2 && (
                    <button
                      type="button"
                      aria-label={lang === 'zh' ? '清除二级行政区' : 'Clear second-level area'}
                      className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={(event) => {
                        event.preventDefault();
                        clearAdminLevel2();
                      }}
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </span>
                <div className="relative">
                  <select
                    value={adminLevel2}
                    disabled={!selectedLevel1}
                    onChange={(event) => {
                      if (!event.target.value) {
                        clearAdminLevel2();
                        return;
                      }
                      setAdminLevel2(event.target.value);
                      setAdminLevel3('');
                      setGlobalDistricts([]);
                      const city = globalCities.find((item) => item.id === event.target.value);
                      if (city) void selectGlobalCity(city);
                    }}
                    className="h-8 w-full appearance-none rounded-md border border-border bg-input-background py-0 pl-2 pr-8 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">
                      {adminLoading
                        ? lang === 'zh'
                          ? '加载城市中…'
                          : 'Loading cities…'
                        : t.explore.adminLevel2Placeholder}
                    </option>
                    {globalCities.map((city) => (
                      <option key={city.id} value={city.id}>
                        {cityLabel(city)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    aria-hidden="true"
                    className="pointer-events-none absolute right-2.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground"
                  />
                </div>
              </label>
            )}
            {adminCountry &&
              adminLevel1 &&
              adminLevel2 &&
              (adminLoading || globalDistricts.length > 0) && (
                <label className="block space-y-1">
                  <span className="flex items-center justify-between">
                    <span className="tech-label text-[9px] text-muted-foreground">
                      {t.explore.adminLevel3}
                    </span>
                    <button
                      type="button"
                      aria-label={lang === 'zh' ? '清除三级行政区' : 'Clear third-level area'}
                      title={lang === 'zh' ? '清除三级行政区' : 'Clear third-level area'}
                      className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={(event) => {
                        event.preventDefault();
                        clearAdminLevel3();
                      }}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                  <div className="relative">
                    <select
                      value={adminLevel3}
                      disabled={!adminLevel2}
                      onChange={(event) => {
                        if (!event.target.value) {
                          clearAdminLevel3();
                          return;
                        }
                        const district = globalDistricts.find(
                          (item) => item.id === event.target.value,
                        );
                        setAdminLevel3(event.target.value);
                        if (district) void selectGlobalCity(district, 'district');
                      }}
                      className="h-8 w-full appearance-none rounded-md border border-border bg-input-background py-0 pl-2 pr-8 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="">
                        {adminLoading
                          ? lang === 'zh'
                            ? '加载三级行政区中…'
                            : 'Loading third-level areas…'
                          : t.explore.adminLevel3Placeholder}
                      </option>
                      {globalDistricts.map((district) => (
                        <option key={district.id} value={district.id}>
                          {cityLabel(district)}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      aria-hidden="true"
                      className="pointer-events-none absolute right-2.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground"
                    />
                  </div>
                </label>
              )}
          </div>
        )}
        {selectionMode === 'vector' && areaSelectorOpen && (
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".kml,.kmz,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz"
              className="hidden"
              onChange={(event) => handleVectorFile(event.target.files?.[0])}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-full text-xs"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="size-3.5" />
              {vectorName || t.explore.uploadVectorHint}
            </Button>
            <p className="mt-1 text-[10px] text-muted-foreground">{t.explore.uploadVectorDesc}</p>
          </div>
        )}
      </div>
    );
  }

  // Query public Sentinel-2 STAC data for an explicit region/AOI.
  const remoteDatetime = datetimeForFilters(filters);
  const remoteCloudCoverMax = filters.cloudMax >= 100 ? undefined : filters.cloudMax;
  const remoteOffNadirMax = filters.offNadirMax >= 60 ? undefined : filters.offNadirMax;
  const canQueryArchiveSource =
    filters.categories.length === 0 || filters.categories.includes('archive');

  useEffect(() => {
    if (!remoteBbox || !canQueryArchiveSource) {
      setRemoteProducts(null);
      setRemoteError(false);
      setRemoteLoading(false);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    setRemoteLoading(true);
    setRemoteError(false);
    searchEarthSearch({
      bbox: remoteBbox,
      datetime: remoteDatetime,
      cloudCoverMax: remoteCloudCoverMax,
      offNadirMax: remoteOffNadirMax,
      limit: 80,
      signal: controller.signal,
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
      controller.abort();
    };
  }, [remoteBbox, remoteDatetime, remoteCloudCoverMax, remoteOffNadirMax, canQueryArchiveSource]);

  // Filtered results
  const sourceProducts = useMemo(() => {
    const catalog =
      catalogProducts && catalogProducts.length > 0
        ? catalogProducts
        : demoDataEnabled
          ? PRODUCTS
          : [];
    if (!remoteProducts) return catalog;
    const remoteIds = new Set(remoteProducts.map((product) => product.id));
    return [...remoteProducts, ...catalog.filter((product) => !remoteIds.has(product.id))];
  }, [catalogProducts, demoDataEnabled, remoteProducts]);
  const isRemote = remoteProducts !== null;
  const isDemoProducts =
    remoteProducts === null &&
    demoDataEnabled &&
    (!catalogProducts || catalogProducts.length === 0);
  const results = useMemo(() => {
    let list: Product[] = sourceProducts;
    if (isDemoProducts && regionId) list = list.filter((p) => p.regionId === regionId);
    if (aoi) list = list.filter((p) => intersects(aoi, p.bbox));
    if (filters.categories.length)
      list = list.filter((p) => filters.categories.includes(p.category));
    if (filters.processingLevels.length)
      list = list.filter((p) => filters.processingLevels.includes(p.processingLevel));
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

    if (filters.cloudMax < 100) list = list.filter((p) => p.cloudCover <= filters.cloudMax);
    if (filters.offNadirMax < 60)
      list = list.filter((p) => p.incidence == null || p.incidence <= filters.offNadirMax);
    if (filters.deliveryMode === 'instant') list = list.filter((p) => p.purchaseType === 'instant');
    if (filters.deliveryMode === 'inquiry') list = list.filter((p) => p.purchaseType === 'inquiry');
    if (filters.deliveryMaxDays !== undefined) {
      list = list.filter((p) => p.deliveryDays <= filters.deliveryMaxDays!);
    }
    if (filters.analysisService) {
      list = list.filter((p) => p.availableServices?.includes(filters.analysisService!));
    }

    // 时间筛选
    if (filters.categories[0] !== 'tasking' && (filters.dateStart || filters.dateEnd)) {
      const first = filters.dateStart || filters.dateEnd!;
      const second = filters.dateEnd || filters.dateStart!;
      const [startDate, endDate] = first <= second ? [first, second] : [second, first];
      const startTime = new Date(startDate).getTime();
      const endTime = new Date(endDate).getTime() + 86400000; // 包含结束日期当天
      list = list.filter((p) => {
        const captureTime = new Date(p.captureTime).getTime();
        return captureTime >= startTime && captureTime < endTime;
      });
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
      type: p.category === 'archive' ? 'history' : p.category,
      captureStart: filters.categories[0] === 'tasking' ? filters.dateStart : undefined,
      captureEnd: filters.categories[0] === 'tasking' ? filters.dateEnd : undefined,
      captureTimeZone: filters.captureTimeZone ?? 'UTC',
      aoiGeometry: boundary?.geometry ?? (aoi ? bboxToPolygon(aoi).geometry : undefined),
      productId: p.id,
      productName: lang === 'zh' ? p.productName : p.productNameEn,
      region: regionId
        ? lang === 'zh'
          ? REGIONS.find((r) => r.id === regionId)?.name
          : REGIONS.find((r) => r.id === regionId)?.nameEn
        : undefined,
      areaKm2: aoi ? Math.round(areaKm2) : p.area,
      refPrice:
        p.priceType === 'inquiry'
          ? 0
          : Math.round(Math.max(aoi ? areaKm2 : p.area, p.minArea) * p.unitPrice),
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
        <div className="min-h-0 flex-1">
          <FilterPanel
            filters={draftFilters}
            onChange={setDraftFilters}
            onApply={applyFilters}
            onReset={resetFilters}
            isQuerying={remoteLoading}
          />
        </div>
      </motion.aside>

      {/* Mobile Filter Sheet */}
      <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
        <SheetContent side="left" className="w-80 gap-0 p-0 pt-14">
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
          <div className="min-h-0 flex-1">
            <FilterPanel
              filters={draftFilters}
              onChange={setDraftFilters}
              onApply={() => {
                applyFilters();
                setFilterOpen(false);
              }}
              onReset={resetFilters}
              isQuerying={remoteLoading}
            />
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
          drawingMode={drawingMode}
          onDrawCancel={() => setDrawing(false)}
          focus={focus}
          onDraw={(b, polygon) => {
            setAoi(b);
            setBoundary(polygon ?? null);
            setRegionId(null);
            setVectorName('');
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
              variant={drawing && drawingMode === 'rectangle' ? 'default' : 'outline'}
              size="sm"
              className={
                drawing && drawingMode === 'rectangle'
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-card/90 backdrop-blur'
              }
              onClick={() => {
                setDrawing(!(drawing && drawingMode === 'rectangle'));
                setDrawingMode('rectangle');
              }}
              aria-label={t.explore.drawRect}
              aria-pressed={drawing && drawingMode === 'rectangle'}
            >
              <Square className="size-3.5" />
              <span className="hidden sm:inline">
                {drawing && drawingMode === 'rectangle' ? t.explore.drawing : t.explore.drawRect}
              </span>
            </Button>
            <Button
              size="sm"
              variant={drawing && drawingMode === 'polygon' ? 'default' : 'outline'}
              className={drawing && drawingMode === 'polygon' ? '' : 'bg-card/90 backdrop-blur'}
              aria-label={t.explore.drawPolygon}
              aria-pressed={drawing && drawingMode === 'polygon'}
              onClick={() => {
                setDrawing(!(drawing && drawingMode === 'polygon'));
                setDrawingMode('polygon');
              }}
            >
              <Pentagon className="size-3.5" />
              <span className="hidden sm:inline">{t.explore.drawPolygon}</span>
            </Button>
            {aoi && (
              <Button
                variant="outline"
                size="sm"
                className="bg-card/90 backdrop-blur"
                onClick={() => {
                  setDrawing(false);
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
                {drawingMode === 'polygon' ? t.explore.polygonHint : t.explore.drawHint}
              </span>
            )}
          </div>
        </div>

        {/* AOI readout */}
        {aoi && (
          <div className="pointer-events-none absolute bottom-2 left-2 rounded-md border border-border bg-card/90 px-2 py-1.5 backdrop-blur sm:bottom-3 sm:left-3 sm:px-3 sm:py-2">
            <div className="tech-label text-[9px] text-muted-foreground sm:text-[10px]">
              {t.explore.targetArea}
            </div>
            <div className="font-mono text-base text-primary sm:text-lg">
              {fmtArea(areaKm2)}{' '}
              <span className="text-xs text-muted-foreground sm:text-sm">
                {lang === 'zh' ? 'km²' : 'km²'}
              </span>
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
              <span className="text-xs sm:text-sm">
                {t.explore.compare} ({compareIds.length}/3)
              </span>
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
            {catalogLoading && !remoteProducts && (
              <div className="mt-1 text-[10px] text-primary">
                {lang === 'zh' ? '正在加载已核验产品…' : 'Loading verified products…'}
              </div>
            )}
            {catalogError && !remoteProducts && !demoDataEnabled && (
              <div className="mt-1 text-[10px] text-warning">
                {lang === 'zh'
                  ? '产品目录暂不可用，请稍后重试'
                  : 'Product catalog is temporarily unavailable'}
              </div>
            )}
            {remoteLoading && (
              <div className="mt-1 text-[10px] text-primary">
                {lang === 'zh' ? '正在查询公开卫星数据…' : 'Querying open satellite data…'}
              </div>
            )}
            {remoteError && (
              <div className="mt-1 text-[10px] text-warning">
                {lang === 'zh'
                  ? demoDataEnabled
                    ? '公开数据源暂不可用，已回退示例数据'
                    : '公开数据源暂不可用'
                  : demoDataEnabled
                    ? 'Open source unavailable; showing demo data'
                    : 'Open source unavailable'}
              </div>
            )}
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
            <div className="pt-16 text-center text-sm text-muted-foreground">
              {t.common.noResults}
            </div>
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
                {catalogLoading && !remoteProducts && (
                  <div className="mt-1 text-[10px] text-primary">
                    {lang === 'zh' ? '正在加载已核验产品…' : 'Loading verified products…'}
                  </div>
                )}
                {catalogError && !remoteProducts && !demoDataEnabled && (
                  <div className="mt-1 text-[10px] text-warning">
                    {lang === 'zh'
                      ? '产品目录暂不可用，请稍后重试'
                      : 'Product catalog is temporarily unavailable'}
                  </div>
                )}
                {remoteLoading && (
                  <div className="mt-1 text-[10px] text-primary">
                    {lang === 'zh' ? '正在查询公开卫星数据…' : 'Querying open satellite data…'}
                  </div>
                )}
                {remoteError && (
                  <div className="mt-1 text-[10px] text-warning">
                    {lang === 'zh'
                      ? demoDataEnabled
                        ? '公开数据源暂不可用，已回退示例数据'
                        : '公开数据源暂不可用'
                      : demoDataEnabled
                        ? 'Open source unavailable; showing demo data'
                        : 'Open source unavailable'}
                  </div>
                )}
              </div>
              {!aoi && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Crosshair className="size-3" />
                  <span className="hidden sm:inline">
                    {lang === 'zh' ? '绘制区域看覆盖率' : 'Draw AOI'}
                  </span>
                </span>
              )}
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {results.length === 0 && (
                <div className="pt-16 text-center text-sm text-muted-foreground">
                  {t.common.noResults}
                </div>
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
