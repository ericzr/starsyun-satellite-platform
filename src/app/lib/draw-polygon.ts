import type { BBox } from './geo';

export type DrawPoint = [number, number];

/** Keep adjacent vertices in the same world copy, including across the date line. */
export function unwrapPoint(point: DrawPoint, previous?: DrawPoint): DrawPoint {
  let lng = ((((point[0] + 180) % 360) + 360) % 360) - 180;
  if (previous) lng += Math.round((previous[0] - lng) / 360) * 360;
  return [lng, point[1]];
}

export function makeDrawnPolygon(points: DrawPoint[]): {
  bbox: BBox;
  feature: GeoJSON.Feature<GeoJSON.Polygon>;
} {
  if (points.length < 3 || points.length > 500) throw new Error('vertices');
  if (
    points.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y) || Math.abs(y) > 85.051129)
  )
    throw new Error('coordinates');
  const cross = (a: DrawPoint, b: DrawPoint, c: DrawPoint) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const on = (a: DrawPoint, b: DrawPoint, c: DrawPoint) =>
    Math.abs(cross(a, b, c)) < 1e-12 &&
    c[0] >= Math.min(a[0], b[0]) &&
    c[0] <= Math.max(a[0], b[0]) &&
    c[1] >= Math.min(a[1], b[1]) &&
    c[1] <= Math.max(a[1], b[1]);
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    if (a[0] === b[0] && a[1] === b[1]) throw new Error('duplicate');
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      const c = points[j],
        d = points[(j + 1) % points.length];
      if (
        (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) ||
        on(a, b, c) ||
        on(a, b, d) ||
        on(c, d, a) ||
        on(c, d, b)
      )
        throw new Error('intersection');
    }
  }
  const twiceArea = points.reduce(
    (sum, p, i) => sum + cross(points[0], p, points[(i + 1) % points.length]),
    0,
  );
  if (Math.abs(twiceArea) < 1e-10) throw new Error('area');
  const xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]);
  const bbox: BBox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  if (bbox[2] - bbox[0] >= 180) throw new Error('extent');
  const ring = twiceArea < 0 ? [...points].reverse() : [...points];
  return {
    bbox,
    feature: {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]]] },
    },
  };
}
