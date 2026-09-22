import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const directory = await mkdtemp(join(tmpdir(), 'starsyun-explore-test-'));
after(() => rm(directory, { recursive: true, force: true }));
async function load(entry, name) {
  const outfile = join(directory, `${name}.mjs`);
  await build({
    entryPoints: [resolve(entry)],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'silent',
  });
  return import(pathToFileURL(outfile).href);
}
const { makeDrawnPolygon, unwrapPoint } = await load('src/app/lib/draw-polygon.ts', 'polygon');
const { makeCaptureWindow, todayInTimeZone, validTimeZone } = await load(
  'src/app/lib/capture-window.ts',
  'time',
);
const { parseInquiryInput, insertInquiry, buildInquiry } = await load(
  'api/_lib/inquiries.ts',
  'inquiry',
);

test('polygon preserves vertices, closes ring, calculates bounds', () => {
  const result = makeDrawnPolygon([
    [10, 10],
    [12, 10],
    [11, 12],
  ]);
  assert.deepEqual(result.bbox, [10, 10, 12, 12]);
  assert.deepEqual(result.feature.geometry.coordinates[0], [
    [10, 10],
    [12, 10],
    [11, 12],
    [10, 10],
  ]);
});
test('invalid and self-intersecting polygons cannot finish', () => {
  for (const points of [
    [
      [0, 0],
      [1, 1],
    ],
    [
      [0, 0],
      [1, 1],
      [2, 2],
    ],
    [
      [0, 0],
      [2, 2],
      [0, 2],
      [2, 0],
    ],
    [
      [0, 0],
      [1, 0],
      [1, 0],
      [0, 1],
    ],
    [
      [0, 0],
      [NaN, 1],
      [2, 0],
    ],
  ])
    assert.throws(() => makeDrawnPolygon(points));
});
test('concave polygons and antimeridian world copies remain narrow', () => {
  assert.doesNotThrow(() =>
    makeDrawnPolygon([
      [0, 0],
      [2, 0],
      [1, 1],
      [2, 2],
      [0, 2],
    ]),
  );
  assert.deepEqual(unwrapPoint([-179, 10], [179, 10]), [181, 10]);
  assert.equal(
    makeDrawnPolygon([
      [179, 10],
      [181, 10],
      [180, 12],
    ]).bbox[2],
    181,
  );
});
test('single local day uses its IANA offset', () => {
  const w = makeCaptureWindow('2026-09-24', '2026-09-24', 'Asia/Shanghai');
  assert.equal(w.startUtc, '2026-09-23T16:00:00.000Z');
  assert.equal(w.endUtcExclusive, '2026-09-24T16:00:00.000Z');
});
test('today follows the selected AOI time zone', () => {
  const instant = Date.parse('2026-09-22T23:30:00.000Z');
  assert.equal(todayInTimeZone('Asia/Shanghai', instant), '2026-09-23');
  assert.equal(todayInTimeZone('America/Los_Angeles', instant), '2026-09-22');
});
test('DST days are 23 or 25 hours, not always 24', () => {
  for (const [date, hours] of [
    ['2026-03-08', 23],
    ['2026-11-01', 25],
  ]) {
    const w = makeCaptureWindow(date, date, 'America/New_York');
    assert.equal((Date.parse(w.endUtcExclusive) - Date.parse(w.startUtc)) / 3600000, hours);
  }
});
test('bad dates/zones, reversed dates and skipped local dates rejected', () => {
  assert.equal(validTimeZone('Invalid/Zone'), false);
  for (const args of [
    ['2026-02-30', '2026-03-01', 'UTC'],
    ['2026-03-02', '2026-03-01', 'UTC'],
    ['2011-12-30', '2011-12-30', 'Pacific/Apia'],
    ['2026-09-24', '2026-09-24', 'Invalid/Zone'],
  ])
    assert.throws(() => makeCaptureWindow(...args));
});
test('server recomputes UTC rather than trusting client timestamps; legacy input still works', async () => {
  const base = { type: 'tasking', name: 'Test', phone: 'test', company: 'Test' };
  assert.equal(parseInquiryInput(base).captureWindow, undefined);
  const geometry = {
    type: 'Polygon',
    coordinates: [
      [
        [10, 10],
        [12, 10],
        [11, 12],
        [10, 10],
      ],
    ],
  };
  const input = parseInquiryInput({
    ...base,
    aoiGeometry: geometry,
    captureWindow: {
      startDate: '2026-09-24',
      endDate: '2026-09-24',
      timeZone: 'Asia/Shanghai',
      startUtc: 'tampered',
    },
  });
  assert.equal(input.captureWindow.startUtc, '2026-09-23T16:00:00.000Z');
  assert.deepEqual(input.aoiGeometry, geometry);
  assert.throws(() => parseInquiryInput({ ...base, captureWindow: { timeZone: 'Invalid' } }));
  const oldFetch = globalThis.fetch;
  const oldUrl = process.env.SUPABASE_URL,
    oldKey = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL = 'https://example.invalid';
  process.env.SUPABASE_SECRET_KEY = 'test-only';
  let saved;
  globalThis.fetch = async (_, options) => {
    saved = JSON.parse(options.body);
    return new Response(JSON.stringify([saved]), { status: 201 });
  };
  try {
    const result = await insertInquiry(buildInquiry(input));
    assert.deepEqual(saved.capture_window, input.captureWindow);
    assert.deepEqual(saved.aoi_geometry, geometry);
    assert.deepEqual(result.captureWindow, input.captureWindow);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = oldKey;
  }
});
test('footer has opaque non-scrolling surface; desktop and mobile wrappers are unpadded', async () => {
  const panel = await readFile('src/app/components/FilterPanel.tsx', 'utf8');
  const explore = await readFile('src/app/pages/Explore.tsx', 'utf8');
  assert.match(panel, /data-testid="filter-actions"/);
  assert.doesNotMatch(panel, /sticky bottom-0|bg-panel\/95/);
  assert.equal((explore.match(/className="min-h-0 flex-1"/g) || []).length, 2);
});
