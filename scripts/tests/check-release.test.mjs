import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, copyFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

async function fixture(t, overrides = {}) {
  const directory = await mkdtemp(resolve(tmpdir(), 'starsyun-release-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const files = {
    'dist/index.html': '<script type="module" src="/assets/app.js"></script><link rel="stylesheet" href="/assets/app.css">',
    'dist/assets/app.js': 'export {};',
    'dist/assets/app.css': ':root {}',
    'dist-server/server.js': 'export {};',
    'package.json': '{"type":"module"}',
    'scripts/import-geoboundaries.mjs': '',
    'scripts/check-admin-data.mjs': '',
    ...overrides,
  };
  for (const migration of await readdir(resolve(root, 'supabase/migrations'))) {
    files[`supabase/migrations/${migration}`] = '-- test fixture';
  }
  for (const [name, content] of Object.entries(files)) {
    if (content === null) continue;
    const path = resolve(directory, name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }
  await copyFile(resolve(root, 'scripts/check-release.mjs'), resolve(directory, 'scripts/check-release.mjs'));
  return (extraEnv = {}) => {
    const env = { ...process.env };
    delete env.VITE_ENABLE_MOCK_DATA;
    delete env.STARSYUN_DEPLOY_TARGET;
    return spawnSync(process.execPath, ['scripts/check-release.mjs'], {
      cwd: directory, env: { ...env, ...extraEnv }, encoding: 'utf8',
    });
  };
}

test('accepts a packaged server release without source dotenv files', async (t) => {
  const run = await fixture(t);
  assert.equal(run().status, 0);
});

test('rejects process mock override of safe source settings', async (t) => {
  const run = await fixture(t, { '.env.production': 'VITE_ENABLE_MOCK_DATA=false' });
  const result = run({ VITE_ENABLE_MOCK_DATA: 'true' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /effective build configuration enables mock/u);
});

test('rejects production-local mock override', async (t) => {
  const run = await fixture(t, {
    '.env.production': 'VITE_ENABLE_MOCK_DATA=false',
    '.env.production.local': 'VITE_ENABLE_MOCK_DATA=true',
  });
  assert.equal(run().status, 1);
});

test('honors safe process override over local settings', async (t) => {
  const run = await fixture(t, { '.env.production.local': 'VITE_ENABLE_MOCK_DATA=true' });
  assert.equal(run({ VITE_ENABLE_MOCK_DATA: 'false' }).status, 0);
});

test('rejects quoted and exported dotenv overrides with comments', async (t) => {
  const run = await fixture(t, { '.env.production.local': 'export VITE_ENABLE_MOCK_DATA="true" # demo only' });
  assert.equal(run().status, 1);
});

test('fails closed for unresolved mock-data interpolation', async (t) => {
  const run = await fixture(t, { '.env.production.local': 'VITE_ENABLE_MOCK_DATA=${DEMO_ENABLED}' });
  assert.equal(run().status, 1);
});

test('rejects GitHub Pages process target', async (t) => {
  const run = await fixture(t);
  assert.equal(run({ STARSYUN_DEPLOY_TARGET: 'github-pages' }).status, 1);
});

test('rejects a Pages artifact after build environment is removed', async (t) => {
  const run = await fixture(t, {
    'dist/index.html': '<script type="module" src="/starsyun-satellite-platform/assets/app.js"></script>',
  });
  assert.match(run().stderr, /non-root build asset URL/u);
  assert.equal(run().status, 1);
});

test('rejects missing referenced assets', async (t) => {
  const run = await fixture(t, { 'dist/assets/app.js': null });
  assert.match(run().stderr, /missing dist\/assets\/app.js/u);
  assert.equal(run().status, 1);
});

test('rejects base tags and missing module entry', async (t) => {
  const run = await fixture(t, { 'dist/index.html': '<base href="https://example.com/">' });
  assert.equal(run().status, 1);
  assert.match(run().stderr, /base URL/u);
  assert.match(run().stderr, /missing a module entry/u);
});
