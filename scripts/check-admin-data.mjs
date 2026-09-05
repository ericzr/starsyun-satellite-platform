#!/usr/bin/env node

/**
 * Validate an imported admin_areas directory without downloading geometries.
 * Usage: SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/check-admin-data.mjs --country=CHN
 */

const args = new Map(process.argv.slice(2).map((value) => {
  const match = value.match(/^--([^=]+)=(.*)$/u);
  return match ? [match[1], match[2]] : [value.replace(/^--/u, ''), 'true'];
}));
const country = String(args.get('country') || '').trim().toUpperCase();
if (!/^[A-Z]{3}$/.test(country)) {
  console.error('Usage: --country=ISO3 (for example CHN, ARE or SGP)');
  process.exit(2);
}

const url = (process.env.SUPABASE_URL || '').replace(/\/$/u, '');
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!url || !key) {
  console.error('SUPABASE_URL and a server-only SUPABASE_SECRET_KEY are required');
  process.exit(2);
}

const headers = {
  apikey: key,
  ...(key.startsWith('sb_') ? {} : { Authorization: `Bearer ${key}` }),
  Accept: 'application/json',
};

async function request(path, init = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  return response;
}

function parseCount(response) {
  const range = response.headers.get('content-range') || '';
  const match = range.match(/\/(\d+)$/u);
  return match ? Number(match[1]) : null;
}

const failures = [];
const counts = {};
for (const level of [0, 1, 2, 3]) {
  const response = await request(`admin_areas?select=id&country_iso3=eq.${country}&level=eq.${level}&is_active=eq.true&limit=0`, {
    headers: { ...headers, Prefer: 'count=exact' },
  }).catch((error) => {
    failures.push(`ADM${level} query failed: ${error.message}`);
    return null;
  });
  if (response) counts[level] = parseCount(response);
}

const emptyGeometryResponse = await request(`admin_areas?select=id&country_iso3=eq.${country}&is_active=eq.true&geometry=is.null&limit=100`).catch((error) => {
  failures.push(`geometry query failed: ${error.message}`);
  return null;
});
if (emptyGeometryResponse) {
  const emptyGeometryRows = await emptyGeometryResponse.json();
  for (const row of emptyGeometryRows) failures.push(`empty geometry on ${row.id}`);
}

const rowsResponse = await request(`admin_areas?select=id,country_iso3,level,parent_id,name_en,name_local,source_version&country_iso3=eq.${country}&is_active=eq.true&order=level.asc&limit=50000`).catch((error) => {
  failures.push(`directory query failed: ${error.message}`);
  return null;
});
const rows = rowsResponse ? await rowsResponse.json() : [];
const byId = new Map();
for (const row of rows) {
  const id = String(row.id || '');
  if (!id || byId.has(id)) failures.push(`duplicate or empty id: ${id || '<empty>'}`);
  byId.set(id, row);
  const level = Number(row.level);
  if (String(row.country_iso3 || '').toUpperCase() !== country) failures.push(`wrong country on ${id}`);
  if (!Number.isInteger(level) || level < 0 || level > 3) failures.push(`invalid level on ${id}`);
  if (!String(row.name_en || '').trim()) failures.push(`empty name on ${id}`);
  if (!String(row.source_version || '').trim()) failures.push(`missing source version on ${id}`);
  if (level === 0 && row.parent_id != null) failures.push(`ADM0 has a parent: ${id}`);
  if (level > 0 && !row.parent_id) failures.push(`missing parent for ADM${level}: ${id}`);
}
for (const row of rows) {
  const level = Number(row.level);
  if (level > 0 && row.parent_id) {
    const parent = byId.get(String(row.parent_id));
    if (!parent) failures.push(`parent not found for ${row.id}: ${row.parent_id}`);
    else if (Number(parent.level) !== level - 1) failures.push(`wrong parent level for ${row.id}`);
  }
}

const duplicateNames = new Set();
for (const row of rows) {
  if (row.parent_id == null) continue;
  const keyName = `${row.parent_id}\u0000${String(row.name_en || '').trim().toLowerCase()}`;
  if (duplicateNames.has(keyName)) failures.push(`duplicate sibling name: ${row.name_en} (${row.parent_id})`);
  duplicateNames.add(keyName);
}

if (country === 'CHN') {
  const level0 = rows.filter((row) => Number(row.level) === 0);
  if (level0.some((row) => String(row.id).startsWith('TWN-') || String(row.country_iso3).toUpperCase() === 'TWN')) {
    failures.push('Taiwan must not be imported as a standalone country');
  }
  const taiwan = rows.find((row) => Number(row.level) === 1 && /台湾|taiwan/iu.test(`${row.name_en} ${JSON.stringify(row.name_local || {})}`));
  if (!taiwan) failures.push('CHN ADM1 is missing Taiwan Province');
}

for (const level of [0, 1, 2, 3]) console.log(`ADM${level}: ${counts[level] ?? rows.filter((row) => Number(row.level) === level).length}`);
if (failures.length) {
  console.error('admin directory check failed:');
  for (const failure of failures.slice(0, 100)) console.error(`- ${failure}`);
  if (failures.length > 100) console.error(`- ...and ${failures.length - 100} more`);
  process.exit(1);
}
console.log(`admin directory check passed (${country}, ${rows.length} records)`);
