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
  const lats = points.map(([, lat]) => lat);
  return [
    ...minimalLongitudeBounds(points.map(([lng]) => lng)),
    Math.min(...lats),
    Math.max(...lats),
  ] as BBox;
}

/**
 * Find the shortest longitude interval containing all points. This keeps a
 * KML/KMZ polygon around 179E/-179W narrow instead of expanding it to 358°.
 * The returned east value may be unwrapped (for example 181) so downstream
 * area calculations retain the intended span.
 */
function minimalLongitudeBounds(longitudes: number[]): [number, number] {
  const normalized = longitudes
    .map((longitude) => ((longitude % 360) + 360) % 360)
    .sort((a, b) => a - b);
  if (normalized.length === 1) {
    const west = normalized[0] > 180 ? normalized[0] - 360 : normalized[0];
    return [west, west + 0.0001];
  }
  let largestGap = -1;
  let gapIndex = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    const next = index === normalized.length - 1 ? normalized[0] + 360 : normalized[index + 1];
    const gap = next - normalized[index];
    if (gap > largestGap) {
      largestGap = gap;
      gapIndex = index;
    }
  }
  const west360 = normalized[(gapIndex + 1) % normalized.length];
  const span = Math.max(0.0001, 360 - largestGap);
  const west = west360 > 180 ? west360 - 360 : west360;
  return [west, west + span];
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
  // A box with east < west and both longitudes in the canonical range is a
  // compact antimeridian-crossing box (for example 179..-179 means 2°).
  // Drawn boxes may instead use an unwrapped east value such as 181, which is
  // already an explicit narrow span and must be preserved.
  const rawSpan = e >= w ? e - w : e + 360 - w;
  const longitudeSpan = Math.min(Math.max(rawSpan, 0), 360);
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
 * Split a longitude range into valid WGS84 ranges. MapLibre keeps a narrow
 * rectangle drawn across the antimeridian unwrapped (for example 179..181)
 * so its area remains correct; network providers still require -180..180.
 */
export function splitBBox(b: BBox): BBox[] {
  const [rawWest, rawSouth, rawEast, rawNorth] = b;
  // Preserve the semantic of an antimeridian-crossing WGS84 bbox when east is
  // numerically smaller than west (179..-179). For unwrapped drawn boxes such
  // as 179..181, the ordinary east-west difference is already correct.
  const rawSpan = rawEast >= rawWest ? rawEast - rawWest : rawEast + 360 - rawWest;
  const span = Math.min(Math.max(rawSpan, 0), 360);
  const south = Math.max(-90, Math.min(90, Math.min(rawSouth, rawNorth)));
  const north = Math.max(-90, Math.min(90, Math.max(rawSouth, rawNorth)));
  if (span >= 360) return [[-180, south, 180, north]];
  const normalizedWest = ((rawWest + 180) % 360 + 360) % 360 - 180;
  const normalizedEast = normalizedWest + span;
  if (normalizedEast <= 180) return [[normalizedWest, south, normalizedEast, north]];
  return [
    [normalizedWest, south, 180, north],
    [-180, south, normalizedEast - 360, north],
  ].filter((part) => part[2] - part[0] > 0.0000001) as BBox[];
}

/**
 * Coverage ratio of `target` covered by `image`, in [0,1].
 * i.e. intersection area / target area.
 */
export function coverageRatio(target: BBox, image: BBox): number {
  const t = bboxAreaKm2(target);
  if (t === 0) return 0;
  const covered = splitBBox(target).reduce((sum, targetSegment) => (
    sum + splitBBox(image).reduce((imageSum, imageSegment) => {
      const inter = intersectBBox(targetSegment, imageSegment);
      return imageSum + (inter ? bboxAreaKm2(inter) : 0);
    }, 0)
  ), 0);
  return Math.min(1, covered / t);
}

/** Does image bbox intersect the target at all? */
export function intersects(a: BBox, b: BBox): boolean {
  return splitBBox(a).some((aSegment) => splitBBox(b).some((bSegment) => intersectBBox(aSegment, bSegment) !== null));
}

