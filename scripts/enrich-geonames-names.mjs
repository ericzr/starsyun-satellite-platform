#!/usr/bin/env node

/**
 * Enrich existing admin_areas rows with multilingual GeoNames aliases.
 *
 * Boundary geometry and hierarchy remain owned by the approved boundary
 * sources. GeoNames is used only as a names layer, so a translation update
 * never changes an administrative polygon or parent relationship.
 *
 * The command is dry-run by default. It needs the small GeoNames admin code
 * files plus alternateNamesV2.txt (or its zip archive) and a server-only
 * Supabase key. See docs/ADMIN_NAME_LOCALIZATION.md for the preparation and
 * review flow.
 */

import { createReadStream } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createInterface } from 'node:readline';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const args = new Map(process.argv.slice(2).map((value) => {
  const match = value.match(/^--([^=]+)=(.*)$/u);
  return match ? [match[1], match[2]] : [value.replace(/^--/u, ''), 'true'];
}));

const url = (process.env.SUPABASE_URL || '').replace(/\/$/u, '');
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const countryFilter = String(args.get('country') || 'ALL').toUpperCase();
const languages = new Set(String(args.get('languages') || 'zh,zh-Hans,en,fr,es,de,pt,ru,ja,ko,ar').split(',').map((value) => canonicalLanguage(value)).filter(Boolean));
const admin1Path = resolve(root, String(args.get('admin1') || '.codex-tmp/geonames/admin1CodesASCII.txt'));
const admin2Path = resolve(root, String(args.get('admin2') || '.codex-tmp/geonames/admin2Codes.txt'));
const allCountriesPath = resolve(root, String(args.get('all-countries') || '.codex-tmp/geonames/allCountries.zip'));
const alternatePath = resolve(root, String(args.get('alternate') || '.codex-tmp/geonames/alternateNamesV2.zip'));
const outputPath = resolve(root, String(args.get('output') || '.codex-tmp/admin-geonames-name-patch.ndjson'));
const reportPath = resolve(root, String(args.get('report') || '.codex-tmp/admin-geonames-name-report.json'));
const apply = args.get('apply') === 'true';
const applyConcurrency = Math.max(1, Math.min(8, Number(args.get('concurrency') || 4)));
const retryCount = Math.max(0, Number(args.get('retries') || 5));

function fail(message) {
  throw new Error(message);
}

async function requiredFile(path, label) {
  try {
    await access(path, constants.R_OK);
  } catch {
    fail(`${label} not found: ${path}`);
  }
}

function headers(extra = {}) {
  return {
    apikey: key,
    ...(key.startsWith('sb_') ? {} : { Authorization: `Bearer ${key}` }),
    Accept: 'application/json',
    ...extra,
  };
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/\b(autonomous|province|municipality|prefecture|prefektur|ken|county|city|state|region|oblast|district|department|governorate|republic|kingdom|territory|island|islands)\b/gu, '')
    .replace(/[^a-z0-9\u3400-\u9fff]+/gu, '');
}

function canonicalLanguage(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/_/gu, '-');
  if (!normalized) return '';
  if (normalized === 'zh' || normalized.startsWith('zh-')) return 'zh';
  return normalized.split('-')[0];
}

function parseCodeLine(line, source) {
  const [code, name, asciiName, id] = line.split('\t');
  if (!code || !name || !id || !/^\d+$/u.test(id)) return null;
  const parts = code.split('.');
  const level = parts.length === 2 ? 1 : parts.length === 3 ? 2 : null;
  if (!level) return null;
  const countryIso2 = parts[0].toUpperCase();
  return {
    source,
    code,
    countryIso2,
    level,
    geonameId: id,
    names: new Set([normalizeName(name), normalizeName(asciiName)]),
  };
}

async function readCodeIndex(path, source) {
  const index = new Map();
  const text = await readFile(path, 'utf8');
  for (const line of text.split(/\r?\n/u)) {
    const entry = parseCodeLine(line, source);
    if (!entry) continue;
    for (const name of entry.names) {
      if (!name) continue;
      const key = `${entry.countryIso2}:${entry.level}:${name}`;
      const values = index.get(key) || [];
      values.push(entry);
      index.set(key, values);
    }
  }
  return index;
}

