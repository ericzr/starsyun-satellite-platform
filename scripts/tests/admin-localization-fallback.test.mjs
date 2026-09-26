import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

async function bundle(entry, name) {
  const directory = await mkdtemp(resolve(tmpdir(), 'starsyun-localization-test-'));
  const outfile = resolve(directory, `${name}.mjs`);
  await build({
    entryPoints: [resolve(root, entry)],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    // Bundle the small React dependency imported by the context module so the
    // temporary test module remains self-contained outside the repository.
    logLevel: 'silent',
  });
  return {
    module: await import(`${pathToFileURL(outfile).href}?v=${Date.now()}`),
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}

test('only fully reviewed website languages are publicly selectable', async (t) => {
  const compiled = await bundle('src/app/i18n/index.tsx', 'i18n');
  t.after(compiled.cleanup);
  assert.deepEqual(compiled.module.PUBLIC_LANGUAGE_CODES, ['zh', 'en']);
  assert.equal(compiled.module.isPublicLanguage('zh'), true);
  assert.equal(compiled.module.isPublicLanguage('en'), true);
  for (const incomplete of ['ar', 'es', 'fr', 'pt', 'ru', 'ja', 'ko', 'de']) {
    assert.equal(compiled.module.isPublicLanguage(incomplete), false);
  }
});

test('administrative names retain every row when a translation is missing', async (t) => {
  const compiled = await bundle('src/app/services/admin.ts', 'admin');
  t.after(compiled.cleanup);
  const base = {
    id: 'adm-1',
    countryIso3: 'DEU',
    level: 1,
    nameEn: 'Bavaria',
    nameLocal: {},
  };
  assert.equal(compiled.module.localizedName(base, 'zh'), 'Bavaria');
  assert.equal(compiled.module.localizedName(base, 'ja'), 'Bavaria');
  assert.equal(compiled.module.localizedName({
    ...base,
    nameLocal: { local: 'Bayern' },
  }, 'zh'), 'Bayern');
  assert.equal(compiled.module.localizedName({
    ...base,
    nameLocal: { local: 'Bayern', 'zh-Hans': '巴伐利亚州' },
  }, 'zh'), '巴伐利亚州');
});
