import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const runtimeArg = process.argv.find((value) => value.startsWith('--runtime-env='));
const runtimePath = runtimeArg ? resolve(root, runtimeArg.slice('--runtime-env='.length)) : null;
const errors = [];

function requireFile(relativePath) {
  if (!existsSync(resolve(root, relativePath))) errors.push(`missing ${relativePath}`);
}

for (const migration of [
  '001_create_inquiries.sql',
  '002_create_quotes.sql',
  '003_create_orders.sql',
  '004_add_payment_intents.sql',
  '005_create_delivery_assets.sql',
  '006_create_delivery_downloads.sql',
  '007_create_platform_foundation.sql',
  '008_business_workflow_functions.sql',
  '009_order_quote_items.sql',
  '010_create_public_downloads.sql',
  '011_normalize_paypal_provider.sql',
]) {
  requireFile(`supabase/migrations/${migration}`);
}
for (const artifact of [
  'dist/index.html',
  'dist-server/server.js',
  'package.json',
  'scripts/import-geoboundaries.mjs',
  'scripts/check-admin-data.mjs',
])
  requireFile(artifact);

function parseEnv(path) {
  const values = new Map();
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/u)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/u);
    if (match) {
      const raw = match[2];
      const quoted = raw.match(/^(['"])(.*?)\1/u);
      values.set(match[1], quoted ? quoted[2] : raw.split('#')[0].trim());
    }
  }
  return values;
}

// This command validates self-hosted releases, not the GitHub Pages demo.
// Vite gives process variables priority over dotenv files; inspecting only
// .env.production misses shell and .env.production.local overrides.
const buildValues = new Map();
for (const name of ['.env', '.env.local', '.env.production', '.env.production.local']) {
  const path = resolve(root, name);
  if (existsSync(path)) {
    for (const [key, value] of parseEnv(path)) buildValues.set(key, value);
  }
}
if (process.env.VITE_ENABLE_MOCK_DATA !== undefined) {
  buildValues.set('VITE_ENABLE_MOCK_DATA', process.env.VITE_ENABLE_MOCK_DATA);
}
const mockValue = (buildValues.get('VITE_ENABLE_MOCK_DATA') || '').trim();
if (/^true(?:\s*#.*)?$/iu.test(mockValue) || mockValue.includes('$')) {
  errors.push('effective build configuration enables mock data or has an unresolved mock-data value');
}
if (process.env.STARSYUN_DEPLOY_TARGET === 'github-pages') {
  errors.push('GitHub Pages build target is not allowed for a self-hosted release');
}

// Check the artifact too: a Pages build must fail even when the variable used
// to build it is no longer present in the preflight process.
const indexPath = resolve(root, 'dist/index.html');
if (existsSync(indexPath)) {
  const html = readFileSync(indexPath, 'utf8');
  const assets = [];
  for (const match of html.matchAll(/<(script|link)\b[^>]*>/giu)) {
    const tag = match[0];
    const attribute = (name) => tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'iu'))?.[1];
    if (match[1].toLowerCase() === 'script' && attribute('type') === 'module') {
      assets.push(attribute('src') || '');
    } else if (match[1].toLowerCase() === 'link' && ['stylesheet', 'modulepreload'].includes(attribute('rel'))) {
      assets.push(attribute('href') || '');
    }
  }
  if (/<base\b/iu.test(html)) errors.push('dist/index.html must not override the self-hosted base URL');
  if (!assets.some((asset) => /\.js(?:[?#]|$)/u.test(asset))) errors.push('dist/index.html is missing a module entry');
  for (const asset of assets) {
    if (!/^\/assets\/[A-Za-z0-9_.-]+(?:[?#].*)?$/u.test(asset)) {
      errors.push('dist/index.html contains a non-root build asset URL');
    } else {
      requireFile(`dist${asset.split(/[?#]/u)[0]}`);
    }
  }
}

if (runtimePath) {
  if (!existsSync(runtimePath)) {
    errors.push(`runtime env file not found: ${runtimeArg.slice('--runtime-env='.length)}`);
  } else {
    const values = parseEnv(runtimePath);
    for (const key of [
      'ALLOWED_ORIGINS',
      'SUPABASE_URL',
      'SUPABASE_SECRET_KEY',
      'SUPABASE_PUBLISHABLE_KEY',
      'ADMIN_EMAILS',
      'ADMIN_PASSWORD_SHA256',
      'AUTH_SESSION_SECRET',
    ]) {
      const value = values.get(key);
      if (!value || value.startsWith('replace-with-') || value.includes('your-project'))
        errors.push(`runtime env is missing ${key}`);
    }
    if ((values.get('ALLOWED_ORIGINS') || '').includes('*'))
      errors.push('ALLOWED_ORIGINS must not contain * in production');
    const hasCos = ['COS_SECRET_ID', 'COS_SECRET_KEY', 'COS_REGION', 'COS_DELIVERY_BUCKET'].every(
      (key) => values.get(key),
    );
    if (!hasCos) errors.push('COS delivery variables are incomplete');
  }
}

const productionEnv = resolve(root, '.env.production');
if (
  existsSync(productionEnv) &&
  /VITE_ENABLE_MOCK_DATA\s*=\s*true\b/iu.test(readFileSync(productionEnv, 'utf8'))
) {
  errors.push('.env.production enables mock data');
}

if (errors.length) {
  console.error('release preflight failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    runtimePath
      ? `release preflight passed (${runtimeArg.slice('--runtime-env='.length)})`
      : 'release artifact preflight passed',
  );
}
