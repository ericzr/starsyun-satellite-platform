import { useEffect, useRef, useState } from 'react';
import type * as ML from 'maplibre-gl';
import { Layers } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useI18n, type Lang } from '../i18n';
import type { BBox } from '../lib/geo';
import { bboxToPolygon } from '../lib/geo';

type MlMap = ML.Map;
type LngLatBoundsLike = ML.LngLatBoundsLike;

const MAPLIBRE_VERSION = '4.7.1';
const CDN_JS = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.js`;
const CDN_CSS = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css`;

// Load MapLibre GL from a CDN at runtime so it never enters Vite's dependency
// optimizer (which chokes on the library's web worker). Resolves to the global
// `maplibregl` namespace.
let maplibrePromise: Promise<typeof ML> | null = null;
function loadMapLibre(): Promise<typeof ML> {
  if (typeof window !== 'undefined' && (window as any).maplibregl) {
    return Promise.resolve((window as any).maplibregl as typeof ML);
  }
  if (maplibrePromise) return maplibrePromise;
  maplibrePromise = new Promise<typeof ML>((resolve, reject) => {
    // CSS
    if (!document.querySelector(`link[data-maplibre]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = CDN_CSS;
      link.setAttribute('data-maplibre', '');
      document.head.appendChild(link);
    }
    // JS
    const existing = document.querySelector<HTMLScriptElement>(`script[data-maplibre]`);
    if (existing) {
      existing.addEventListener('load', () => resolve((window as any).maplibregl));
      existing.addEventListener('error', reject);
      return;
    }
    const script = document.createElement('script');
    script.src = CDN_JS;
    script.async = true;
    script.setAttribute('data-maplibre', '');
    script.onload = () => resolve((window as any).maplibregl as typeof ML);
    script.onerror = () => reject(new Error('Failed to load MapLibre GL'));
    document.head.appendChild(script);
  });
  return maplibrePromise;
}

const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OPENFREEMAP_STYLES = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};
const CARTO_KEY = (import.meta.env.VITE_CARTO_API_KEY as string | undefined)?.trim();
const CARTO_STYLE_URL = (import.meta.env.VITE_MAP_STYLE_URL as string | undefined)?.trim();

const OSM_STYLES: Record<'light' | 'dark', ML.StyleSpecification> = {
  light: {
    version: 8,
    sources: { osm: { type: 'raster', tiles: [OSM_TILES], tileSize: 256, attribution: '© OpenStreetMap contributors' } },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#e5e7eb' } },
      { id: 'osm', type: 'raster', source: 'osm', paint: { 'raster-opacity': 0.92, 'raster-fade-duration': 0 } },
    ],
  },
  dark: {
    version: 8,
    sources: { osm: { type: 'raster', tiles: [OSM_TILES], tileSize: 256, attribution: '© OpenStreetMap contributors' } },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#08090b' } },
      {
        id: 'osm', type: 'raster', source: 'osm',
        paint: {
          'raster-opacity': 0.78,
          'raster-saturation': -1,
          'raster-contrast': 0.25,
          'raster-brightness-min': 0.08,
          'raster-brightness-max': 0.48,
          'raster-fade-duration': 0,
        },
      },
    ],
  },
};

type BaseLayerMode = 'carto' | 'openfreemap' | 'osm';

function cartoStyleUrl(theme: 'light' | 'dark') {
  const configured = CARTO_STYLE_URL || `https://basemaps.cartocdn.com/gl/${theme === 'dark' ? 'dark-matter' : 'positron'}-gl-style/style.json`;
  if (!CARTO_KEY) return OPENFREEMAP_STYLES[theme];
  const url = configured.replace(/(dark-matter|positron)(?=-gl-style)/, theme === 'dark' ? 'dark-matter' : 'positron');
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}api_key=${encodeURIComponent(CARTO_KEY)}`;
}

function getBasemapStyle(mode: BaseLayerMode, theme: 'light' | 'dark'): ML.StyleSpecification | string {
  if (mode === 'osm') return OSM_STYLES[theme];
  if (mode === 'openfreemap') return OPENFREEMAP_STYLES[theme];
  return cartoStyleUrl(theme);
}

const NASA_LAYER_DATE = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const NASA_VIIRS_TILES = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${NASA_LAYER_DATE}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`;
// Public imagery mosaics. These are optional overlays and do not replace the
// selected monochrome basemap, so the explorer remains usable when an imagery
// provider is unavailable.
const SENTINEL2_TILES = (import.meta.env.VITE_SENTINEL2_TILES_URL as string | undefined)?.trim()
  || 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg';
const ESRI_IMAGERY_TILES = (import.meta.env.VITE_ESRI_IMAGERY_TILES_URL as string | undefined)?.trim()
  || 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const AICGIS_TILES = (import.meta.env.VITE_AICGIS_TILES_URL as string | undefined)?.trim();
const TIANDITU_TOKEN = (import.meta.env.VITE_TIANDITU_TOKEN as string | undefined)?.trim();
const TIANDITU_TILES = TIANDITU_TOKEN
  ? `https://t{s}.tianditu.gov.cn/DataServer?T=vec_w&x={x}&y={y}&l={z}&tk=${encodeURIComponent(TIANDITU_TOKEN)}`
  : undefined;

type SatelliteLayerMode = 'none' | 'nasa' | 'sentinel2' | 'esri' | 'aicgis' | 'tianditu';

export interface Footprint {
  id: string;
  bbox: BBox;
}

interface MapCanvasProps {
  center?: [number, number];
  zoom?: number;
  interactive?: boolean;
  className?: string;
  aoi?: BBox | null;
  boundary?: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null;
  footprints?: Footprint[];
  highlightId?: string | null;
  drawing?: boolean;
  focus?: { center: [number, number]; zoom: number; key: number } | null;
  fitBBox?: BBox | null;
  onDraw?: (bbox: BBox) => void;
  onFootprintClick?: (id: string) => void;
  onFootprintHover?: (id: string | null) => void;
}

const ACCENT_DARK = '#ffffff';
const ACCENT_LIGHT = '#0a0a0b';

export function MapCanvas({
  center = [20, 25],
  zoom = 1.4,
  interactive = true,
  className,
  aoi = null,
  boundary = null,
  footprints = [],
  highlightId = null,
  drawing = false,
  focus = null,
  fitBBox = null,
  onDraw,
  onFootprintClick,
  onFootprintHover,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const readyRef = useRef(false);
  const { resolvedTheme } = useTheme();
  const { lang, t } = useI18n();
  const theme = resolvedTheme === 'light' ? 'light' : 'dark';
  const [baseLayerMode, setBaseLayerMode] = useState<BaseLayerMode>('carto');
  const [satelliteLayer, setSatelliteLayer] = useState<SatelliteLayerMode>('none');
  const [layerMenuOpen, setLayerMenuOpen] = useState(false);

  // keep latest props for event handlers
  const propsRef = useRef({ drawing, onDraw, onFootprintClick, onFootprintHover });
  propsRef.current = { drawing, onDraw, onFootprintClick, onFootprintHover };
  const focusRef = useRef(focus);
  focusRef.current = focus;

  const accent = theme === 'light' ? ACCENT_LIGHT : ACCENT_DARK;
  const accentRef = useRef(accent);
  accentRef.current = accent;
  const languageRef = useRef(lang);
  languageRef.current = lang;
  const baseLayerModeRef = useRef(baseLayerMode);
  baseLayerModeRef.current = baseLayerMode;
  const satelliteLayerRef = useRef<SatelliteLayerMode>(satelliteLayer);
  satelliteLayerRef.current = satelliteLayer;
  const activeLayerLabel = satelliteLayer === 'nasa' ? t.explore.mapSatelliteNasa
    : satelliteLayer === 'sentinel2' ? t.explore.mapSatelliteSentinel
      : satelliteLayer === 'esri' ? t.explore.mapSatelliteEsri
        : satelliteLayer === 'aicgis' ? t.explore.mapSatelliteAicgis
          : satelliteLayer === 'tianditu' ? t.explore.mapSatelliteTianditu
            : baseLayerMode === 'carto' ? t.explore.mapCartoLayer
              : baseLayerMode === 'openfreemap' ? t.explore.mapOpenFreeMapLayer : t.explore.mapOsmLayer;

  // Initialize map once.
  useEffect(() => {
    let cancelled = false;
    let map: MlMap | null = null;
    let ro: ResizeObserver | null = null;

    loadMapLibre().then((maplibregl) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      map = new maplibregl.Map({
        container: containerRef.current,
        style: getBasemapStyle(baseLayerModeRef.current, theme),
        center,
        zoom,
        interactive,
        attributionControl: false,
      });
      mapRef.current = map;
      // Ignore benign abort errors emitted when tiles/styles are cancelled
      // (e.g. on unmount or style swap).
      map.on('error', (ev: { error?: { name?: string } }) => {
        if (ev?.error?.name === 'AbortError') return;
      });
      if (interactive) {
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
      }
      map.on('load', () => {
        readyRef.current = true;
        ensureLayers(map!, accentRef.current);
        applyMapLanguage(map!, languageRef.current);
        pushData(map!);
        syncSatelliteLayer(map!, satelliteLayerRef.current);
        const initialFocus = focusRef.current;
        if (initialFocus) {
          map!.flyTo({ center: initialFocus.center, zoom: initialFocus.zoom, speed: 1.4, essential: true });
        }
      });
      map.on('styledata', () => {
        if (readyRef.current) {
          ensureLayers(map!, accentRef.current);
          applyMapLanguage(map!, languageRef.current);
          pushData(map!);
          syncSatelliteLayer(map!, satelliteLayerRef.current);
        }
      });
      bindDrawing(map);

      ro = new ResizeObserver(() => map && map.resize());
      ro.observe(containerRef.current);
    }).catch((err: unknown) => {
      // Swallow abort errors from teardown/HMR; surface anything unexpected.
      if (err && (err as { name?: string }).name === 'AbortError') return;
      // eslint-disable-next-line no-console
      console.error('MapCanvas init failed', err);
    });

    return () => {
      cancelled = true;
      ro?.disconnect();
      try {
        map?.remove();
      } catch {
        /* ignore abort errors during teardown */
      }
      mapRef.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep basemap labels in sync with the application's selected language.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    applyMapLanguage(map, lang);
  }, [lang]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    ensureLayers(map, accentRef.current);
    syncSatelliteLayer(map, satelliteLayer);
  }, [satelliteLayer]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    map.setStyle(getBasemapStyle(baseLayerMode, theme));
  }, [baseLayerMode, theme]);

  // Push overlay data when inputs change.
  const dataRef = useRef({ aoi, boundary, footprints, highlightId });
  dataRef.current = { aoi, boundary, footprints, highlightId };
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    pushData(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aoi, boundary, footprints, highlightId]);

  // Focus (fly to)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    map.flyTo({ center: focus.center, zoom: focus.zoom, speed: 1.4, essential: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.key]);

  // Fit to bbox
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fitBBox) return;
    const bounds: LngLatBoundsLike = [
      [fitBBox[0], fitBBox[1]],
      [fitBBox[2], fitBBox[3]],
    ];
    map.fitBounds(bounds, { padding: 80, maxZoom: 14, duration: 800 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitBBox]);

  // Toggle drag pan while drawing
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (drawing) {
      map.dragPan.disable();
      map.getCanvas().style.cursor = 'crosshair';
    } else {
      map.dragPan.enable();
      map.getCanvas().style.cursor = '';
    }
  }, [drawing]);

  function pushData(map: MlMap) {
    const { aoi, boundary, footprints, highlightId } = dataRef.current;
    const fpSrc = map.getSource('footprints') as ML.GeoJSONSource | undefined;
    if (fpSrc) {
      fpSrc.setData({
        type: 'FeatureCollection',
        features: footprints.map((f) => {
          const poly = bboxToPolygon(f.bbox);
          poly.properties = { id: f.id, active: f.id === highlightId ? 1 : 0 };
          return poly;
        }),
      });
    }
    const aoiSrc = map.getSource('aoi') as ML.GeoJSONSource | undefined;
    if (aoiSrc) {
      aoiSrc.setData(
        aoi && !boundary
          ? { type: 'FeatureCollection', features: [bboxToPolygon(aoi)] }
          : { type: 'FeatureCollection', features: [] },
      );
    }
    const boundarySrc = map.getSource('boundary') as ML.GeoJSONSource | undefined;
    boundarySrc?.setData(
      boundary
        ? { type: 'FeatureCollection', features: [boundary] }
        : { type: 'FeatureCollection', features: [] },
    );
  }

  function bindDrawing(map: MlMap) {
    let start: ML.LngLat | null = null;
    const getDraft = () => map.getSource('draft') as ML.GeoJSONSource | undefined;
    const normalizeLng = (lng: number) => ((lng + 180) % 360 + 360) % 360 - 180;
    const makeBBox = (a: ML.LngLat, b: ML.LngLat): BBox => {
      const west = normalizeLng(a.lng);
      const east = normalizeLng(b.lng);
      const direct = Math.abs(east - west);
      // Preserve the narrow rectangle if the drag crossed the date line.
      if (direct <= 180) {
        return [Math.min(west, east), Math.min(a.lat, b.lat), Math.max(west, east), Math.max(a.lat, b.lat)];
      }
      // Keep east > west in an unwrapped coordinate space (e.g. 179..181).
      const adjustedWest = west < east ? west + 360 : west;
      const adjustedEast = west < east ? east : east + 360;
      return [Math.min(adjustedWest, adjustedEast), Math.min(a.lat, b.lat), Math.max(adjustedWest, adjustedEast), Math.max(a.lat, b.lat)];
    };

    map.on('mousedown', (e) => {
      if (!propsRef.current.drawing) return;
      start = e.lngLat;
    });
    map.on('mousemove', (e) => {
      if (!propsRef.current.drawing || !start) return;
      const bbox = makeBBox(start, e.lngLat);
      getDraft()?.setData({ type: 'FeatureCollection', features: [bboxToPolygon(bbox)] });
    });
    map.on('mouseup', (e) => {
      if (!propsRef.current.drawing || !start) return;
      const bbox = makeBBox(start, e.lngLat);
      start = null;
      getDraft()?.setData({ type: 'FeatureCollection', features: [] });
      if (Math.abs(bbox[2] - bbox[0]) > 0.001 && Math.abs(bbox[3] - bbox[1]) > 0.001) {
        propsRef.current.onDraw?.(bbox);
      }
    });

    // hover / click on footprints
    map.on('mousemove', 'footprints-fill', (e) => {
      if (propsRef.current.drawing) return;
      map.getCanvas().style.cursor = 'pointer';
      const id = e.features?.[0]?.properties?.id;
      if (id) propsRef.current.onFootprintHover?.(String(id));
    });
    map.on('mouseleave', 'footprints-fill', () => {
      if (!propsRef.current.drawing) map.getCanvas().style.cursor = '';
      propsRef.current.onFootprintHover?.(null);
    });
    map.on('click', 'footprints-fill', (e) => {
      const id = e.features?.[0]?.properties?.id;
      if (id) propsRef.current.onFootprintClick?.(String(id));
    });
  }

  return (
    <div className={`map-theme-${theme} relative ${className ?? ''}`}>
      <div
        ref={containerRef}
        className="absolute inset-0 size-full"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />
      <div className="pointer-events-none absolute bottom-3 right-16 z-10">
        <div className="pointer-events-auto relative">
          <button
            type="button"
            aria-label={activeLayerLabel}
            title={t.explore.mapLayerSwitcher}
            aria-expanded={layerMenuOpen}
            onClick={() => setLayerMenuOpen((open) => !open)}
            className="flex h-9 items-center gap-1.5 rounded-md border border-border bg-card/95 px-2.5 text-xs text-foreground shadow-sm backdrop-blur transition-colors hover:bg-accent"
          >
            <Layers className="size-3.5" />
            <span className="hidden sm:inline">{activeLayerLabel}</span>
          </button>
          {layerMenuOpen && (
            <div className="absolute bottom-11 right-0 min-w-44 rounded-md border border-border bg-card/95 p-1.5 text-xs text-foreground shadow-lg backdrop-blur">
              <div className="px-2 pb-1 pt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{t.explore.mapBaseLayer}</div>
              <LayerOption label={t.explore.mapCartoLayer} active={baseLayerMode === 'carto' && satelliteLayer === 'none'} onClick={() => { setBaseLayerMode('carto'); setSatelliteLayer('none'); setLayerMenuOpen(false); }} />
              <LayerOption label={t.explore.mapOpenFreeMapLayer} active={baseLayerMode === 'openfreemap' && satelliteLayer === 'none'} onClick={() => { setBaseLayerMode('openfreemap'); setSatelliteLayer('none'); setLayerMenuOpen(false); }} />
              <LayerOption label={t.explore.mapOsmLayer} active={baseLayerMode === 'osm' && satelliteLayer === 'none'} onClick={() => { setBaseLayerMode('osm'); setSatelliteLayer('none'); setLayerMenuOpen(false); }} />
              <div className="mt-1 border-t border-border px-2 pb-1 pt-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">{t.explore.mapImagery}</div>
              <LayerOption label={t.explore.mapSatelliteNasa} active={satelliteLayer === 'nasa'} onClick={() => { setSatelliteLayer('nasa'); setLayerMenuOpen(false); }} />
              <LayerOption label={t.explore.mapSatelliteSentinel} active={satelliteLayer === 'sentinel2'} onClick={() => { setSatelliteLayer('sentinel2'); setLayerMenuOpen(false); }} />
              <LayerOption label={t.explore.mapSatelliteEsri} active={satelliteLayer === 'esri'} onClick={() => { setSatelliteLayer('esri'); setLayerMenuOpen(false); }} />
              <LayerOption label={t.explore.mapSatelliteAicgis} active={satelliteLayer === 'aicgis'} disabled={!AICGIS_TILES} onClick={() => { if (AICGIS_TILES) { setSatelliteLayer('aicgis'); setLayerMenuOpen(false); } }} />
              <LayerOption label={t.explore.mapSatelliteTianditu} active={satelliteLayer === 'tianditu'} disabled={!TIANDITU_TILES} onClick={() => { if (TIANDITU_TILES) { setSatelliteLayer('tianditu'); setLayerMenuOpen(false); } }} />
              <div className="mt-1 border-t border-border px-2 pb-1 pt-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">{t.explore.mapLicensedSources}</div>
              <LayerOption label={t.explore.mapGoogleEarth} disabled />
              <LayerOption label={t.explore.mapJilin1} disabled />
              <LayerOption label={t.explore.mapSiwei} disabled />
              <div className="px-2 py-1 text-[11px] text-muted-foreground">{t.explore.mapLicensedSourcesHint}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LayerOption({ label, active, onClick, disabled = false }: { label: string; active?: boolean; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`mt-0.5 flex w-full items-center justify-between rounded px-2 py-1.5 text-left ${disabled ? 'cursor-not-allowed text-muted-foreground/70' : 'hover:bg-accent'} ${active ? 'bg-accent' : ''}`}
    >
      <span>{label}</span>
      {active && <span aria-hidden="true">✓</span>}
    </button>
  );
}

const MAP_LANGUAGE_FIELDS: Record<Lang, string> = {
  zh: 'name:zh',
  en: 'name:en',
  ar: 'name:ar',
  es: 'name:es',
  fr: 'name:fr',
  pt: 'name:pt',
  ru: 'name:ru',
  ja: 'name:ja',
  ko: 'name:ko',
  de: 'name:de',
};

function applyMapLanguage(map: MlMap, lang: Lang) {
  const preferredField = MAP_LANGUAGE_FIELDS[lang] ?? 'name:en';
  const style = map.getStyle();
  for (const layer of style.layers ?? []) {
    if (layer.type !== 'symbol' || !layer.layout?.['text-field']) continue;
    const textField = JSON.stringify(layer.layout['text-field']);
    if (!textField.includes('name')) continue;
    map.setLayoutProperty(layer.id, 'text-field', [
      'coalesce',
      ['get', preferredField],
      ['get', 'name_en'],
      ['get', 'name'],
    ]);
  }
}

function ensureLayers(map: MlMap, accent: string) {
  // Footprints are contextual coverage previews, not the active AOI. Keep
  // them neutral and quiet so overlapping scenes do not overpower the map.
  const footprintColor = accent === ACCENT_DARK ? '#a3a3a3' : '#737373';
  const empty = { type: 'FeatureCollection', features: [] } as GeoJSON.FeatureCollection;
  if (!map.getSource('nasa-viirs')) {
    map.addSource('nasa-viirs', {
      type: 'raster',
      tiles: [NASA_VIIRS_TILES],
      tileSize: 256,
      maxzoom: 9,
      attribution: 'NASA GIBS / EOSDIS',
    });
  }
  if (!map.getSource('sentinel2')) {
    map.addSource('sentinel2', {
      type: 'raster',
      tiles: [SENTINEL2_TILES],
      tileSize: 256,
      maxzoom: 14,
      attribution: 'Sentinel-2 / EOX IT Services',
    });
  }
  if (!map.getSource('esri-imagery')) {
    map.addSource('esri-imagery', {
      type: 'raster',
      tiles: [ESRI_IMAGERY_TILES],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Esri World Imagery',
    });
  }
  if (AICGIS_TILES && !map.getSource('aicgis')) {
    map.addSource('aicgis', { type: 'raster', tiles: [AICGIS_TILES], tileSize: 256, maxzoom: 18, attribution: 'AICGIS' });
  }
  if (TIANDITU_TILES && !map.getSource('tianditu')) {
    map.addSource('tianditu', { type: 'raster', tiles: [TIANDITU_TILES], tileSize: 256, maxzoom: 18, attribution: '天地图' });
  }
  if (!map.getLayer('nasa-viirs-layer')) {
    map.addLayer({
      id: 'nasa-viirs-layer',
      type: 'raster',
      source: 'nasa-viirs',
      layout: { visibility: 'none' },
      paint: { 'raster-opacity': 0.78, 'raster-fade-duration': 0 },
    });
  }
  if (!map.getLayer('sentinel2-layer')) {
    map.addLayer({
      id: 'sentinel2-layer',
      type: 'raster',
      source: 'sentinel2',
      layout: { visibility: 'none' },
      paint: { 'raster-opacity': 0.82, 'raster-fade-duration': 0 },
    });
  }
  if (!map.getLayer('esri-imagery-layer')) {
    map.addLayer({
      id: 'esri-imagery-layer',
      type: 'raster',
      source: 'esri-imagery',
      layout: { visibility: 'none' },
      paint: { 'raster-opacity': 0.84, 'raster-fade-duration': 0 },
    });
  }
  if (AICGIS_TILES && !map.getLayer('aicgis-layer')) {
    map.addLayer({ id: 'aicgis-layer', type: 'raster', source: 'aicgis', layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.86, 'raster-fade-duration': 0 } });
  }
  if (TIANDITU_TILES && !map.getLayer('tianditu-layer')) {
    map.addLayer({ id: 'tianditu-layer', type: 'raster', source: 'tianditu', layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.86, 'raster-fade-duration': 0 } });
  }
  if (!map.getSource('footprints')) map.addSource('footprints', { type: 'geojson', data: empty });
  if (!map.getSource('aoi')) map.addSource('aoi', { type: 'geojson', data: empty });
  if (!map.getSource('boundary')) map.addSource('boundary', { type: 'geojson', data: empty });
  if (!map.getSource('draft')) map.addSource('draft', { type: 'geojson', data: empty });

  if (!map.getLayer('footprints-fill')) {
    map.addLayer({
      id: 'footprints-fill',
      type: 'fill',
      source: 'footprints',
      paint: {
        'fill-color': footprintColor,
        'fill-opacity': ['case', ['==', ['get', 'active'], 1], 0.1, 0.025],
      },
    });
  }
  if (!map.getLayer('footprints-line')) {
    map.addLayer({
      id: 'footprints-line',
      type: 'line',
      source: 'footprints',
      paint: {
        'line-color': footprintColor,
        'line-width': ['case', ['==', ['get', 'active'], 1], 1.25, 0.5],
        'line-opacity': ['case', ['==', ['get', 'active'], 1], 0.55, 0.16],
      },
    });
  }
  if (!map.getLayer('aoi-fill')) {
    map.addLayer({
      id: 'aoi-fill',
      type: 'fill',
      source: 'aoi',
      paint: { 'fill-color': accent, 'fill-opacity': 0.06 },
    });
  }
  if (!map.getLayer('boundary-fill')) {
    map.addLayer({
      id: 'boundary-fill',
      type: 'fill',
      source: 'boundary',
      paint: { 'fill-color': accent, 'fill-opacity': 0.035 },
    });
  }
  if (!map.getLayer('boundary-line')) {
    map.addLayer({
      id: 'boundary-line',
      type: 'line',
      source: 'boundary',
      paint: { 'line-color': accent, 'line-width': 2.2, 'line-opacity': 0.82 },
    });
  }
  if (!map.getLayer('aoi-line')) {
    map.addLayer({
      id: 'aoi-line',
      type: 'line',
      source: 'aoi',
      paint: { 'line-color': accent, 'line-width': 2, 'line-dasharray': [2, 1.5] },
    });
  }
  if (!map.getLayer('draft-fill')) {
    map.addLayer({
      id: 'draft-fill',
      type: 'fill',
      source: 'draft',
      paint: { 'fill-color': accent, 'fill-opacity': 0.12 },
    });
  }
  if (!map.getLayer('draft-line')) {
    map.addLayer({
      id: 'draft-line',
      type: 'line',
      source: 'draft',
      paint: { 'line-color': accent, 'line-width': 1.5, 'line-dasharray': [1, 1] },
    });
  }
}

function syncSatelliteLayer(map: MlMap, mode: SatelliteLayerMode) {
  const layers: Record<Exclude<SatelliteLayerMode, 'none'>, string> = {
    nasa: 'nasa-viirs-layer',
    sentinel2: 'sentinel2-layer',
    esri: 'esri-imagery-layer',
    aicgis: 'aicgis-layer',
    tianditu: 'tianditu-layer',
  };
  for (const [key, layerId] of Object.entries(layers) as [Exclude<SatelliteLayerMode, 'none'>, string][]) {
    if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', key === mode ? 'visible' : 'none');
  }
}
