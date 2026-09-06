// Metadata validity does not prove the real administrative rank.
// CHN canary source: https://www.nmg.gov.cn/asnmg/yxnmg/xzqh/nmgzzqgk/
const prefectures = [
  ['呼和浩特市', 'hohhot', 'huhehaote'], ['包头市', 'baotou'],
  ['呼伦贝尔市', 'hulunbuir', 'hulunbeier'], ['兴安盟', 'hinggan', 'xingan'],
  ['通辽市', 'tongliao'], ['赤峰市', 'chifeng'],
  ['锡林郭勒盟', 'xilingol', 'xilinguole'], ['乌兰察布市', 'ulanqab', 'wulanchabu'],
  ['鄂尔多斯市', 'ordos', 'erdos', 'eerduosi'], ['巴彦淖尔市', 'bayannur', 'bayannaoer'],
  ['乌海市', 'wuhai'], ['阿拉善盟', 'alxa', 'alashan'],
];
function normalized(name) {
  return name.normalize('NFKC').toLowerCase().replace(/[\s\p{P}]/gu, '')
    .replace(/(autonomousregion|prefecture|league|city|shi|meng)$/u, '');
}
function hasName(row, aliases) {
  return [row.name_en, ...Object.values(row.name_local || {})]
    .some((name) => typeof name === 'string' && aliases.some((alias) => normalized(name) === normalized(alias)));
}
function hasChineseLabel(row) {
  const local = row.name_local || {};
  // Only inspect supported Chinese fallbacks, not unrelated Han-script locales.
  return [local['zh-Hans'], local.zh, local['name:zh'], row.name_en]
    .some((name) => typeof name === 'string' && /\p{Script=Han}/u.test(name));
}
function validBbox(bbox) {
  return Array.isArray(bbox) && bbox.length === 4 && bbox.every(Number.isFinite)
    && bbox[0] >= -180 && bbox[2] <= 180 && bbox[1] >= -90 && bbox[3] <= 90
    && bbox[0] < bbox[2] && bbox[1] < bbox[3];
}

