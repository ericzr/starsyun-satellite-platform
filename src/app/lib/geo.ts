// Lightweight geospatial helpers for bbox-based mock data.
// bbox format: [west, south, east, north] in degrees.

export type BBox = [number, number, number, number];

const EARTH_R = 6371; // km

function deg2rad(d: number) {
  return (d * Math.PI) / 180;
}

/** Approximate area of a lon/lat bbox in km² (spherical). */
export function bboxAreaKm2(b: BBox): number {
  const [w, s, e, n] = b;
  const latMid = deg2rad((s + n) / 2);
  const dLat = deg2rad(n - s);
  const dLon = deg2rad(e - w);
  const height = EARTH_R * dLat;
  const width = EARTH_R * dLon * Math.cos(latMid);
  return Math.abs(width * height);
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
