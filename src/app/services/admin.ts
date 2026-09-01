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
}

const COUNTRIES_URL = 'https://countriesnow.space/api/v0.1/countries/states';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const COUNTRIES_CACHE_KEY = 'starsyun-admin-countries-v1';

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
  const countries = payload.data.map((country) => ({
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
  const query = new URLSearchParams({
    format: 'jsonv2',
    addressdetails: '1',
    limit: '50',
    country,
    state,
    featuretype: 'city',
    namedetails: '1',
    'accept-language': lang === 'zh' ? 'zh-CN,en' : 'en',
  });
  const response = await fetchWithTimeout(`${NOMINATIM_URL}?${query.toString()}`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`City directory unavailable (${response.status})`);
  const payload = await response.json() as Array<{
    place_id: number;
    display_name: string;
    name?: string;
    namedetails?: Record<string, string>;
    lat: string;
    lon: string;
    boundingbox?: string[];
  }>;
  return payload
    .map((place) => {
      const box = place.boundingbox?.map(Number);
      return {
        id: String(place.place_id),
        name: lang === 'zh'
          ? place.namedetails?.['name:zh'] || place.namedetails?.['name:zh-Hans'] || place.name || place.display_name.split(',')[0]
          : place.name || place.display_name.split(',')[0],
        displayName: place.display_name,
        lat: Number(place.lat),
        lon: Number(place.lon),
        bbox: box && box.length === 4 ? [box[2], box[0], box[3], box[1]] as [number, number, number, number] : undefined,
      };
    })
    .filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lon));
}
