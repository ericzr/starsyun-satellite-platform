// Lightweight geospatial helpers for bbox-based mock data.
// bbox format: [west, south, east, north] in degrees.

export type BBox = [number, number, number, number];

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
  const longitudeSpan = Math.abs(e - w) > 360 ? 360 : Math.abs(e - w);
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

export function fmtArea(km2: number): string {
  if (km2 >= 1000) return `${(km2 / 1000).toFixed(1)}k`;
  if (km2 >= 100) return km2.toFixed(0);
  if (km2 >= 10) return km2.toFixed(1);
  return km2.toFixed(2);
}

/** Parse "lat, lon" coordinate string. Returns [lon, lat] or null. */
export function parseCoords(input: string): [number, number] | null {
  const m = input.trim().match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lon = parseFloat(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return [lon, lat];
}
