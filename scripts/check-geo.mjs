import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'starsyun-geo-'));

try {
  const output = join(temporaryDirectory, 'geo.mjs');
  await build({
    entryPoints: [resolve(root, 'src/app/lib/geo.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: output,
    logLevel: 'silent',
  });

  const { parseCoords, bboxAreaKm2, coverageRatio } = await import(`file://${output}`);
  const coordinateCases = new Map([
    ['g109.13348034,40.18848105', [109.13348034, 40.18848105]],
    ['40.18848105,109.13348034', [109.13348034, 40.18848105]],
    ['lat: 31.2304, lon: 121.4737', [121.4737, 31.2304]],
    ['N31.2304 E121.4737', [121.4737, 31.2304]],
    ['31.2304N,121.4737E', [121.4737, 31.2304]],
    ['W109.1,N40.2', [-109.1, 40.2]],
    ['geo:-6.208,106.845', [106.845, -6.208]],
    ['-109.1,-40.2', [-109.1, -40.2]],
    ['40.2/109.1', [109.1, 40.2]],
  ]);

  for (const [input, expected] of coordinateCases) {
    const actual = parseCoords(input);
    if (!actual || actual.some((value, index) => Math.abs(value - expected[index]) > 1e-9)) {
      throw new Error(`coordinate parse failed: ${input} -> ${actual}`);
    }
  }
  if (parseCoords('91,181') !== null || parseCoords('12N,23N') !== null) {
    throw new Error('invalid coordinates were accepted');
  }

  const normalArea = bboxAreaKm2([10, 10, 11, 11]);
  const antimeridianArea = bboxAreaKm2([179, 10, -179, 11]);
  if (!(normalArea > 0 && antimeridianArea > 0 && antimeridianArea < normalArea * 3)) {
    throw new Error('antimeridian bbox area regression');
  }
  const coverage = coverageRatio([179, 10, -179, 11], [179.5, 10, -179.5, 11]);
  if (Math.abs(coverage - 0.5) > 0.02) throw new Error(`antimeridian coverage regression: ${coverage}`);

  console.log('geo regression checks passed');
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
