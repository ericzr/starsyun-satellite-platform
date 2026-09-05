#!/usr/bin/env node

/**
 * Import versioned geoBoundaries gbOpen ADM0-ADM3 GeoJSON into Supabase.
 *
 * Examples:
 *   node scripts/import-geoboundaries.mjs --country=CHN
 *   node scripts/import-geoboundaries.mjs --country=ALL --levels=0,1
 *
 * ADM3 is intentionally an explicit level. Some countries do not publish an
 * ADM3 dataset; those countries are skipped with a warning instead of being
 * filled with guessed geocoder results.
 */

const args = new Map(process.argv.slice(2).map((value) => {
  const match = value.match(/^--([^=]+)=(.*)$/u);
  return match ? [match[1], match[2]] : [value.replace(/^--/u, ''), 'true'];
}));

const countryArg = String(args.get('country') || '');
if (!countryArg) {
  console.error('Usage: --country=ISO3 or --country=ALL [--levels=0,1,2,3]');
  process.exit(2);
}

const requestedLevels = String(args.get('levels') || '0,1,2,3')
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value >= 0 && value <= 3);
if (!requestedLevels.length) {
  console.error('levels must contain one or more values from 0 to 3');
  process.exit(2);
}
const levels = [...new Set(requestedLevels.flatMap((level) => Array.from({ length: level + 1 }, (_, index) => index)))].sort((a, b) => a - b);

const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/u, '');
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!supabaseUrl || !supabaseKey) {
  console.error('SUPABASE_URL and a server-only SUPABASE_SECRET_KEY are required');
  process.exit(2);
}

const GEOBOUNDARIES_API = 'https://www.geoboundaries.org/api/current/gbOpen';
const REST_COUNTRIES_API = 'https://restcountries.com/v3.1/all?fields=cca2,cca3';
const source = 'geoBoundaries-gbOpen';
// country_iso2 is optional in the database. Keep the first production imports
// deterministic even when the legacy REST Countries endpoint is unavailable;
// other countries can still be imported with their ISO3 code and enriched in a
// later metadata pass.
const fallbackIso2 = new Map([
  ['CHN', 'CN'],
  ['ARE', 'AE'],
  ['SGP', 'SG'],
  ['USA', 'US'],
  ['GBR', 'GB'],
  ['JPN', 'JP'],
  ['KOR', 'KR'],
  ['IND', 'IN'],
  ['AUS', 'AU'],
  ['DEU', 'DE'],
  ['FRA', 'FR'],
  ['CAN', 'CA'],
  ['BRA', 'BR'],
  ['RUS', 'RU'],
]);
// Taiwan is represented as a first-level administrative area under CHN in the
// platform directory. Do not expose an additional standalone country entry.
const suppressedStandaloneCountries = new Set(['TWN']);

const chinaNames = {
  China: '中国',
  'Anhui Province': '安徽省',
  'Beijing Municipality': '北京市',
  'Chongqing Municipality': '重庆市',
  'Fujian Province': '福建省',
  'Gansu Province': '甘肃省',
  'Guangxi Zhuang Autonomous Region': '广西壮族自治区',
  'Guangdong Province': '广东省',
  'Guangdong Sheng': '广东省',
  'Guizhou Province': '贵州省',
  'Hainan Province': '海南省',
  'Hebei Province': '河北省',
  'Heilongjiang Province': '黑龙江省',
  'Henan Province': '河南省',
  'Hong Kong Special Administrative Region': '香港特别行政区',
  'Hubei Province': '湖北省',
  'Hunan Province': '湖南省',
  'Inner Mongolia Autonomous Region': '内蒙古自治区',
  'Jiangsu Province': '江苏省',
  'Jiangxi Province': '江西省',
  'Jilin Province': '吉林省',
  'Liaoning Province': '辽宁省',
  'Macau Special Administrative Region': '澳门特别行政区',
  'Ningxia Ningxia Hui Autonomous Region': '宁夏回族自治区',
  'Ningxia Hui Autonomous Region': '宁夏回族自治区',
  'Qinghai Province': '青海省',
  'Shaanxi Province': '陕西省',
  'Shandong Province': '山东省',
  'Shanghai Municipality': '上海市',
  'Shanxi Province': '山西省',
  'Sichuan Province': '四川省',
  'Taiwan Province': '台湾省',
  'Tianjin Municipality': '天津市',
  'Tibet Autonomous Region': '西藏自治区',
  'Xinjiang Uyghur Autonomous Region': '新疆维吾尔自治区',
  'Yunnan Province': '云南省',
  'Zhejiang Province': '浙江省',
};

