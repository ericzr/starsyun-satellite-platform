// Lightweight geospatial helpers for bbox-based mock data.
// bbox format: [west, south, east, north] in degrees.

export type BBox = [number, number, number, number];

/** Extract the WGS84 extent from a KML/KMZ vector file in the browser. */
export async function parseVectorFile(file: File): Promise<BBox> {
  const lowerName = file.name.toLowerCase();
  let kmlText: string;
  if (lowerName.endsWith('.kmz')) {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const kmlEntry = Object.keys(zip.files).find((name) => name.toLowerCase().endsWith('.kml'));
    if (!kmlEntry) throw new Error('KMZ file does not contain a KML document');
    kmlText = await zip.file(kmlEntry)!.async('text');
  } else if (lowerName.endsWith('.kml')) {
    kmlText = await file.text();
  } else {
    throw new Error('Only KML and KMZ files are supported');
  }

  const document = new DOMParser().parseFromString(kmlText, 'application/xml');
  if (document.querySelector('parsererror')) throw new Error('Invalid KML document');
  const points: [number, number][] = [];
  document.querySelectorAll('coordinates').forEach((node) => {
    node.textContent
      ?.trim()
      .split(/\s+/)
      .forEach((tuple) => {
        const [lng, lat] = tuple.split(',').map(Number);
        if (Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90) {
          points.push([lng, lat]);
        }
      });
  });
  if (!points.length) throw new Error('No valid coordinates found in vector file');
  const lngs = points.map(([lng]) => lng);
  const lats = points.map(([, lat]) => lat);
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
}

const EARTH_A = 6378.137; // WGS84 semi-major axis, km
const EARTH_E2 = 0.0066943799901413165; // WGS84 eccentricity squared

function deg2rad(d: number) {
  return (d * Math.PI) / 180;
}

/**
 * Surface area of a lon/lat bbox on the WGS84 ellipsoid in km².
 * The longitude strip is integrated analytically, so the result is stable
 * across map zoom levels and remains accurate for large/high-latitude AOIs.
 */
export function bboxAreaKm2(b: BBox): number {
  const [w, s, e, n] = b;
  const south = deg2rad(Math.max(-90, Math.min(90, s)));
  const north = deg2rad(Math.max(-90, Math.min(90, n)));
  // MapLibre can return longitudes outside [-180, 180] when the world wraps;
  // drawing keeps those unwrapped values so the measured span remains stable.
  const originalSpan = Math.abs(e - w);
  // Drawing normalizes antimeridian-crossing boxes into an unwrapped range
  // (e.g. 179..181), so preserve the explicit span rather than guessing a
  // complement for broad, intentional rectangles.
  const longitudeSpan = Math.min(originalSpan, 360);
  const dLon = deg2rad(longitudeSpan);
  const eccentricity = Math.sqrt(EARTH_E2);
  const stripArea = (latitude: number) => {
    const sinLat = Math.sin(latitude);
    const denominator = 1 - EARTH_E2 * sinLat * sinLat;
    return (EARTH_A * EARTH_A * (1 - EARTH_E2) / 2) * (
      sinLat / denominator + Math.atanh(eccentricity * sinLat) / eccentricity
    );
  };
  return Math.abs(dLon * (stripArea(north) - stripArea(south)));
}

/** Intersection bbox of two boxes, or null if disjoint. */
export function intersectBBox(a: BBox, b: BBox): BBox | null {
  const w = Math.max(a[0], b[0]);
  const s = Math.max(a[1], b[1]);
  const e = Math.min(a[2], b[2]);
  const n = Math.min(a[3], b[3]);
  if (w >= e || s >= n) return null;
  return [w, s, e, n];
}

/**
 * Coverage ratio of `target` covered by `image`, in [0,1].
 * i.e. intersection area / target area.
 */
export function coverageRatio(target: BBox, image: BBox): number {
  const inter = intersectBBox(target, image);
  if (!inter) return 0;
  const t = bboxAreaKm2(target);
  if (t === 0) return 0;
  return Math.min(1, bboxAreaKm2(inter) / t);
}

