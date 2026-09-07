#!/usr/bin/env node

/**
 * Import a validated N159 staging file into Supabase.
 *
 * This command is intentionally read-only by default.  Pass --apply only
 * after reviewing the staging report and the target project.  The importer
 * writes parents before children and never deactivates an existing row unless
 * --deactivate-legacy is also supplied.
 *
 * Examples:
 *   node scripts/import-n159-admin.mjs \
 *     --input=.codex-tmp/n159-china.ndjson \
 *     --report=.codex-tmp/n159-china-report.json
 *
 *   SUPABASE_URL=https://... SUPABASE_SECRET_KEY=... \
 *   node scripts/import-n159-admin.mjs \
 *     --input=.codex-tmp/n159-china.ndjson \
 *     --report=.codex-tmp/n159-china-report.json \
 *     --apply
 */

import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const argumentsMap = new Map(process.argv.slice(2).map((value) => {
  const match = value.match(/^--([^=]+)=(.*)$/u);
  return match ? [match[1], match[2]] : [value.replace(/^--/u, ''), 'true'];
}));

const inputPath = resolve(root, String(argumentsMap.get('input') || '.codex-tmp/n159-china.ndjson'));
const reportPath = resolve(root, String(argumentsMap.get('report') || '.codex-tmp/n159-china-report.json'));
const apply = argumentsMap.get('apply') === 'true';
const deactivateLegacy = argumentsMap.get('deactivate-legacy') === 'true';
const requestedBatchSize = Number(argumentsMap.get('batch-size') || 50);
if (!Number.isInteger(requestedBatchSize) || requestedBatchSize < 1) fail('batch-size must be a positive integer');
const batchLimit = Math.min(100, requestedBatchSize);

function fail(message) {
  throw new Error(message);
}

async function fileExists(path) {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateRecord(row, index, ids) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) fail(`line ${index}: record must be an object`);
  const level = Number(row.level);
  if (!Number.isInteger(level) || level < 0 || level > 3) fail(`line ${index}: invalid level`);
  if (typeof row.id !== 'string' || !/^MNR-N159-CHN-ADM[0-3]-[A-Za-z0-9_-]+$/u.test(row.id)) {
    fail(`line ${index}: invalid N159 id`);
  }
  if (ids.has(row.id)) fail(`line ${index}: duplicate id ${row.id}`);
  ids.add(row.id);
  if (row.country_iso3 !== 'CHN' || row.country_iso2 !== 'CN') fail(`line ${index}: country must be CHN/CN`);
  if (row.source !== 'MNR-N159' || row.source_version !== '2023') fail(`line ${index}: unexpected source metadata`);
  if (typeof row.name_en !== 'string' || !row.name_en.trim()) fail(`line ${index}: name_en is required`);
  if (!row.name_local || typeof row.name_local !== 'object' || typeof row.name_local['zh-Hans'] !== 'string' || !row.name_local['zh-Hans'].trim()) {
    fail(`line ${index}: zh-Hans name is required`);
  }
  if (!Array.isArray(row.bbox) || row.bbox.length !== 4 || !row.bbox.every(isFiniteNumber)) fail(`line ${index}: invalid bbox`);
  if (!isFiniteNumber(row.centroid_lon) || !isFiniteNumber(row.centroid_lat)) fail(`line ${index}: invalid centroid`);
  if (!row.geometry || typeof row.geometry !== 'object' || !['Polygon', 'MultiPolygon'].includes(row.geometry.type)) {
    fail(`line ${index}: invalid geometry`);
  }
  if (level === 0 && row.parent_id !== null) fail(`line ${index}: ADM0 parent must be null`);
  if (level > 0 && typeof row.parent_id !== 'string') fail(`line ${index}: ADM${level} parent is required`);
  if (Number(row.id.match(/ADM([0-3])/u)?.[1]) !== level) fail(`line ${index}: id/level mismatch`);
  return row;
}

async function readStaging() {
  if (!(await fileExists(inputPath))) fail(`staging file not found: ${inputPath}`);
  const lines = (await readFile(inputPath, 'utf8')).split(/\r?\n/u).filter((line) => line.trim());
  if (!lines.length) fail('staging file is empty');
  const ids = new Set();
  const rows = lines.map((line, index) => {
    try {
      return validateRecord(JSON.parse(line), index + 1, ids);
    } catch (error) {
      if (error instanceof SyntaxError) fail(`line ${index + 1}: invalid JSON`);
      throw error;
    }
  });
  const rowById = new Map(rows.map((row) => [row.id, row]));
  for (const row of rows) {
    if (row.parent_id && !rowById.has(row.parent_id)) fail(`${row.id}: parent ${row.parent_id} is missing`);
    if (row.parent_id && rowById.get(row.parent_id).level !== row.level - 1) {
      fail(`${row.id}: parent must be exactly one administrative level above`);
    }
  }
  const taiwan = rows.filter((row) => row.level === 1 && row.name_local['zh-Hans'] === '台湾省');
  if (taiwan.length !== 1 || taiwan[0].parent_id !== 'MNR-N159-CHN-ADM0-CN') fail('台湾省 must be one ADM1 child of China ADM0');
  if (rows.some((row) => row.country_iso3 === 'TWN' || row.id.includes('-TWN-'))) fail('standalone TWN rows are not allowed');
  return rows;
}

