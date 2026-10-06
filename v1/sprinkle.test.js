import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseCSV, loadEmoticons, allTags, poolsFor, makeIndex, findEmoticons,
  sprinkleAtSpace, spaceSlotsInRange, retoneEdit, pickEmoticons, mergeEdits, applyEdit, mapPosition,
} from './sprinkle.js';

const csv = readFileSync(new URL('../data/emoticons.csv', import.meta.url), 'utf8');
const EMOS = loadEmoticons(csv);
const INDEX = makeIndex(EMOS);
const seq = (...vals) => { let i = 0; return () => vals[i++ % vals.length]; };

// Text typed so far + the space just typed; returns the result of sprinkling "A", or null.
function onSpace(before) {
  const text = before + ' ';
  const edit = sprinkleAtSpace(text, before.length, INDEX, 'A');
  return edit && applyEdit(text, edit);
}

test('parseCSV handles quotes, escaped quotes, commas, newlines, CRLF and BOM', () => {
  const rows = parseCSV('﻿a,b\r\n"x, ""y""",z\n"multi\nline",\n');
  assert.deepEqual(rows, [['a', 'b'], ['x, "y"', 'z'], ['multi\nline', '']]);
});

test('loadEmoticons reads every column but Name and Type as a tag column', () => {
  const emos = loadEmoticons('Emoticons,Name,Type,Emotion 1,Fourth\n" (x,y) ",n,Face,happy,LOVE\n"(x,y)",dup,face,sad,\n');
  assert.deepEqual(emos, [{ text: '(x,y)', name: 'n', type: 'face', tags: ['happy', 'love', 'sad'] }]);
});

test('real CSV: quoted emoticons with commas survive, tags are found', () => {
  const texts = EMOS.map((e) => e.text);
  assert.ok(texts.includes('ദ്ദി(｡•̀ ,<)~✩‧₊'));
  assert.ok(texts.includes('( ,,⩌\'︿\'⩌ꐦ,,)'));
  assert.ok(texts.includes('( •̀ ᴖ •́ )'), 'leading space trimmed');
  assert.deepEqual(allTags(EMOS), ['happy', 'shy', 'sad', 'love', 'angry'], 'emotion tags only');
  assert.equal(poolsFor(EMOS, null).flat().length, EMOS.length);
  assert.ok(poolsFor(EMOS, 'sad').flat().every((t) => EMOS.find((e) => e.text === t).tags.includes('sad')));
});

test('poolsFor splits a tone into one pool per type', () => {
  const typeOf = (t) => EMOS.find((e) => e.text === t).type;
  const pools = poolsFor(EMOS, 'sad');
  assert.deepEqual(pools.map((p) => typeOf(p[0])).sort(), ['face', 'sparkle']);
  for (const p of pools) assert.ok(p.every((t) => typeOf(t) === typeOf(p[0])));
  assert.equal(poolsFor(EMOS, 'angry').length, 1, 'no empty sparkle pool');
});

test('a space after a word is a home for an emoticon', () => {
  assert.equal(onSpace('hello'), 'hello A ');
  assert.equal(onSpace('Hi there'), 'Hi there A ');
  assert.equal(onSpace('Hi!'), 'Hi! A ');
  assert.equal(onSpace('He said "go."'), 'He said "go." A ');
});

test('no emoticon where there is no word to follow', () => {
  assert.equal(onSpace(''), null, 'leading space');
  assert.equal(onSpace('hi '), null, 'second space in a row');
  assert.equal(onSpace('hi\n'), null, 'start of a new line');
  assert.equal(onSpace('--'), null, 'punctuation only');
  assert.equal(sprinkleAtSpace('hello world', 5, INDEX, ''), null, 'empty pool');
  assert.equal(sprinkleAtSpace('hello', 5, INDEX, 'A'), null, 'not a space');
});

test('emoticons are not stacked onto emoticons', () => {
  assert.equal(onSpace('Hi (˶>⩊<˶)'), null, 'the word just typed is an emoticon');
  assert.equal(sprinkleAtSpace('Hi (˶>⩊<˶) there', 2, INDEX, 'A'), null, 'an emoticon already follows');
  assert.equal(sprinkleAtSpace('Hi  (˶>⩊<˶) there', 2, INDEX, 'A'), null, 'even across extra spaces');
  assert.equal(applyEdit('Hi there (˶>⩊<˶)', sprinkleAtSpace('Hi there (˶>⩊<˶)', 2, INDEX, 'A')), 'Hi A there (˶>⩊<˶)');
});

test('an emoticon lands between the finished word and the space', () => {
  const text = 'one two three';
  const edit = sprinkleAtSpace(text, 3, INDEX, '(˶>⩊<˶)');
  assert.equal(applyEdit(text, edit), 'one (˶>⩊<˶) two three');
  assert.equal(mapPosition(4, edit), 12, 'caret after the space moves along');
  assert.equal(mapPosition(3, edit), 3, 'caret before the space stays');
});

test('paste: every space in the pasted range is a candidate', () => {
  const text = 'Pre one two\nthree four';
  assert.deepEqual(spaceSlotsInRange(text, 4, text.length), [7, 17]);
  assert.deepEqual(spaceSlotsInRange(text, 0, text.length), [3, 7, 17]);
  assert.deepEqual(spaceSlotsInRange(text, 0, 0), []);
});

test('retoneEdit swaps every emoticon in the text for a fresh one', () => {
  const text = 'Hi (˶>⩊<˶) there TᴖT friend';
  const edit = retoneEdit(text, INDEX, (n) => Array.from({ length: n }, (_, i) => `<${i}>`));
  assert.equal(applyEdit(text, edit), 'Hi <0> there <1> friend');
  assert.equal(retoneEdit('nothing to retone', INDEX, () => []), null);
  assert.equal(retoneEdit(text, INDEX, () => []), null, 'an empty pool leaves the text alone');
});

test('mergeEdits combines paste insertions into one', () => {
  const text = 'one two three';
  const edits = [3, 7].map((p) => sprinkleAtSpace(text, p, INDEX, 'A'));
  assert.equal(applyEdit(text, mergeEdits(text, edits)), 'one A two A three');
  assert.equal(mergeEdits(text, []), null);
});

test('pickEmoticons avoids repeats until the pool runs out', () => {
  const got = pickEmoticons([['a', 'b', 'c']], 3, Math.random);
  assert.equal(new Set(got).size, 3);
  assert.equal(pickEmoticons([['a']], 3).length, 3);
  assert.deepEqual(pickEmoticons([], 3), []);
  assert.deepEqual(pickEmoticons([[], []], 3), []);
  assert.deepEqual(pickEmoticons([['a', 'b']], 1, seq(0.99)), ['b']);
});

test('pickEmoticons chooses between pools with equal odds', () => {
  assert.deepEqual(pickEmoticons([['f'], ['s1', 's2', 's3', 's4']], 2, seq(0.1, 0, 0.9, 0)), ['f', 's1']);
  assert.deepEqual(pickEmoticons([[], ['s']], 2), ['s', 's'], 'empty pools are skipped');
  const got = pickEmoticons([['f'], Array.from({ length: 50 }, (_, i) => `s${i}`)], 4000);
  const faces = got.filter((t) => t === 'f').length;
  assert.ok(faces > 1700 && faces < 2300, `about half faces, got ${faces}`);
});

test('findEmoticons respects grapheme boundaries', () => {
  // "TᴖT" followed by a combining mark is not a standalone emoticon.
  assert.deepEqual(findEmoticons('x TᴖT́ y', INDEX), []);
  assert.deepEqual(findEmoticons('x TᴖT y', INDEX), [[2, 5]]);
});
