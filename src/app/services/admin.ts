export interface GlobalState {
  name: string;
  stateCode?: string;
}

export interface GlobalCountry {
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
}

const COUNTRIES_URL = 'https://countriesnow.space/api/v0.1/countries/states';
const CITIES_URL = 'https://countriesnow.space/api/v0.1/countries/state/cities/q';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const COUNTRIES_CACHE_KEY = 'starsyun-admin-countries-v2';

function normalizePlaceName(value: string) {
  return value
    .trim()
    .replace(/[\u2018\u2019']/g, '')
    .replace(/\s+(city|shi|municipality|district|county|prefecture|region)$/i, '')
    .replace(/(市|区|县|州|省|自治区|特别行政区)$/u, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function placeKey(value: string) {
  return normalizePlaceName(value).replace(/\s+/g, '');
}

function dedupePlaces(names: string[], country: string, state: string) {
  const seen = new Set<string>();
  const stateKey = placeKey(state);
  const countryKey = placeKey(country);
  return names
    .map((name) => name.trim())
    .filter(Boolean)
    .filter((name) => {
      const key = placeKey(name);
      if (!key || key === stateKey || key === countryKey || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10000);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

/** Loads the global country and first-level administrative directory once per browser session. */
export async function fetchGlobalCountries(): Promise<GlobalCountry[]> {
  try {
    const cached = sessionStorage.getItem(COUNTRIES_CACHE_KEY);
    if (cached) return JSON.parse(cached) as GlobalCountry[];
  } catch {
    // Storage can be disabled; continue with the network request.
  }
  const response = await fetchWithTimeout(COUNTRIES_URL, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Administrative directory unavailable (${response.status})`);
  const payload = await response.json() as { error: boolean; data?: Array<{ name: string; iso2: string; iso3: string; states?: GlobalState[] }> };
  if (payload.error || !payload.data) throw new Error('Administrative directory returned an error');
  const countries = payload.data.filter((country) => country.iso2 !== 'TW' && country.name.toLowerCase() !== 'taiwan').map((country) => ({
    name: country.name,
    iso2: country.iso2,
    iso3: country.iso3,
    states: country.states?.length ? country.states : [{ name: country.name }],
  }));
  try {
    sessionStorage.setItem(COUNTRIES_CACHE_KEY, JSON.stringify(countries));
  } catch {
    // Storage can be disabled or quota-limited; the in-memory result is still valid.
  }
  return countries;
}

/** Resolves second-level places for a selected state using OpenStreetMap's public geocoder. */
export async function fetchGlobalCities(country: string, state: string, lang: 'zh' | 'en' = 'en'): Promise<GlobalCity[]> {
  // CountriesNow is fast and has broad global coverage. Use it as the
  // directory source; resolve a selected item through Nominatim later for a
  // localized name, exact center and boundary geometry.
  try {
    if (lang === 'zh') throw new Error('prefer localized geocoder');
    const query = new URLSearchParams({ country, state });
    const response = await fetchWithTimeout(`${CITIES_URL}?${query.toString()}`, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('CountriesNow unavailable');
    const payload = await response.json() as { error: boolean; data?: string[] };
    if (!payload.error && payload.data?.length) {
      return dedupePlaces(payload.data, country, state).map((name) => ({ id: `${country}:${state}:${name}`, name, displayName: name, lat: 0, lon: 0 }));
    }
  } catch {
    // Try the geocoder below when the directory endpoint is unavailable.
  }

  // Nominatim provides localized names and stable place IDs. Prefer it so the
  // second-level directory follows the site's language and does not expose
  // duplicate suffix variants such as "Ordos" / "Ordos Shi".
  try {
    const query = new URLSearchParams({
      format: 'jsonv2', addressdetails: '1', namedetails: '1', limit: '50',
      country, state, featuretype: 'city',
      'accept-language': lang === 'zh' ? 'zh-CN,en' : 'en',
    });
    const response = await fetchWithTimeout(`${NOMINATIM_URL}?${query.toString()}`, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Nominatim unavailable');
    const payload = await response.json() as Array<{
      place_id: number; display_name: string; name?: string; namedetails?: Record<string, string>;
      lat: string; lon: string; boundingbox?: string[]; type?: string;
    }>;
    const seen = new Set<string>();
    const cities = payload.map((place) => {
      const name = lang === 'zh'
        ? place.namedetails?.['name:zh'] || place.namedetails?.['name:zh-Hans'] || place.name || place.display_name.split(',')[0]
        : place.name || place.display_name.split(',')[0];
      const box = place.boundingbox?.map(Number);
      return {
        id: String(place.place_id), name, displayName: place.display_name,
        lat: Number(place.lat), lon: Number(place.lon),
        administrativeType: place.type,
        bbox: box && box.length === 4 ? [box[2], box[0], box[3], box[1]] as [number, number, number, number] : undefined,
    };
    }).filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lon) && !['administrative', 'state', 'province', 'region', 'country'].includes(place.administrativeType ?? '')).filter((place) => {
      const key = placeKey(place.name);
      if (!key || seen.has(key) || key === placeKey(state) || key === placeKey(country)) return false;
      seen.add(key);
      return true;
    });
    if (cities.length) return cities;
    throw new Error('Nominatim returned no cities');
  } catch {
    // Fall through to CountriesNow for countries/states not indexed by OSM.
  }
  const query = new URLSearchParams({ country, state });
  const response = await fetchWithTimeout(`${CITIES_URL}?${query.toString()}`, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`City directory unavailable (${response.status})`);
  const payload = await response.json() as { error: boolean; data?: string[] };
  if (payload.error || !payload.data?.length) throw new Error('City directory returned no cities');
  return dedupePlaces(payload.data, country, state).map((name) => ({ id: `${country}:${state}:${name}`, name, displayName: name, lat: 0, lon: 0 }));
}

/** Resolves third-level districts for a selected city/state path via Nominatim. */
export async function fetchGlobalDistricts(country: string, state: string, city: string, lang: 'zh' | 'en' = 'en'): Promise<GlobalCity[]> {
  const query = new URLSearchParams({
    format: 'jsonv2', addressdetails: '1', namedetails: '1', limit: '50',
    q: `${city}, ${state}, ${country}`,
    'accept-language': lang === 'zh' ? 'zh-CN,en' : 'en',
  });
  const response = await fetchWithTimeout(`${NOMINATIM_URL}?${query.toString()}`, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('District directory unavailable');
  const payload = await response.json() as Array<{
    place_id: number; display_name: string; name?: string; namedetails?: Record<string, string>;
    lat: string; lon: string; boundingbox?: string[]; type?: string;
  }>;
  const accepted = new Set(['district', 'suburb', 'quarter', 'municipality', 'county', 'town', 'village', 'borough']);
  const seen = new Set<string>();
  return payload.map((place) => {
    const name = lang === 'zh'
      ? place.namedetails?.['name:zh'] || place.namedetails?.['name:zh-Hans'] || place.name || place.display_name.split(',')[0]
      : place.name || place.display_name.split(',')[0];
    const box = place.boundingbox?.map(Number);
    return {
      id: String(place.place_id), name, displayName: place.display_name, lat: Number(place.lat), lon: Number(place.lon),
      bbox: box && box.length === 4 ? [box[2], box[0], box[3], box[1]] as [number, number, number, number] : undefined,
      administrativeType: place.type,
    };
  }).filter((place) => accepted.has(place.administrativeType ?? '') && Number.isFinite(place.lat) && Number.isFinite(place.lon)).filter((place) => {
    const key = placeKey(place.name);
    if (!key || seen.has(key) || key === placeKey(city) || key === placeKey(state) || key === placeKey(country)) return false;
    seen.add(key);
    return true;
  });
}

/** Resolve a city from the directory only when the user selects it. */
export async function geocodeGlobalCity(country: string, state: string, city: string, lang: 'zh' | 'en' = 'en'): Promise<GlobalCity | null> {
  const query = new URLSearchParams({
    format: 'jsonv2',
    addressdetails: '1',
    namedetails: '1',
    polygon_geojson: '1',
    limit: '5',
    q: `${city}, ${state}, ${country}`,
    'accept-language': lang === 'zh' ? 'zh-CN,en' : 'en',
  });
  const response = await fetchWithTimeout(`${NOMINATIM_URL}?${query.toString()}`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) return null;
  const payload = await response.json() as Array<{
    place_id: number;
    display_name: string;
    name?: string;
    lat: string;
    lon: string;
    boundingbox?: string[];
    address?: Record<string, string>;
    geojson?: GeoJSON.Geometry;
  }>;
  const place = payload.find((candidate) => {
    const address = candidate.address as Record<string, string> | undefined;
    return address && (address.state || address.province || address.region);
  }) ?? payload[0];
  if (!place) return null;
  const box = place.boundingbox?.map(Number);
  const geometry = place.geojson && (place.geojson.type === 'Polygon' || place.geojson.type === 'MultiPolygon')
    ? { type: 'Feature', properties: {}, geometry: place.geojson } as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>
    : undefined;
  return {
    id: String(place.place_id),
    name: city,
    displayName: place.display_name,
    lat: Number(place.lat),
    lon: Number(place.lon),
    bbox: box && box.length === 4 ? [box[2], box[0], box[3], box[1]] as [number, number, number, number] : undefined,
    boundary: geometry,
  };
}

/** Resolve a first- or second-level administrative area with its real OSM boundary. */
export async function geocodeAdministrativeArea(
  country: string,
  area: string,
  lang: 'zh' | 'en' = 'en',
): Promise<GlobalCity | null> {
  const query = new URLSearchParams({
    format: 'jsonv2',
    addressdetails: '1',
    namedetails: '1',
    polygon_geojson: '1',
    limit: '8',
    q: `${area}, ${country}`,
    'accept-language': lang === 'zh' ? 'zh-CN,en' : 'en',
  });
  const response = await fetchWithTimeout(`${NOMINATIM_URL}?${query.toString()}`, { headers: { Accept: 'application/json' } });
  if (!response.ok) return null;
  const payload = await response.json() as Array<{
    place_id: number;
    display_name: string;
    name?: string;
    namedetails?: Record<string, string>;
    lat: string;
    lon: string;
    boundingbox?: string[];
    geojson?: GeoJSON.Geometry;
    type?: string;
    class?: string;
  }>;
  const place = payload.find((item) => item.geojson && (item.geojson.type === 'Polygon' || item.geojson.type === 'MultiPolygon')) ?? payload[0];
  if (!place) return null;
  const box = place.boundingbox?.map(Number);
  const geometry = place.geojson && (place.geojson.type === 'Polygon' || place.geojson.type === 'MultiPolygon')
    ? { type: 'Feature', properties: {}, geometry: place.geojson } as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>
    : undefined;
  return {
    id: String(place.place_id),
    name: lang === 'zh' ? place.namedetails?.['name:zh'] || place.name || area : place.name || area,
    displayName: place.display_name,
    lat: Number(place.lat),
    lon: Number(place.lon),
    bbox: box && box.length === 4 ? [box[2], box[0], box[3], box[1]] as [number, number, number, number] : undefined,
    boundary: geometry,
  };
}