async function readAllCountriesAdminIndex(path, { exactKeys, nameKeys } = {}) {
  try {
    await access(path, constants.R_OK);
  } catch {
    return { index: new Map(), nameIndex: new Map() };
  }
  const index = new Map();
  const nameIndex = new Map();
  const input = allCountriesStream(path);
  const reader = createInterface({ input, crlfDelay: Infinity });
  for await (const line of reader) {
    const fields = line.split('\t');
    const [geonameId, name, asciiName, , , , featureClass, featureCode, countryIso2] = fields;
    if (featureClass !== 'A' || !/^ADM[1-4]$/u.test(featureCode || '') || !geonameId || !countryIso2 || !name) continue;
    const level = Number(featureCode.slice(3));
    const names = new Set([normalizeName(name), normalizeName(asciiName)]);
    for (const normalized of names) {
      if (!normalized) continue;
      const nameKey = `${countryIso2.toUpperCase()}:${normalized}`;
      const entryKey = `${countryIso2.toUpperCase()}:${level}:${normalized}`;
      if ((exactKeys && !exactKeys.has(entryKey)) && (nameKeys && !nameKeys.has(nameKey))) continue;
      const entry = { source: 'allCountries', countryIso2: countryIso2.toUpperCase(), level, geonameId, names };
      const values = index.get(entryKey) || [];
      values.push(entry);
      index.set(entryKey, values);
      const nameValues = nameIndex.get(nameKey) || [];
      nameValues.push(entry);
      nameIndex.set(nameKey, nameValues);
    }
  }
  return { index, nameIndex };
}