function toDatabaseRecord(row) {
  return {
    id: row.id,
    source: row.source,
    source_version: row.source_version,
    source_license: row.source_license || null,
    source_url: row.source_url || null,
    country_iso2: row.country_iso2,
    country_iso3: row.country_iso3,
    level: row.level,
    parent_id: row.parent_id,
    name_en: row.name_en,
    name_local: row.name_local,
    centroid_lon: row.centroid_lon,
    centroid_lat: row.centroid_lat,
    bbox: row.bbox,
    geometry: row.geometry,
    is_active: true,
  };
}

function headers(key, extra = {}) {
  return {
    apikey: key,
    ...(key.startsWith('sb_') ? {} : { Authorization: `Bearer ${key}` }),
    ...extra,
  };
}

async function writeBatch(url, key, batch) {
  const response = await fetch(`${url}/rest/v1/admin_areas?on_conflict=id`, {
    method: 'POST',
    headers: headers(key, {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    }),
    body: JSON.stringify(batch),
    signal: AbortSignal.timeout(60_000),
  });
  if (response.ok) return;
  const detail = await response.text();
  if (batch.length > 1 && /57014|statement timeout|canceling statement/iu.test(detail)) {
    const midpoint = Math.ceil(batch.length / 2);
    await writeBatch(url, key, batch.slice(0, midpoint));
    await writeBatch(url, key, batch.slice(midpoint));
    return;
  }
  throw new Error(`Supabase upsert failed (${response.status}): ${detail}`);
}

async function listExistingChinaIds(url, key) {
  const response = await fetch(`${url}/rest/v1/admin_areas?select=id&country_iso3=eq.CHN&is_active=eq.true&limit=50000`, {
    headers: headers(key, { Accept: 'application/json' }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`Supabase existing-row query failed (${response.status}): ${await response.text()}`);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error('Supabase existing-row query returned a non-list response');
  return rows.map((row) => row.id).filter((id) => typeof id === 'string');
}

async function deactivateBatch(url, key, ids) {
  const filter = ids.map((id) => encodeURIComponent(id)).join(',');
  const response = await fetch(`${url}/rest/v1/admin_areas?id=in.(${filter})`, {
    method: 'PATCH',
    headers: headers(key, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
    body: JSON.stringify({ is_active: false }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`Supabase legacy-row deactivation failed (${response.status}): ${await response.text()}`);
}

async function applyRows(rows) {
  const url = (process.env.SUPABASE_URL || '').replace(/\/$/u, '');
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) fail('SUPABASE_URL and server-only SUPABASE_SECRET_KEY are required with --apply');
  const ordered = [...rows].sort((left, right) => left.level - right.level || left.id.localeCompare(right.id));
  for (let level = 0; level <= 3; level += 1) {
    const records = ordered.filter((row) => row.level === level).map(toDatabaseRecord);
    for (let offset = 0; offset < records.length; offset += batchLimit) {
      await writeBatch(url, key, records.slice(offset, offset + batchLimit));
      console.log(`upserted ADM${level}: ${Math.min(offset + batchLimit, records.length)}/${records.length}`);
    }
  }
  if (deactivateLegacy) {
    const incoming = new Set(rows.map((row) => row.id));
    const stale = (await listExistingChinaIds(url, key)).filter((id) => !incoming.has(id));
    for (let offset = 0; offset < stale.length; offset += batchLimit) {
      await deactivateBatch(url, key, stale.slice(offset, offset + batchLimit));
    }
    console.log(`deactivated legacy active CHN rows: ${stale.length}`);
  }
}

const rows = await readStaging();
const counts = Object.fromEntries([0, 1, 2, 3].map((level) => [level, rows.filter((row) => row.level === level).length]));
if (await fileExists(reportPath)) {
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  if (report.ready_for_uploader !== true) fail('staging report is not ready_for_uploader');
}
console.log(`N159 staging validated: ${rows.length} rows (ADM0=${counts[0]}, ADM1=${counts[1]}, ADM2=${counts[2]}, ADM3=${counts[3]})`);
if (!apply) {
  console.log('Dry run only. No Supabase write performed. Pass --apply after reviewing the report.');
} else {
  await applyRows(rows);
  console.log('N159 Supabase import complete. Run npm run check:admin-data -- --country=CHN --require-levels=0,1,2,3 next.');
}
