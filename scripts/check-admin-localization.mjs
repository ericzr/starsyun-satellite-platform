#!/usr/bin/env node

/**
 * Read-only audit for localized administrative names.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SECRET_KEY=... \
 *     node scripts/check-admin-localization.mjs --languages=zh,en,ja
 */

const args = new Map(process.argv.slice(2).map((value) => {
  const match = value.match(/^--([^=]+)=(.*)$/u);
  return match ? [match[1], match[2]] : [value.replace(/^--/u, ''), 'true'];
}));
const url = (process.env.SUPABASE_URL || '').replace(/\/$/u, '');
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const languages = String(args.get('languages') || 'zh,en,ja').split(',').map((value) => value.trim()).filter(Boolean);
const output = String(args.get('output') || '.codex-tmp/admin-localization-report.json');
if (!url || !key) throw new Error('SUPABASE_URL and a server-only SUPABASE_SECRET_KEY are required');

const headers = {
  apikey: key,
  ...(key.startsWith('sb_') ? {} : { Authorization: `Bearer ${key}` }),
  Accept: 'application/json',
};

async function readRows() {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const params = new URLSearchParams({
      select: 'id,country_iso3,level,name_en,name_local',
      is_active: 'eq.true',
      level: 'in.(1,2,3)',
      order: 'country_iso3.asc,level.asc,id.asc',
      limit: '1000',
      offset: String(offset),
    });
    const response = await fetch(`${url}/rest/v1/admin_areas?${params.toString()}`, { headers, signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`admin_areas query failed (${response.status})`);
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error('admin_areas query returned a non-list response');
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

const rows = await readRows();
const byCountry = new Map();
for (const row of rows) {
  const country = String(row.country_iso3 || '???');
  const level = Number(row.level);
  const entry = byCountry.get(country) || { total: 0, levels: {}, missing: {} };
  entry.total += 1;
  entry.levels[level] = (entry.levels[level] || 0) + 1;
  const local = row.name_local && typeof row.name_local === 'object' ? row.name_local : {};
  for (const language of languages) {
    if (!local[language] && !(language === 'zh' && local['zh-Hans'])) {
      entry.missing[language] = (entry.missing[language] || 0) + 1;
    }
  }
  byCountry.set(country, entry);
}

const countries = Object.fromEntries([...byCountry.entries()].map(([country, value]) => [country, value]));
const report = {
  generatedAt: new Date().toISOString(),
  languages,
  totalRows: rows.length,
  countries,
};
const { mkdir, writeFile } = await import('node:fs/promises');
const { dirname } = await import('node:path');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Localization audit: ${rows.length} ADM1-ADM3 rows across ${byCountry.size} countries`);
for (const [country, value] of [...byCountry.entries()].sort(([left], [right]) => left.localeCompare(right))) {
  const missing = languages.map((language) => `${language}:${value.missing[language] || 0}`).join(' ');
  console.log(`${country} total=${value.total} ${missing}`);
}
console.log(`Report: ${output}`);
