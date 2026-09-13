import type { Lang } from '../i18n';
import countryIso2ByIso3 from '../data/country-iso2.json';

export interface GlobalState {
  id: string;
  name: string;
  stateCode?: string;
}

export interface GlobalCountry {
  id: string;
  name: string;
  iso2: string;
  iso3: string;
  states: GlobalState[];
}

export interface GlobalCity {
  id: string;
  name: string;
  displayName: string;
  lat: number;
  lon: number;
  bbox?: [number, number, number, number];
  boundary?: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
  level?: 0 | 1 | 2 | 3;
  parentId?: string;
  countryIso3?: string;
}

type AdminArea = {
  id: string;
  countryIso2?: string;
  countryIso3: string;
  level: 0 | 1 | 2 | 3;
  parentId?: string;
  nameEn: string;
  nameLocal: Record<string, string>;
  centroid?: [number, number];
  bbox?: [number, number, number, number];
  geometry?: GeoJSON.Geometry;
};

const API = '/api/admin/areas';
// Bump this whenever the serialized country labels or their fallback data
// changes. Older entries contain English labels produced while ISO2 was absent.
const COUNTRY_CACHE_KEY = 'starsyun-admin-countries-v5';

const LANGUAGE_NAME_KEYS: Record<Exclude<Lang, 'zh' | 'en'>, string[]> = {
  ar: ['ar', 'name:ar'],
  es: ['es', 'name:es'],
  fr: ['fr', 'name:fr'],
  pt: ['pt', 'name:pt'],
  ru: ['ru', 'name:ru'],
  ja: ['ja', 'name:ja'],
  ko: ['ko', 'name:ko'],
  de: ['de', 'name:de'],
};

const DISPLAY_NAME_LOCALES: Record<Lang, string> = {
  zh: 'zh-CN',
  en: 'en',
  ar: 'ar',
  es: 'es',
  fr: 'fr',
  pt: 'pt',
  ru: 'ru',
  ja: 'ja',
  ko: 'ko',
  de: 'de',
};

function isChinese(value: string | undefined) {
  return Boolean(value && /[\u3400-\u9fff]/u.test(value));
}

function sourceLocalName(area: AdminArea) {
  return area.nameLocal.local || area.nameLocal['name:local'] || undefined;
}

export function resolveCountryIso2(area: Pick<AdminArea, 'countryIso2' | 'countryIso3'>): string | undefined {
  const explicit = area.countryIso2?.trim().toUpperCase();
  if (explicit && /^[A-Z]{2}$/u.test(explicit)) return explicit;
  const mapped = countryIso2ByIso3[String(area.countryIso3 || '').trim().toUpperCase() as keyof typeof countryIso2ByIso3];
  return mapped || undefined;
}