async function listAdminRows() {
  if (!url || !key) fail('SUPABASE_URL and a server-only SUPABASE_SECRET_KEY are required');
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const scope = countryFilter === 'ALL' ? '' : `&country_iso3=eq.${encodeURIComponent(countryFilter)}`;
    const response = await fetch(`${url}/rest/v1/admin_areas?select=id,country_iso2,country_iso3,level,name_en,name_local&is_active=eq.true&order=id.asc&limit=1000&offset=${offset}${scope}`, {
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

function archiveStream(path, member) {
  if (/\.zip$/iu.test(path)) {
    const child = spawn('unzip', ['-p', path, member], { stdio: ['ignore', 'pipe', 'inherit'] });
    child.on('error', (error) => fail(`cannot read GeoNames archive: ${error.message}`));
    return child.stdout;
  }
  return createReadStream(path, { encoding: 'utf8' });
}

function alternateStream(path) {
  return archiveStream(path, 'alternateNamesV2.txt');
}

function allCountriesStream(path) {
  return archiveStream(path, 'allCountries.txt');
}

async function readAlternates(path, targetIds) {
  const names = new Map();
  const input = alternateStream(path);
  const reader = createInterface({ input, crlfDelay: Infinity });
  for await (const line of reader) {
    const [alternateId, geonameId, language, value, preferred, shortName] = line.split('\t');
    const languageKey = canonicalLanguage(language);
    if (!targetIds.has(geonameId) || !languages.has(languageKey) || !value) continue;
    const score = (preferred === '1' ? 0 : 10) + (shortName === '1' ? 0 : 1) + value.length / 10000;
    const byLanguage = names.get(geonameId) || new Map();
    const current = byLanguage.get(languageKey);
    if (!current || score < current.score) byLanguage.set(languageKey, { value, score, alternateId });
    names.set(geonameId, byLanguage);
  }
  return names;
}

async function applyPatch(patches) {
  const concurrency = applyConcurrency;
  let cursor = 0;
  async function worker() {
    while (cursor < patches.length) {
      const patch = patches[cursor++];
      let lastError;
      for (let attempt = 0; attempt <= retryCount; attempt += 1) {
        try {
          const response = await fetch(`${url}/rest/v1/admin_areas?id=eq.${encodeURIComponent(patch.id)}`, {
            method: 'PATCH',
            headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
            body: JSON.stringify({ name_local: patch.name_local }),
            signal: AbortSignal.timeout(60_000),
          });
          if (response.ok) {
            lastError = undefined;
            break;
          }
          const detail = `HTTP ${response.status}`;
          if (![408, 425, 429].includes(response.status) && response.status < 500) fail(`GeoNames name patch failed (${detail}) for ${patch.id}`);
          lastError = new Error(detail);
          if (attempt < retryCount) {
            const retryAfter = Number(response.headers.get('retry-after'));
            const delay = Number.isFinite(retryAfter) ? Math.min(60_000, retryAfter * 1000) : Math.min(60_000, 1000 * (2 ** attempt));
            await new Promise((resolveDelay) => setTimeout(resolveDelay, delay));
          }
        } catch (error) {
          lastError = error;
          if (attempt < retryCount) await new Promise((resolveDelay) => setTimeout(resolveDelay, Math.min(60_000, 1000 * (2 ** attempt))));
        }
      }
      if (lastError) fail(`GeoNames name patch failed (${lastError.message}) for ${patch.id}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, patches.length) }, () => worker()));
}

await requiredFile(admin1Path, 'GeoNames admin1CodesASCII.txt');
await requiredFile(admin2Path, 'GeoNames admin2Codes.txt');
await requiredFile(alternatePath, 'GeoNames alternateNamesV2.txt or archive');
const iso2ByIso3 = JSON.parse(await readFile(resolve(root, 'src/app/data/country-iso2.json'), 'utf8'));
const rows = await listAdminRows();
const targetExactKeys = new Set();
const targetNameKeys = new Set();
for (const row of rows) {
  const countryIso2 = String(row.country_iso2 || iso2ByIso3[String(row.country_iso3 || '').toUpperCase()] || '').toUpperCase();
  if (![1, 2, 3].includes(Number(row.level)) || !countryIso2) continue;
  const normalized = normalizeName(row.name_en);
  targetExactKeys.add(`${countryIso2}:${Number(row.level)}:${normalized}`);
  targetNameKeys.add(`${countryIso2}:${normalized}`);
}
const [admin1Index, admin2Index, allCountriesData] = await Promise.all([
  readCodeIndex(admin1Path, 'admin1'),
  readCodeIndex(admin2Path, 'admin2'),
  readAllCountriesAdminIndex(allCountriesPath, { exactKeys: targetExactKeys, nameKeys: targetNameKeys }),
]);
const allCountriesIndex = allCountriesData.index;
const allCountriesNameIndex = allCountriesData.nameIndex;
const targetIds = new Set();
const matches = [];
const unmatched = [];
for (const row of rows) {
  const countryIso2 = String(row.country_iso2 || iso2ByIso3[String(row.country_iso3 || '').toUpperCase()] || '').toUpperCase();
  if (![1, 2, 3].includes(Number(row.level)) || !countryIso2) continue;
  const level = Number(row.level);
  const index = level === 1 ? admin1Index : level === 2 ? admin2Index : allCountriesIndex;
  const keyName = `${countryIso2}:${row.level}:${normalizeName(row.name_en)}`;
  let candidates = index.get(keyName) || [];
  // The boundary provider's level can differ from GeoNames for municipalities
  // and special districts. Only accept a unique all-level fallback match.
  if (candidates.length !== 1 && allCountriesIndex.size) {
    candidates = allCountriesIndex.get(keyName) || [];
    if (candidates.length !== 1) {
      const normalizedName = normalizeName(row.name_en);
      const byName = allCountriesNameIndex.get(`${countryIso2}:${normalizedName}`) || [];
      if (byName.length === 1) candidates = byName;
    }
  }
  if (candidates.length !== 1) {
    unmatched.push({ id: row.id, level: row.level, name_en: row.name_en, candidates: candidates.length });
    continue;
  }
  targetIds.add(candidates[0].geonameId);
  matches.push({ row, geonameId: candidates[0].geonameId });
}

const alternates = await readAlternates(alternatePath, targetIds);
const patches = [];
for (const { row, geonameId } of matches) {
  const aliases = alternates.get(geonameId);
  if (!aliases?.size) continue;
  const merged = row.name_local && typeof row.name_local === 'object' ? { ...row.name_local } : {};
  for (const [language, value] of aliases) {
    if (!merged[language]) merged[language] = value.value;
  }
  if (Object.keys(merged).length > Object.keys(row.name_local || {}).length) {
    patches.push({ id: row.id, geoname_id: geonameId, name_local: merged });
  }
}

await mkdir(resolve(outputPath, '..'), { recursive: true });
await writeFile(outputPath, `${patches.map((patch) => JSON.stringify(patch)).join('\n')}${patches.length ? '\n' : ''}`);
const report = {
  source: 'GeoNames alternateNamesV2',
  source_url: 'https://download.geonames.org/export/dump/alternateNamesV2.zip',
  source_license: 'CC BY 4.0; attribution required',
  country: countryFilter,
  languages: [...languages],
  apply_concurrency: applyConcurrency,
  retries: retryCount,
  fetched_rows: rows.length,
  matched_rows: matches.length,
  all_countries_available: allCountriesIndex.size > 0,
  patched_rows: patches.length,
  unmatched_rows: unmatched.length,
  unmatched_sample: unmatched.slice(0, 100),
  output: outputPath,
  applied: apply,
};
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`GeoNames name enrichment: ${patches.length} rows ready; ${unmatched.length} rows require review.`);
console.log(`Patch: ${outputPath}`);
console.log(`Report: ${reportPath}`);
if (apply && patches.length) {
  await applyPatch(patches);
  console.log(`Applied GeoNames names to ${patches.length} admin rows.`);
} else if (!apply) {
  console.log('Dry run only. Review the report and pass --apply to update Supabase.');
}
