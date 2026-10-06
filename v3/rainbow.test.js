import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STOPS, SPOTS, lineColor, ringColor, fieldT } from './rainbow.js';

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

test('lineColor hits every stop, evenly spaced, and clamps at the ends', () => {
  for (const [k, hex] of STOPS.entries()) assert.deepEqual(lineColor(k / (STOPS.length - 1)), rgb(hex));
  assert.deepEqual(lineColor(-1), rgb(STOPS[0]));
  assert.deepEqual(lineColor(2), rgb(STOPS.at(-1)));
});

test('ringColor loops: the last stop runs back into the first', () => {
  assert.deepEqual(ringColor(0), rgb(STOPS[0]));
  assert.deepEqual(ringColor(1), ringColor(0));
  assert.deepEqual(ringColor(2.25), ringColor(0.25));
  assert.deepEqual(ringColor(-0.25), ringColor(0.75));
});

test('with no spots the field is the plain left-to-right rainbow', () => {
  const w = 1600, h = 900;
  for (const x of [0, 400, 800, 1600]) {
    const t = fieldT(x, 300, w, h, []);
    assert.equal(t, (x / w) * 7 / 8);
    assert.deepEqual(ringColor(t), lineColor(x / w));
  }
});

test('far from every spot the field fades back to the plain rainbow', () => {
  const spots = [{ x: 0.5, y: 0.5, r: 0.1 }];
  assert.ok(Math.abs(fieldT(0, 0, 1000, 1000, spots) - 0) < 1e-6);
});

test('a spot changes the field around it', () => {
  const w = 1600, h = 900;
  const [spot] = SPOTS;
  const x = spot.x * w + 0.2 * h, y = spot.y * h;
  assert.ok(Math.abs(fieldT(x, y, w, h) - fieldT(x, y, w, h, [])) > 0.05);
});

test('the field has no seams: neighbouring pixels are close', () => {
  const w = 1200, h = 800;
  for (let y = 0; y < h; y += 7) {
    for (let x = 0; x < w; x += 7) {
      const t = fieldT(x, y, w, h);
      assert.ok(Math.abs(fieldT(x + 1, y, w, h) - t) < 0.01, `x seam at ${x},${y}`);
      assert.ok(Math.abs(fieldT(x, y + 1, w, h) - t) < 0.01, `y seam at ${x},${y}`);
    }
  }
});