function intlCountryName(area: AdminArea, lang: Lang) {
  const iso2 = resolveCountryIso2(area);
  if (area.level !== 0 || !iso2 || typeof Intl === 'undefined' || !('DisplayNames' in Intl)) return undefined;
  try {
    const displayNames = new Intl.DisplayNames([DISPLAY_NAME_LOCALES[lang]], { type: 'region' });
    return displayNames.of(iso2) || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolve one canonical display name for the current UI language.
 * `local` is source-language metadata, not a translation: using it for every
 * locale is what previously caused mixed Chinese/English (and other source
 * language) labels in the selector. When a translation is unavailable, use
 * the source-local label before the required English completeness fallback.
 */
export function localizedName(area: AdminArea, lang: Lang): string {
  if (lang === 'zh') {
    return area.nameLocal['zh-Hans']
      || area.nameLocal.zh
      || area.nameLocal['name:zh']
      || (isChinese(area.nameLocal.local) ? area.nameLocal.local : undefined)
      || intlCountryName(area, lang)
      || sourceLocalName(area)
      || area.nameEn;
  }
  if (lang === 'en') return area.nameLocal.en || area.nameLocal['name:en'] || intlCountryName(area, lang) || area.nameEn;
  for (const key of LANGUAGE_NAME_KEYS[lang]) {
    const value = area.nameLocal[key];
    if (value) return value;
  }
  return area.nameLocal.en
    || area.nameLocal['name:en']
    || intlCountryName(area, lang)
    || sourceLocalName(area)
    || area.nameEn;
}

function feature(geometry?: GeoJSON.Geometry) {
  return geometry && (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon')
    ? { type: 'Feature', properties: {}, geometry } as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>
    : undefined;
}

function cityFromArea(area: AdminArea, lang: Lang): GlobalCity {
  const [lon, lat] = area.centroid ?? [NaN, NaN];
  return {
    id: area.id,
    name: localizedName(area, lang),
    displayName: area.nameEn,
    lat,
    lon,
    bbox: area.bbox,
    boundary: feature(area.geometry),
    level: area.level,
    parentId: area.parentId,
    countryIso3: area.countryIso3,
  };
}

async function request(path = '') {
  const response = await fetch(`${API}${path}`, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Administrative directory unavailable (${response.status})`);
  return response.json() as Promise<{ areas?: AdminArea[]; area?: AdminArea }>;
}

async function list(params: Record<string, string | number>) {
  const query = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]));
  const payload = await request(`?${query.toString()}`);
  return payload.areas ?? [];
}

/** Country directory comes from the versioned platform dataset, never browser-side geocoders. */
export async function fetchGlobalCountries(lang: Lang = 'en'): Promise<GlobalCountry[]> {
  try {
    const cached = sessionStorage.getItem(`${COUNTRY_CACHE_KEY}:${lang}`);
    if (cached) return JSON.parse(cached) as GlobalCountry[];
  } catch {
    // Disabled storage should not stop the directory request.
  }
  const areas = await list({ level: 0, limit: 500 });
  const countries = areas.map((area) => ({
    id: area.id,
    name: localizedName(area, lang),
    iso2: resolveCountryIso2(area) ?? '',
    iso3: area.countryIso3,
    states: [],
  })).filter((country) => country.iso3 && country.iso3 !== 'TWN' && country.iso2 !== 'TW');
  try {
    sessionStorage.setItem(`${COUNTRY_CACHE_KEY}:${lang}`, JSON.stringify(countries));
  } catch {
    // Continue without a client cache.
  }
  return countries;
}

export async function fetchGlobalStates(countryIso3: string, lang: Lang = 'en'): Promise<GlobalState[]> {
  const areas = await list({ country: countryIso3, level: 1, limit: 5000 });
  return areas.map((area) => ({ id: area.id, name: localizedName(area, lang) }));
}

export async function fetchGlobalCities(parentId: string, lang: Lang = 'en'): Promise<GlobalCity[]> {
  const areas = await list({ parent: parentId, level: 2, limit: 5000 });
  return areas.map((area) => cityFromArea(area, lang));
}

export async function fetchGlobalDistricts(parentId: string, lang: Lang = 'en'): Promise<GlobalCity[]> {
  const areas = await list({ parent: parentId, level: 3, limit: 5000 });
  return areas.map((area) => cityFromArea(area, lang));
}

/** Search the server-side ADM0-ADM3 directory without exposing database credentials. */
export async function searchGlobalAdminAreas(query: string, lang: Lang = 'en'): Promise<GlobalCity[]> {
  const normalized = query.trim();
  if (normalized.length < 2) return [];
  const areas = await list({ q: normalized, limit: 30 });
  return areas.map((area) => cityFromArea(area, lang));
}

/** Fetches the selected versioned boundary only when it is needed for the map. */
export async function getGlobalAdminArea(id: string, lang: Lang = 'en'): Promise<GlobalCity | null> {
  const payload = await request(`/${encodeURIComponent(id)}`);
  return payload.area ? cityFromArea(payload.area, lang) : null;
}