const chinaNameAliases = [
  [['anhui', 'anhui sheng', 'anhui province'], '安徽省'],
  [['beijing', 'beijing shi', 'beijing municipality'], '北京市'],
  [['chongqing', 'chongqing shi', 'chongqing municipality'], '重庆市'],
  [['fujian', 'fujian sheng', 'fujian province'], '福建省'],
  [['gansu', 'gansu sheng', 'gansu province'], '甘肃省'],
  [['guangdong', 'guangdong sheng', 'guangdong province'], '广东省'],
  [['guangxi', 'guangxi zhuangzu zizhiqu', 'guangxi zhuang autonomous region'], '广西壮族自治区'],
  [['guizhou', 'guizhou sheng', 'guizhou province'], '贵州省'],
  [['hainan', 'hainan sheng', 'hainan province'], '海南省'],
  [['hebei', 'hebei sheng', 'hebei province'], '河北省'],
  [['heilongjiang', 'heilongjiang sheng', 'heilongjiang province'], '黑龙江省'],
  [['henan', 'henan sheng', 'henan province'], '河南省'],
  [['hubei', 'hubei sheng', 'hubei province'], '湖北省'],
  [['hunan', 'hunan sheng', 'hunan province'], '湖南省'],
  [['inner mongolia', 'inner mongolia zizhiqu', 'inner mongolia autonomous region', 'nei mongol'], '内蒙古自治区'],
  [['jiangsu', 'jiangsu sheng', 'jiangsu province'], '江苏省'],
  [['jiangxi', 'jiangxi sheng', 'jiangxi province'], '江西省'],
  [['jilin', 'jilin sheng', 'jilin province'], '吉林省'],
  [['liaoning', 'liaoning sheng', 'liaoning province'], '辽宁省'],
  [['ningxia', 'ningxia hui zizhiqu', 'ningxia hui autonomous region', 'ningxia ningxia hui autonomous region'], '宁夏回族自治区'],
  [['qinghai', 'qinghai sheng', 'qinghai province'], '青海省'],
  [['shaanxi', 'shaanxi sheng', 'shaanxi province'], '陕西省'],
  [['shandong', 'shandong sheng', 'shandong province'], '山东省'],
  [['shanghai', 'shanghai shi', 'shanghai municipality'], '上海市'],
  [['shanxi', 'shanxi sheng', 'shanxi province'], '山西省'],
  [['sichuan', 'sichuan sheng', 'sichuan province'], '四川省'],
  [['tianjin', 'tianjin shi', 'tianjin municipality'], '天津市'],
  [['tibet', 'tibet autonomous region', 'xizang', 'xizang zizhiqu'], '西藏自治区'],
  [['xinjiang', 'xinjiang uygur zizhiqu', 'xinjiang uyghur autonomous region', 'xinjiang uygur autonomous region'], '新疆维吾尔自治区'],
  [['yunnan', 'yunnan sheng', 'yunnan province'], '云南省'],
  [['zhejiang', 'zhejiang sheng', 'zhejiang province'], '浙江省'],
  [['hong kong', 'hong kong sar', 'hong kong special administrative region'], '香港特别行政区'],
  [['macau', 'macao', 'macao sar', 'macau special administrative region'], '澳门特别行政区'],
  [['taiwan', 'taiwan province', 'taiwan province, people\'s republic of china'], '台湾省'],
];
const chinaNameAliasMap = new Map(chinaNameAliases.flatMap(([aliases, value]) => aliases.map((alias) => [alias.toLowerCase(), value])));

async function getJson(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

function bboxGeometry(geometry) {
  const points = [];
  const walk = (value) => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
      points.push(value);
      return;
    }
    value.forEach(walk);
  };
  walk(geometry?.coordinates);
  if (!points.length) return null;
  const lngs = points.map((point) => point[0]);
  const lats = points.map((point) => point[1]);
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
}

