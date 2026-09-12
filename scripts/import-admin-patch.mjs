#!/usr/bin/env node

/** Apply a reviewed ADM patch without touching unrelated administrative rows. */
import { readFile } from 'node:fs/promises';

const args = new Map(process.argv.slice(2).map((value) => {
  const match = value.match(/^--([^=]+)=(.*)$/u);
  return match ? [match[1], match[2]] : [value.replace(/^--/u, ''), 'true'];
}));
const input = String(args.get('input') || '');
const apply = args.get('apply') === 'true';
if (!input) throw new Error('--input is required');

const rows = (await readFile(input, 'utf8')).split(/\r?\n/u).filter(Boolean).map((line, index) => {
  let row;
  try { row = JSON.parse(line); } catch { throw new Error(`line ${index + 1}: invalid JSON`); }
  if (!row || typeof row !== 'object' || !row.id || !row.parent_id || row.level !== 2) throw new Error(`line ${index + 1}: invalid ADM2 patch row`);
  if (row.country_iso3 !== 'CHN' || row.country_iso2 !== 'CN') throw new Error(`line ${index + 1}: patch must be CHN/CN`);
  if (row.parent_id !== 'MNR-N159-CHN-ADM1-710000') throw new Error(`line ${index + 1}: unexpected parent`);
  if (!row.name_en || !row.name_local?.['zh-Hans'] || !row.geometry) throw new Error(`line ${index + 1}: missing bilingual name or geometry`);
  return row;
});
if (rows.length !== 22) throw new Error(`expected 22 Taiwan ADM2 rows, found ${rows.length}`);
console.log(`Taiwan ADM2 patch validated: ${rows.length} rows`);
if (!apply) {
  console.log('Dry run only. Pass --apply to write Supabase.');
  process.exit(0);
}

const url = (process.env.SUPABASE_URL || '').replace(/\/$/u, '');
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!url || !key) throw new Error('SUPABASE_URL and server-only SUPABASE_SECRET_KEY are required with --apply');
const headers = {
  apikey: key,
  ...(key.startsWith('sb_') ? {} : { Authorization: `Bearer ${key}` }),
  'Content-Type': 'application/json',
  Prefer: 'resolution=merge-duplicates,return=minimal',
};
const records = rows.map((row) => ({
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
}));
const response = await fetch(`${url}/rest/v1/admin_areas?on_conflict=id`, {
  method: 'POST', headers, body: JSON.stringify(records), signal: AbortSignal.timeout(60_000),
});
if (!response.ok) throw new Error(`Supabase patch failed (${response.status}): ${await response.text()}`);
console.log(`Taiwan ADM2 patch applied: ${records.length} rows`);