/** Does image bbox intersect the target at all? */
export function intersects(a: BBox, b: BBox): boolean {
  return intersectBBox(a, b) !== null;
}

export function bboxToPolygon(b: BBox): GeoJSON.Feature<GeoJSON.Polygon> {
  const [w, s, e, n] = b;
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [w, s],
          [e, s],
          [e, n],
          [w, n],
          [w, s],
        ],
      ],
    },
  };
}

export function bboxCenter(b: BBox): [number, number] {
  return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
}

/** Approximate WGS84 surface area for Polygon/MultiPolygon geometries in km². */
export function geometryAreaKm2(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): number {
  const ringArea = (ring: number[][]) => {
    if (ring.length < 4) return 0;
    const radius = 6371.0088;
    let area = 0;
    for (let index = 0; index < ring.length - 1; index += 1) {
      const [lon1, lat1] = ring[index];
      const [lon2, lat2] = ring[index + 1];
      area += deg2rad(lon2 - lon1) * (Math.sin(deg2rad(lat1)) + Math.sin(deg2rad(lat2)));
    }
    return Math.abs(area * radius * radius / 2);
  };
  const polygonArea = (polygon: number[][][]) => {
    if (!polygon.length) return 0;
    return Math.max(0, ringArea(polygon[0]) - polygon.slice(1).reduce((sum, ring) => sum + ringArea(ring), 0));
  };
  return geometry.type === 'Polygon'
    ? polygonArea(geometry.coordinates)
    : geometry.coordinates.reduce((sum, polygon) => sum + polygonArea(polygon), 0);
}

export function fmtArea(km2: number): string {
  if (km2 >= 1000) return `${(km2 / 1000).toFixed(2)}k`;
  if (km2 >= 100) return km2.toFixed(0);
  if (km2 >= 10) return km2.toFixed(1);
  return km2.toFixed(2);
}

/** Parse latitude/longitude text in either "lat, lon" or "lon, lat" order. */
export function parseCoords(input: string): [number, number] | null {
  const normalized = input.trim().replace(/^[gG]\s*/, '').replace(/[，、]/g, ',').replace(/[º°]/g, '').replace(/\s+/g, ' ');
  const match = normalized.match(/^([NSWE])?\s*([-+]?\d+(?:\.\d+)?)\s*([NSWE])?\s*[,; ]\s*([NSWE])?\s*([-+]?\d+(?:\.\d+)?)\s*([NSWE])?$/i);
  if (!match) return null;
  const first = Number(match[2]);
  const second = Number(match[5]);
  const firstHemisphere = match[1]?.toUpperCase() || match[3]?.toUpperCase();
  const secondHemisphere = match[4]?.toUpperCase() || match[6]?.toUpperCase();
  const signed = (value: number, hemisphere?: string) => /[SW]/.test(hemisphere || '') ? -Math.abs(value) : value;
  const values = [signed(first, firstHemisphere), signed(second, secondHemisphere)];
  if (values.length !== 2 || values.some((value) => !Number.isFinite(value))) return null;
  const [a, b] = values;
  if (firstHemisphere && secondHemisphere) {
    const latFirst = /[NS]/.test(firstHemisphere) && /[EW]/.test(secondHemisphere);
    const lonFirst = /[EW]/.test(firstHemisphere) && /[NS]/.test(secondHemisphere);
    if (latFirst) return Math.abs(a) <= 90 && Math.abs(b) <= 180 ? [b, a] : null;
    if (lonFirst) return Math.abs(b) <= 90 && Math.abs(a) <= 180 ? [a, b] : null;
  }
  if (Math.abs(a) <= 90 && Math.abs(b) <= 180) {
    // The UI documents latitude first, so keep that as the default for the
    // ambiguous case where both values fall inside +/-90 degrees.
    return [b, a];
  }
  if (Math.abs(a) <= 180 && Math.abs(b) <= 90) return [a, b];
  return null;
}