function representativePoint(geometry, bbox) {
  const ringCentroid = (ring) => {
    let areaTwice = 0;
    let x = 0;
    let y = 0;
    for (let index = 0; index < ring.length - 1; index += 1) {
      const [x0, y0] = ring[index];
      const [x1, y1] = ring[index + 1];
      const cross = x0 * y1 - x1 * y0;
      areaTwice += cross;
      x += (x0 + x1) * cross;
      y += (y0 + y1) * cross;
    }
    if (Math.abs(areaTwice) < Number.EPSILON) return null;
    return { point: [x / (3 * areaTwice), y / (3 * areaTwice)], area: Math.abs(areaTwice) };
  };
  const polygons = geometry?.type === 'Polygon' ? [geometry.coordinates] : geometry?.type === 'MultiPolygon' ? geometry.coordinates : [];
  const candidate = polygons
    .map((polygon) => polygon?.[0] && ringCentroid(polygon[0]))
    .filter(Boolean)
    .sort((a, b) => b.area - a.area)[0];
  if (candidate && pointInGeometry(candidate.point, geometry)) return candidate.point;
  if (bbox) return [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
  const first = [];
  const walk = (value) => {
    if (first.length) return;
    if (Array.isArray(value) && value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
      first.push(value[0], value[1]);
      return;
    }
    if (Array.isArray(value)) value.forEach(walk);
  };
  walk(geometry?.coordinates);
  return first.length === 2 ? first : [0, 0];
}

function pointInRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects = ((yi > point[1]) !== (yj > point[1]))
      && point[0] < ((xj - xi) * (point[1] - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInGeometry(point, geometry) {
  if (!geometry) return false;
  if (geometry.type === 'Polygon') {
    const rings = geometry.coordinates;
    return Boolean(rings?.[0] && pointInRing(point, rings[0]) && !rings.slice(1).some((ring) => pointInRing(point, ring)));
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((polygon) => polygon?.[0] && pointInRing(point, polygon[0]) && !polygon.slice(1).some((ring) => pointInRing(point, ring)));
  }
  return false;
}

function bboxContains(outer, inner) {
  return outer && inner && outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3];
}

function bboxArea(bbox) {
  return bbox && bbox.length === 4
    ? Math.max(0, bbox[2] - bbox[0]) * Math.max(0, bbox[3] - bbox[1])
    : Number.POSITIVE_INFINITY;
}

function bboxContainsPoint(bbox, point) {
  return bbox && point && bbox[0] <= point[0] && bbox[1] <= point[1] && bbox[2] >= point[0] && bbox[3] >= point[1];
}

function parentFor(child, parents) {
  const point = representativePoint(child.geometry, child.bbox);
  const candidates = parents
    .filter((parent) => bboxContains(parent.bbox, child.bbox) || bboxContainsPoint(parent.bbox, point))
    .filter((parent) => pointInGeometry(point, parent.geometry))
    .sort((a, b) => bboxArea(a.bbox) - bboxArea(b.bbox));
  if (candidates[0]) return candidates[0].id;

  // Islands and enclaves can sit just outside a parent's polygon due to
  // coastline generalisation. Keep the relationship deterministic by using
  // the smallest parent bbox containing the child bbox/representative point.
  return parents
    .filter((parent) => bboxContains(parent.bbox, child.bbox) || bboxContainsPoint(parent.bbox, point))
    .sort((a, b) => bboxArea(a.bbox) - bboxArea(b.bbox))[0]?.id;
}

function metadataList(payload, iso3, level) {
  if (Array.isArray(payload)) return payload.filter((item) => item.boundaryISO === iso3);
  return payload?.boundaryISO === iso3 ? [payload] : [];
}

function localNames(properties, iso3, name) {
  const zh = properties['name:zh'] || properties.name_zh || properties.nameZh || properties.NAME_ZH || properties.nameCN
    || (iso3 === 'CHN' ? chinaNames[name] || chinaNameAliasMap.get(name.toLowerCase()) : undefined);
  const local = properties.local_name || properties.localName || properties.NAME_LOCAL;
  return {
    ...(typeof zh === 'string' && zh.trim() ? { 'zh-Hans': zh.trim() } : {}),
    ...(typeof local === 'string' && local.trim() ? { local: local.trim() } : {}),
  };
}

async function metadataFor(iso3, level) {
  const payload = await getJson(`${GEOBOUNDARIES_API}/${iso3}/ADM${level}/`);
  return metadataList(payload, iso3, level);
}

async function loadDataset(meta, iso3, level, iso2) {
  const url = meta.gjDownloadURL || meta.simplifiedGeometryGeoJSON;
  if (!url) throw new Error(`no GeoJSON URL for ${iso3} ADM${level}`);
  const payload = await getJson(url);
  const features = Array.isArray(payload.features) ? payload.features : [];
  return features.flatMap((feature, index) => {
    const geometry = feature.geometry;
    const bbox = bboxGeometry(geometry);
    if (!geometry || !bbox) return [];
    const properties = feature.properties || {};
    const shapeId = String(properties.shapeID || properties.shapeId || index);
    let name = String(properties.shapeName || properties.name || `${iso3} ADM${level} ${index + 1}`).trim();
    if (iso3 === 'CHN' && level === 1 && /^Guangzhou Province$/iu.test(name)) name = 'Guangdong Province';
    if (iso3 === 'CHN' && level === 2 && /^CHN ADM2 \d+$/u.test(name)) name = 'Macau';
    return [{
      id: `${iso3}-ADM${level}-${shapeId}`,
      source,
      sourceVersion: String(meta.boundaryYearRepresented || meta.buildDate || 'current'),
      sourceLicense: String(meta.boundaryLicense || meta.licenseDetail || '').trim() || null,
      sourceUrl: String(meta.boundarySourceURL || meta.gjDownloadURL || '').trim() || null,
      countryIso2: iso2 || null,
      countryIso3: iso3,
      level,
      parentId: null,
      nameEn: name,
      nameLocal: localNames(properties, iso3, name),
      centroid: representativePoint(geometry, bbox),
      bbox,
      geometry,
    }];
  });
}

async function iso2Map() {
  try {
    const payload = await getJson(REST_COUNTRIES_API);
    if (Array.isArray(payload)) {
      const remote = new Map(payload
        .map((country) => [String(country.cca3 || '').toUpperCase(), String(country.cca2 || '').toUpperCase()])
        .filter(([iso3, iso2]) => iso3 && iso2));
      return new Map([...fallbackIso2, ...remote]);
    }
    console.warn('REST Countries returned a non-list response; using fallback ISO2 mappings');
  } catch (error) {
    console.warn(`REST Countries unavailable; using fallback ISO2 mappings: ${error.message}`);
  }
  return fallbackIso2;
}

async function writeBatch(batch) {
  const response = await fetch(`${supabaseUrl}/rest/v1/admin_areas?on_conflict=id`, {
    method: 'POST',
    headers: {
      apikey: supabaseKey,
      ...(supabaseKey.startsWith('sb_') ? {} : { Authorization: `Bearer ${supabaseKey}` }),
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(batch),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`Supabase upsert failed (${response.status}): ${await response.text()}`);
}

async function upsert(rows) {
  let batch = [];
  let bytes = 2;
  for (const row of rows) {
    const record = {
      id: row.id,
      source: row.source,
      source_version: row.sourceVersion,
      source_license: row.sourceLicense,
      source_url: row.sourceUrl,
      country_iso2: row.countryIso2,
      country_iso3: row.countryIso3,
      level: row.level,
      parent_id: row.parentId,
      name_en: row.nameEn,
      name_local: row.nameLocal,
      centroid_lon: row.centroid[0],
      centroid_lat: row.centroid[1],
      bbox: row.bbox,
      geometry: row.geometry,
      is_active: true,
    };
    const recordBytes = Buffer.byteLength(JSON.stringify(record), 'utf8');
    if (batch.length && (bytes + recordBytes > 1_500_000 || batch.length >= 100)) {
      await writeBatch(batch);
      batch = [];
      bytes = 2;
    }
    batch.push(record);
    bytes += recordBytes + 1;
  }
  if (batch.length) await writeBatch(batch);
}

const isoMap = await iso2Map();
const requested = countryArg.toUpperCase() === 'ALL'
  ? [...new Set((await Promise.all(requestedLevels.map(async (level) => {
    try {
      const payload = await getJson(`${GEOBOUNDARIES_API}/ALL/ADM${level}/`);
      return (Array.isArray(payload) ? payload : []).map((item) => String(item.boundaryISO || '').toUpperCase()).filter(Boolean);
    } catch (error) {
      console.warn(`Could not enumerate ADM${level}: ${error.message}`);
      return [];
    }
  }))).flat())]
  : [countryArg.toUpperCase()];

const countries = requested.filter((iso3) => !suppressedStandaloneCountries.has(iso3));
if (countries.length !== requested.length) {
  console.warn('Skipped standalone TWN import; Taiwan is maintained under CHN ADM1.');
}

let imported = 0;
for (const iso3 of countries) {
  const iso2 = isoMap.get(iso3) || null;
  const byLevel = new Map();
  for (const level of levels) {
    try {
      const metas = await metadataFor(iso3, level);
      const rows = [];
      for (const meta of metas) rows.push(...await loadDataset(meta, iso3, level, iso2));
      byLevel.set(level, rows);
    } catch (error) {
      console.warn(`Skipping ${iso3} ADM${level}: ${error.message}`);
    }
  }
  for (const level of [1, 2, 3]) {
    const children = byLevel.get(level) || [];
    const parents = byLevel.get(level - 1) || [];
    for (const child of children) {
      if (parents.length) child.parentId = parentFor(child, parents) || null;
    }
  }
  for (const level of levels) {
    const rows = byLevel.get(level) || [];
    if (!rows.length) continue;
    await upsert(rows);
    imported += rows.length;
    console.log(`${iso3} ADM${level}: ${rows.length} areas imported`);
  }
}

console.log(`geoBoundaries import complete: ${imported} areas`);