export function bboxToPolygon(b: BBox): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> {
  const [w, s, e, n] = b;
  const boxes = splitBBox(b);
  if (boxes.length > 1) {
    return {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'MultiPolygon',
        coordinates: boxes.map(([west, south, east, north]) => [[
          [west, south],
          [east, south],
          [east, north],
          [west, north],
          [west, south],
        ]]),
      },
    };
  }
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
      // Use the shortest longitude delta so a ring crossing the date line is
      // measured as a narrow polygon instead of almost the whole globe.
      const deltaLon = ((lon2 - lon1 + 540) % 360) - 180;
      area += deg2rad(deltaLon) * (Math.sin(deg2rad(lat1)) + Math.sin(deg2rad(lat2)));
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

/** Parse latitude/longitude text in either "lat, lon" or "lon, lat" order.
 *
 * Direction letters are tokenized before reading the numbers. This matters
 * for inputs such as `N31.2 E121.4`: a greedy regex can mistake the `E` for
 * the suffix of the first value and silently lose the longitude sign.
 */
export function parseCoords(input: string): [number, number] | null {
  const normalized = input.trim()
    .replace(/^geo:\s*/i, '')
    .replace(/^\(?\s*(?:[gG]\s*)?/, '')
    .replace(/\s*\)?$/, '')
    .replace(/[，、]/g, ',')
    .replace(/[º°]/g, '')
    // Labels are presentation-only; the component parser below retains any
    // direction letter immediately before or after the number.
    .replace(/(?:\b(?:latitude|lat)|纬度)\s*[:=]?\s*/gi, '')
    .replace(/(?:\b(?:longitude|lon|lng)|经度)\s*[:=]?\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return null;

  // Make `N31.2`, `31.2N`, and comma/semicolon/slash separated values use the
  // same token stream. The only accepted letters are compass hemispheres.
  const tokens = normalized
    .replace(/([NSEW])/gi, ' $1 ')
    .replace(/[,;/]/g, ' ')
    .split(/\s+/u)
    .filter(Boolean);
  const components: Array<{ value: number; hemisphere?: string }> = [];
  let index = 0;
  while (index < tokens.length && components.length < 2) {
    let hemisphere: string | undefined;
    let valueToken = tokens[index];
    if (/^[NSEW]$/iu.test(valueToken)) {
      hemisphere = valueToken.toUpperCase();
      index += 1;
      valueToken = tokens[index] ?? '';
    }
    if (!/^[+-]?\d+(?:\.\d+)?$/u.test(valueToken)) return null;
    const value = Number(valueToken);
    if (!Number.isFinite(value)) return null;
    index += 1;
    if (!hemisphere && /^[NSEW]$/iu.test(tokens[index] ?? '')) {
      hemisphere = tokens[index].toUpperCase();
      index += 1;
    }
    components.push({ value, hemisphere });
  }
  if (components.length !== 2 || index !== tokens.length) return null;

  const signed = ({ value, hemisphere }: (typeof components)[number]) => {
    if (!hemisphere) return value;
    return /[SW]/u.test(hemisphere) ? -Math.abs(value) : Math.abs(value);
  };
  const first = signed(components[0]);
  const second = signed(components[1]);
  const firstHemisphere = components[0].hemisphere;
  const secondHemisphere = components[1].hemisphere;
  if (firstHemisphere && secondHemisphere) {
    const latFirst = /[NS]/u.test(firstHemisphere) && /[EW]/u.test(secondHemisphere);
    const lonFirst = /[EW]/u.test(firstHemisphere) && /[NS]/u.test(secondHemisphere);
    if (latFirst) return Math.abs(first) <= 90 && Math.abs(second) <= 180 ? [second, first] : null;
    if (lonFirst) return Math.abs(second) <= 90 && Math.abs(first) <= 180 ? [first, second] : null;
    return null;
  }
  if (Math.abs(first) <= 90 && Math.abs(second) <= 180) {
    // The UI documents latitude first, so keep that as the default for the
    // ambiguous case where both values fall inside +/-90 degrees.
    return [second, first];
  }
  if (Math.abs(first) <= 180 && Math.abs(second) <= 90) return [first, second];
  return null;
}
