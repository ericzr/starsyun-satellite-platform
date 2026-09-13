import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const map = JSON.parse(await readFile(
  fileURLToPath(new URL('../../src/app/data/country-iso2.json', import.meta.url)),
  'utf8',
));

test('country ISO3 fallback covers the localized country selector canaries', () => {
  assert.equal(map.AFG, 'AF');
  assert.equal(map.ALB, 'AL');
  assert.equal(map.ARE, 'AE');
  assert.equal(map.AUS, 'AU');
  assert.equal(map.CHN, 'CN');
  assert.equal(map.TWN, 'TW');
});

test('ISO fallback is complete for GeoNames country metadata', () => {
  assert.ok(Object.keys(map).length >= 250);
  for (const [iso3, iso2] of Object.entries(map)) {
    assert.match(iso3, /^[A-Z]{3}$/u);
    assert.match(iso2, /^[A-Z]{2}$/u);
  }
});

