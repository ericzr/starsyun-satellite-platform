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

for (const migration of ['001_create_inquiries.sql', '002_create_quotes.sql', '003_create_orders.sql', '004_add_payment_intents.sql', '005_create_delivery_assets.sql', '006_create_delivery_downloads.sql']) {
  requireFile(`supabase/migrations/${migration}`);
}
for (const artifact of ['dist/index.html', 'dist-server/server.js', 'package.json']) requireFile(artifact);

function parseEnv(path) {
  const values = new Map();
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/u)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/u);
    if (match) values.set(match[1], match[2].replace(/^['"]|['"]$/gu, ''));
  }
  return values;
}

if (runtimePath) {
  if (!existsSync(runtimePath)) {
    errors.push(`runtime env file not found: ${runtimeArg.slice('--runtime-env='.length)}`);
  } else {
    const values = parseEnv(runtimePath);
    for (const key of ['ALLOWED_ORIGINS', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_PUBLISHABLE_KEY', 'ADMIN_EMAILS', 'ADMIN_PASSWORD_SHA256', 'AUTH_SESSION_SECRET']) {
      const value = values.get(key);
      if (!value || value.startsWith('replace-with-') || value.includes('your-project')) errors.push(`runtime env is missing ${key}`);
    }
    if ((values.get('ALLOWED_ORIGINS') || '').includes('*')) errors.push('ALLOWED_ORIGINS must not contain * in production');
    const hasCos = ['COS_SECRET_ID', 'COS_SECRET_KEY', 'COS_REGION', 'COS_DELIVERY_BUCKET'].every((key) => values.get(key));
    if (!hasCos) errors.push('COS delivery variables are incomplete');
  }
}

const productionEnv = resolve(root, '.env.production');
if (existsSync(productionEnv) && /VITE_ENABLE_MOCK_DATA\s*=\s*true\b/iu.test(readFileSync(productionEnv, 'utf8'))) {
  errors.push('.env.production enables mock data');
}

if (errors.length) {
  console.error('release preflight failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(runtimePath ? `release preflight passed (${runtimeArg.slice('--runtime-env='.length)})` : 'release artifact preflight passed');
}
