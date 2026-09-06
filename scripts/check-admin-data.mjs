#!/usr/bin/env node
import { readAllAdminPages, validateAdminRows } from './lib/admin-data-validation.mjs';

const args = new Map(process.argv.slice(2).map((value) => {
  const match = value.match(/^--([^=]+)=(.*)$/u);
  return match ? [match[1], match[2]] : [value.replace(/^--/u, ''), 'true'];
}));
const country = String(args.get('country') || '').trim().toUpperCase();
const requiredText = String(args.get('require-levels') || '0');
if (!/^[A-Z]{3}$/u.test(country) || !/^[0-3](,[0-3])*$/u.test(requiredText)) {
  console.error('Usage: --country=ISO3 [--require-levels=0,1,2,3]');
  process.exit(2);
}
const requiredLevels = [...new Set(requiredText.split(',').map(Number))];
const url = (process.env.SUPABASE_URL || '').replace(/\/$/u, '');
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!url || !key) {
  console.error('SUPABASE_URL and a server-only SUPABASE_SECRET_KEY are required');
  process.exit(2);
}
const headers = { apikey: key, ...(key.startsWith('sb_') ? {} : { Authorization: `Bearer ${key}` }) };
async function request(query, count = false) {
  const response = await fetch(`${url}/rest/v1/admin_areas?${query}`, {
    headers: { ...headers, Accept: 'application/json', ...(count ? { Prefer: 'count=exact' } : {}) },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`admin_areas request failed: HTTP ${response.status}`);
  if (!count) return response.json();
  const match = (response.headers.get('content-range') || '').match(/\/(\d+)$/u);
  if (!match) throw new Error('exact row count was not returned');
  return Number(match[1]);
}

try {
  const scope = `country_iso3=eq.${country}&is_active=eq.true`;
  const counts = Object.fromEntries(await Promise.all([0, 1, 2, 3].map(async (level) => [level,
    await request(`select=id&${scope}&level=eq.${level}&limit=0`, true),
  ])));
  const [rows, emptyGeometryCount, standaloneTaiwanCount] = await Promise.all([
    readAllAdminPages((offset, limit) => request(`select=id,country_iso3,level,parent_id,name_en,name_local,bbox,source_version&${scope}&order=level.asc,id.asc&limit=${limit}&offset=${offset}`)),
    request(`select=id&${scope}&geometry=is.null&limit=0`, true),
    country === 'CHN' ? request('select=id&country_iso3=eq.TWN&level=eq.0&is_active=eq.true&limit=0', true) : 0,
  ]);
  const report = validateAdminRows(rows, { country, counts, requiredLevels, standaloneTaiwanCount });
  if (emptyGeometryCount) report.failures.push(`${emptyGeometryCount} records have null geometry`);
  for (const level of [0, 1, 2, 3]) console.log(`ADM${level}: ${counts[level]}`);
  for (const warning of report.warnings.slice(0, 20)) console.warn(`WARN: ${warning}`);
  if (report.warnings.length > 20) console.warn(`...and ${report.warnings.length - 20} more warnings`);
  if (report.failures.length) {
    console.error(`admin directory audit FAILED (${country}; ${report.failures.length} findings):`);
    for (const failure of report.failures.slice(0, 100)) console.error(`- ${failure}`);
    if (report.failures.length > 100) console.error(`...and ${report.failures.length - 100} more failures`);
    process.exitCode = 1;
  } else {
    console.log(`admin directory structural checks and configured canaries passed (${country}, ${rows.length} records)`);
  }
  console.log('Scope: metadata, null geometries and configured CHN canaries only. This does NOT certify all boundaries, translations, source currency or global ADM3 coverage.');
} catch (error) {
  console.error(`admin directory audit could not complete: ${error.message}`);
  process.exitCode = 1;
}
