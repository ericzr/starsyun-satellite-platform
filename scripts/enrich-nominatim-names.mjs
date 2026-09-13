#!/usr/bin/env node

/**
 * Enrich existing admin_areas rows with OSM Nominatim namedetails.
 *
 * This is a controlled, resumable back-office job. It never creates or
 * removes an administrative area and never changes geometry or hierarchy.
 * Nominatim's namedetails are used as a multilingual name source only.
 * The default one-second delay is intentional: respect the public service
 * usage policy and run large jobs in a persistent server session.
 */

import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const args = new Map(process.argv.slice(2).map((value) => {
  const match = value.match(/^--([^=]+)=(.*)$/u);
  return match ? [match[1], match[2]] : [value.replace(/^--/u, ''), 'true'];
}));

const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/u, '');
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const countryFilter = String(args.get('country') || 'ALL').toUpperCase();
const languages = new Set(String(args.get('languages') || 'zh,en,ja,fr,es,de,pt,ru,ko,ar')
  .split(',').map((value) => value.trim().toLowerCase().replace(/_/gu, '-').split('-')[0]).filter(Boolean));
const limit = Math.max(1, Number(args.get('limit') || 0));
const delayMs = Math.max(1000, Number(args.get('delay-ms') || 1100));
const retries = Math.max(0, Number(args.get('retries') || 3));
const apply = args.get('apply') === 'true';
const userAgent = process.env.STARSYUN_NOMINATIM_USER_AGENT || 'StarSyun-admin-localization/1.0';
const outputPath = resolve(root, String(args.get('output') || '.codex-tmp/admin-nominatim-name-patch.ndjson'));
const reportPath = resolve(root, String(args.get('report') || '.codex-tmp/admin-nominatim-name-report.json'));

function fail(message) {
  throw new Error(message);
}

function headers(extra = {}) {
  return {
    apikey: secret,
    ...(secret.startsWith('sb_') ? {} : { Authorization: `Bearer ${secret}` }),
    Accept: 'application/json',
    ...extra,
  };
}

function normalize(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/gu, '').toLowerCase()
    .replace(/[^a-z0-9\u3400-\u9fff]+/gu, '');
}

function iso2For(row, iso2ByIso3) {
  return String(row.country_iso2 || iso2ByIso3[String(row.country_iso3 || '').toUpperCase()] || '').toLowerCase();
}

function languageValue(namedetails, language) {
  const exact = namedetails[`name:${language}`];
  if (exact) return exact;
  const regional = Object.entries(namedetails).find(([key, value]) => key.startsWith(`name:${language}-`) && value);
  return regional?.[1];
}

async function listRows() {
  if (!supabaseUrl || !secret) fail('SUPABASE_URL and a server-only SUPABASE_SECRET_KEY are required');
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const scope = countryFilter === 'ALL' ? '' : `&country_iso3=eq.${encodeURIComponent(countryFilter)}`;
    const response = await fetch(`${supabaseUrl}/rest/v1/admin_areas?select=id,country_iso2,country_iso3,level,name_en,name_local&is_active=eq.true&order=id.asc&limit=1000&offset=${offset}${scope}`, {
      headers: headers(),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) fail(`Supabase admin directory query failed (${response.status})`);
    const page = await response.json();
    if (!Array.isArray(page)) fail('Supabase admin directory query returned a non-list response');
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

async function nominatim(row, iso2) {
  const query = new URLSearchParams({
    format: 'jsonv2',
    limit: '1',
    namedetails: '1',
    countrycodes: iso2,
    q: row.name_en,
  });
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${query.toString()}`, {
        headers: { Accept: 'application/json', 'User-Agent': userAgent },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.status === 429 || response.status >= 500) throw new Error(`HTTP ${response.status}`);
      if (!response.ok) return null;
      const results = await response.json();
      const result = Array.isArray(results) ? results[0] : null;
      if (!result?.namedetails || typeof result.namedetails !== 'object') return null;
      const canonical = result.namedetails['name:en'] || result.namedetails.name || result.name;
      if (!canonical || (normalize(canonical) !== normalize(row.name_en) && normalize(result.name) !== normalize(row.name_en))) return null;
      return result.namedetails;
    } catch (error) {
      if (attempt >= retries) return null;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, Math.min(30_000, 1000 * (2 ** attempt))));
    }
  }
  return null;
}

async function applyPatches(patches) {
  for (const patch of patches) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const response = await fetch(`${supabaseUrl}/rest/v1/admin_areas?id=eq.${encodeURIComponent(patch.id)}`, {
          method: 'PATCH',
          headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
          body: JSON.stringify({ name_local: patch.name_local }),
          signal: AbortSignal.timeout(60_000),
        });
        if (response.ok) {
          lastError = undefined;
          break;
        }
        lastError = new Error(`HTTP ${response.status}`);
      } catch (error) {
        lastError = error;
      }
      if (attempt < retries) await new Promise((resolveDelay) => setTimeout(resolveDelay, Math.min(30_000, 1000 * (2 ** attempt))));
    }
    if (lastError) fail(`Nominatim name patch failed for ${patch.id}: ${lastError.message}`);
  }
}

const iso2ByIso3 = JSON.parse(await readFile(resolve(root, 'src/app/data/country-iso2.json'), 'utf8'));
const rows = (await listRows()).filter((row) => [1, 2, 3].includes(Number(row.level)) && iso2For(row, iso2ByIso3));
const selected = limit ? rows.slice(0, limit) : rows;
const patches = [];
const unmatched = [];
for (const row of selected) {
  const existing = row.name_local && typeof row.name_local === 'object' ? { ...row.name_local } : {};
  if (['zh', 'en', 'ja', 'fr', 'es', 'de', 'pt', 'ru', 'ko', 'ar'].every((language) => !languages.has(language) || existing[language])) continue;
  const namedetails = await nominatim(row, iso2For(row, iso2ByIso3));
  if (!namedetails) {
    unmatched.push({ id: row.id, country_iso3: row.country_iso3, level: row.level, name_en: row.name_en });
  } else {
    const merged = { ...existing };
    for (const language of languages) {
      const value = languageValue(namedetails, language);
      if (value && !merged[language]) merged[language] = value;
    }
    if (Object.keys(merged).length > Object.keys(existing).length) patches.push({ id: row.id, name_local: merged });
  }
  await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
}

await mkdir(resolve(outputPath, '..'), { recursive: true });
await writeFile(outputPath, `${patches.map((patch) => JSON.stringify(patch)).join('\n')}${patches.length ? '\n' : ''}`);
await writeFile(reportPath, `${JSON.stringify({ source: 'OpenStreetMap Nominatim namedetails', source_url: 'https://nominatim.openstreetmap.org/', source_license: 'ODbL 1.0; attribution required', country: countryFilter, languages: [...languages], selected_rows: selected.length, patched_rows: patches.length, unmatched_rows: unmatched.length, unmatched_sample: unmatched.slice(0, 100), output: outputPath, applied: apply }, null, 2)}\n`);
console.log(`Nominatim name enrichment: ${patches.length} rows ready; ${unmatched.length} rows unmatched.`);
console.log(`Patch: ${outputPath}`);
console.log(`Report: ${reportPath}`);
if (apply && patches.length) {
  await applyPatches(patches);
  console.log(`Applied Nominatim names to ${patches.length} admin rows.`);
} else if (!apply) {
  console.log('Dry run only. Review the report and pass --apply to update Supabase.');
}
