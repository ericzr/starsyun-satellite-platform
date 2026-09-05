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
const COUNTRY_CACHE_KEY = 'starsyun-admin-countries-v3';

function localizedName(area: AdminArea, lang: 'zh' | 'en') {
  if (lang === 'zh') {
    return area.nameLocal['zh-Hans'] || area.nameLocal.zh || area.nameLocal['name:zh'] || area.nameEn;
  }
  return area.nameLocal.en || area.nameEn;
}

function feature(geometry?: GeoJSON.Geometry) {
  return geometry && (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon')
    ? { type: 'Feature', properties: {}, geometry } as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>
    : undefined;
}

function cityFromArea(area: AdminArea, lang: 'zh' | 'en'): GlobalCity {
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
export async function fetchGlobalCountries(lang: 'zh' | 'en' = 'en'): Promise<GlobalCountry[]> {
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
    iso2: area.countryIso2 ?? '',
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

export async function fetchGlobalStates(countryIso3: string, lang: 'zh' | 'en' = 'en'): Promise<GlobalState[]> {
  const areas = await list({ country: countryIso3, level: 1, limit: 5000 });
  return areas.map((area) => ({ id: area.id, name: localizedName(area, lang) }));
}

export async function fetchGlobalCities(parentId: string, lang: 'zh' | 'en' = 'en'): Promise<GlobalCity[]> {
  const areas = await list({ parent: parentId, level: 2, limit: 5000 });
  return areas.map((area) => cityFromArea(area, lang));
}

export async function fetchGlobalDistricts(parentId: string, lang: 'zh' | 'en' = 'en'): Promise<GlobalCity[]> {
  const areas = await list({ parent: parentId, level: 3, limit: 5000 });
  return areas.map((area) => cityFromArea(area, lang));
}

/** Search the server-side ADM0-ADM3 directory without exposing database credentials. */
export async function searchGlobalAdminAreas(query: string, lang: 'zh' | 'en' = 'en'): Promise<GlobalCity[]> {
  const normalized = query.trim();
  if (normalized.length < 2) return [];
  const areas = await list({ q: normalized, limit: 30 });
  return areas.map((area) => cityFromArea(area, lang));
}

/** Fetches the selected versioned boundary only when it is needed for the map. */
export async function getGlobalAdminArea(id: string, lang: 'zh' | 'en' = 'en'): Promise<GlobalCity | null> {
  const payload = await request(`/${encodeURIComponent(id)}`);
  return payload.area ? cityFromArea(payload.area, lang) : null;
}
