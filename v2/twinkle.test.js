import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FRAMES, FRAMES_ALT, COLS, ROWS, frameCells } from './twinkle.js';

const csv = readFileSync(new URL('../data/emoticons.csv', import.meta.url), 'utf8');

const ALL = [...FRAMES, ...FRAMES_ALT];

test('every frame is a full ROWS × COLS grid', () => {
  for (const [i, frame] of ALL.entries()) {
    assert.equal(frame.rows.length, ROWS, `frame ${i}`);
    for (const row of frame.rows) assert.equal(Array.from(row).length, COLS, `frame ${i}: "${row}"`);
  }
});

test('frames only use glyphs from the emoticon list, so the fonts cover them', () => {
  const glyphs = new Set(ALL.flatMap((f) => f.rows.flatMap((row) => Array.from(row))));
  glyphs.delete(' ');
  for (const ch of glyphs) assert.ok(csv.includes(ch), `${ch} (U+${ch.codePointAt(0).toString(16)}) is not in emoticons.csv`);
});

test('frameCells flattens to one cell per grid square and scales only the center', () => {
  const cells = frameCells({ rows: FRAMES[0].rows, center: 2, opacity: 0.5 });
  assert.equal(cells.length, COLS * ROWS);
  assert.deepEqual(cells[2 * COLS + 3], { ch: '⋆', scale: 2, opacity: 0.5 });
  assert.deepEqual(cells[0], { ch: '', scale: 1, opacity: 0.5 });
});

test('frameCells enlarges the extra cells listed in scale', () => {
  const cells = frameCells({ rows: FRAMES_ALT[0].rows, center: 2, scale: [[0, 6, 1.5]] });
  assert.equal(cells[3 + 2 * COLS].scale, 2);
  assert.equal(cells[6].scale, 1.5);
  assert.equal(cells[5].scale, 1);
});
