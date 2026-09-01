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

const STYLES = {
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
};

const NASA_LAYER_DATE = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const NASA_VIIRS_TILES = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${NASA_LAYER_DATE}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`;

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
  const [layerMode, setLayerMode] = useState<'base' | 'satellite'>('base');
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
  const layerModeRef = useRef(layerMode);
  layerModeRef.current = layerMode;

  // Initialize map once.
  useEffect(() => {
    let cancelled = false;
    let map: MlMap | null = null;
    let ro: ResizeObserver | null = null;

    loadMapLibre().then((maplibregl) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      map = new maplibregl.Map({
        container: containerRef.current,
        style: STYLES[theme],
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
        syncLayerVisibility(map!, layerModeRef.current);
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
          syncLayerVisibility(map!, layerModeRef.current);
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

  // Theme change → swap basemap style.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    map.setStyle(STYLES[theme]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

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
    syncLayerVisibility(map, layerMode);
  }, [layerMode]);

  // Push overlay data when inputs change.
  const dataRef = useRef({ aoi, footprints, highlightId });
  dataRef.current = { aoi, footprints, highlightId };
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    pushData(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aoi, footprints, highlightId]);

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
    const { aoi, footprints, highlightId } = dataRef.current;
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
        aoi
          ? { type: 'FeatureCollection', features: [bboxToPolygon(aoi)] }
          : { type: 'FeatureCollection', features: [] },
      );
    }
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
    <div className={`relative ${className ?? ''}`}>
      <div
        ref={containerRef}
        className="absolute inset-0 size-full"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />
      <div className="pointer-events-none absolute bottom-3 right-16 z-10">
        <div className="pointer-events-auto relative">
          <button
            type="button"
            aria-label={t.explore.mapLayerSwitcher}
            title={t.explore.mapLayerSwitcher}
            aria-expanded={layerMenuOpen}
            onClick={() => setLayerMenuOpen((open) => !open)}
            className="flex h-9 items-center gap-1.5 rounded-md border border-border bg-card/95 px-2.5 text-xs text-foreground shadow-sm backdrop-blur transition-colors hover:bg-accent"
          >
            <Layers className="size-3.5" />
            <span className="hidden sm:inline">{t.explore.mapLayerSwitcher}</span>
          </button>
          {layerMenuOpen && (
            <div className="absolute bottom-11 right-0 min-w-44 rounded-md border border-border bg-card/95 p-1.5 text-xs text-foreground shadow-lg backdrop-blur">
              <button
                type="button"
                onClick={() => { setLayerMode('base'); setLayerMenuOpen(false); }}
                className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left hover:bg-accent ${layerMode === 'base' ? 'bg-accent' : ''}`}
              >
                <span>{t.explore.mapBaseLayer}</span>
                {layerMode === 'base' && <span aria-hidden="true">✓</span>}
              </button>
              <button
                type="button"
                onClick={() => { setLayerMode('satellite'); setLayerMenuOpen(false); }}
                className={`mt-0.5 flex w-full items-center justify-between rounded px-2 py-1.5 text-left hover:bg-accent ${layerMode === 'satellite' ? 'bg-accent' : ''}`}
              >
                <span>
                  {t.explore.mapSatelliteLayer}
                </span>
                {layerMode === 'satellite' && <span aria-hidden="true">✓</span>}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
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
  if (!map.getLayer('nasa-viirs-layer')) {
    map.addLayer({
      id: 'nasa-viirs-layer',
      type: 'raster',
      source: 'nasa-viirs',
      layout: { visibility: 'none' },
      paint: { 'raster-opacity': 0.78, 'raster-fade-duration': 0 },
    });
  }
  if (!map.getSource('footprints')) map.addSource('footprints', { type: 'geojson', data: empty });
  if (!map.getSource('aoi')) map.addSource('aoi', { type: 'geojson', data: empty });
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

function syncLayerVisibility(map: MlMap, mode: 'base' | 'satellite') {
  if (!map.getLayer('nasa-viirs-layer')) return;
  map.setLayoutProperty('nasa-viirs-layer', 'visibility', mode === 'satellite' ? 'visible' : 'none');
}