export function validateAdminRows(rows, { country, counts, requiredLevels = [0], standaloneTaiwanCount = 0 } = {}) {
  const failures = [];
  const warnings = [];
  const observedCounts = Object.fromEntries([0, 1, 2, 3].map((level) => [level, rows.filter((row) => row.level === level).length]));
  if (!rows.length) failures.push(`no active records for ${country}`);
  if (observedCounts[0] !== 1) failures.push(`expected one ADM0 for ${country}, found ${observedCounts[0]}`);
  for (const level of [0, 1, 2, 3]) {
    if (counts && (!Number.isInteger(counts[level]) || counts[level] !== observedCounts[level])) {
      failures.push(`ADM${level} count differs from fetched rows (expected ${counts[level]}, fetched ${observedCounts[level]}); retry on a stable snapshot`);
    }
    if (requiredLevels.includes(level) && !observedCounts[level]) failures.push(`required ADM${level} is missing`);
    else if (!observedCounts[level]) warnings.push(`ADM${level} is absent; confirm whether it exists in this country's administrative model`);
  }
  const byId = new Map();
  const missingChinese = { 0: 0, 1: 0, 2: 0, 3: 0 };
  const siblingNames = new Map();
  for (const row of rows) {
    const id = String(row.id || '');
    if (!id || byId.has(id)) failures.push(`duplicate or empty id: ${id || '<empty>'}`);
    byId.set(id, row);
    if (row.country_iso3 !== country) failures.push(`wrong country on ${id}`);
    if (!Number.isInteger(row.level) || row.level < 0 || row.level > 3) failures.push(`invalid level on ${id}`);
    if (!String(row.name_en || '').trim()) failures.push(`empty name on ${id}`);
    if (!String(row.source_version || '').trim()) failures.push(`missing source version on ${id}`);
    if (!validBbox(row.bbox)) failures.push(`invalid bbox on ${id}`);
    if (row.level === 0 && row.parent_id != null) failures.push(`ADM0 has a parent: ${id}`);
    if (row.level > 0 && !row.parent_id) failures.push(`missing parent for ADM${row.level}: ${id}`);
    if (country === 'CHN' && row.level in missingChinese && !hasChineseLabel(row)) missingChinese[row.level] += 1;
    if (row.parent_id) {
      const key = `${row.parent_id}\u0000${normalized(String(row.name_en || ''))}`;
      // Bbox overlap alone is not proof of duplicate polygons: flag for review.
      if (siblingNames.has(key)) warnings.push(`same-name siblings require geometry review: ${siblingNames.get(key)}, ${id}`);
      siblingNames.set(key, id);
    }
  }
  for (const row of rows) {
    if (row.level <= 0 || !row.parent_id) continue;
    const parent = byId.get(String(row.parent_id));
    if (!parent) failures.push(`parent not found for ${row.id}: ${row.parent_id}`);
    else if (parent.level !== row.level - 1) failures.push(`wrong parent level for ${row.id}`);
  }
  if (country === 'CHN') {
    if (standaloneTaiwanCount > 0) failures.push('standalone TWN ADM0 exists outside CHN; this violates the configured product hierarchy');
    if (!rows.some((row) => row.level === 1 && hasName(row, ['台湾省', '台湾', 'Taiwan', 'Taiwan Province']))) failures.push('CHN ADM1 is missing Taiwan Province');
    for (const [level, count] of Object.entries(missingChinese)) {
      if (count) failures.push(`CHN ADM${level}: ${count} records lack a Chinese display name`);
    }
    const province = rows.find((row) => row.level === 1 && hasName(row, ['内蒙古自治区', '内蒙古', 'Inner Mongolia', 'Nei Mongol', 'Nei Mongol Autonomous Region']));
    if (observedCounts[2] > 0 || requiredLevels.includes(2)) {
      if (!province) failures.push('CHN semantic canary: Inner Mongolia ADM1 is missing');
      else {
        const children = rows.filter((row) => row.parent_id === province.id && row.level === 2);
        if (children.length !== 12) failures.push(`CHN semantic canary: Inner Mongolia must have 12 prefecture-level children (9 cities and 3 leagues), found ${children.length}`);
        for (const aliases of prefectures) {
          const matches = children.filter((row) => hasName(row, aliases));
          if (matches.length !== 1) failures.push(`CHN semantic canary: expected one ${aliases[0]} under Inner Mongolia, found ${matches.length}`);
        }
        const ordos = children.find((row) => hasName(row, prefectures[8]));
        if (ordos && (observedCounts[3] > 0 || requiredLevels.includes(3))) {
          const dalat = rows.filter((row) => row.level === 3 && row.parent_id === ordos.id && hasName(row, ['达拉特旗', 'Dalat', 'Dalat Banner', 'Dalateqi']));
          if (dalat.length !== 1) failures.push('CHN semantic canary: expected one Dalat Banner ADM3 under Ordos ADM2');
        }
      }
    }
  }
  return { failures, warnings, counts: observedCounts, missingChinese };
}

export async function readAllAdminPages(fetchPage, { pageSize = 1000, maxRows = 100000 } = {}) {
  const rows = [];
  const seen = new Set();
  for (;;) {
    // The caller must use level.asc,id.asc. Respect smaller upstream page caps.
    const page = await fetchPage(rows.length, pageSize);
    if (!Array.isArray(page)) throw new Error('directory response is not an array');
    if (!page.length) return rows;
    if (rows.length + page.length > maxRows) throw new Error(`directory exceeds ${maxRows} rows; audit stopped, not passed`);
    for (const row of page) {
      if (!row.id || seen.has(row.id)) throw new Error('empty or repeated id across pages; retry on a stable snapshot');
      seen.add(row.id);
    }
    rows.push(...page);
  }
}
