import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseCSV, loadEmoticons, allTags, poolFor, makeIndex, findEmoticons,
  sentenceBeforeSpace, sentenceBeforeNewline, finalSentence, sentencesInRange,
  slotsFor, pickEmoticons, sprinkleEdit, mergeEdits, applyEdit, mapPosition,
} from './sprinkle.js';

const csv = readFileSync(new URL('../data/emoticons.csv', import.meta.url), 'utf8');
const EMOS = loadEmoticons(csv);
const INDEX = makeIndex(EMOS);
const seq = (...vals) => { let i = 0; return () => vals[i++ % vals.length]; };

// Text typed so far + the whitespace just typed; returns the confirmed sentence text or null.
function onSpace(before) {
  const text = before + ' ';
  const s = sentenceBeforeSpace(text, before.length, INDEX);
  return s && text.slice(s.start, s.end);
}

test('parseCSV handles quotes, escaped quotes, commas, newlines, CRLF and BOM', () => {
  const rows = parseCSV('﻿a,b\r\n"x, ""y""",z\n"multi\nline",\n');
  assert.deepEqual(rows, [['a', 'b'], ['x, "y"', 'z'], ['multi\nline', '']]);
});

test('loadEmoticons reads every non-name column as a tag column', () => {
  const emos = loadEmoticons('Emoticons,Name,Emotion tag(s),Second tags,Fourth\n" (x,y) ",n,Face,happy,LOVE\n"(x,y)",dup,,sad,\n');
  assert.deepEqual(emos, [{ text: '(x,y)', name: 'n', tags: ['face', 'happy', 'love', 'sad'] }]);
});

test('real CSV: quoted emoticons with commas survive, tags are found', () => {
  const texts = EMOS.map((e) => e.text);
  assert.ok(texts.includes('ദ്ദി(｡•̀ ,<)~✩‧₊'));
  assert.ok(texts.includes('( ,,⩌\'︿\'⩌ꐦ,,)'));
  assert.ok(texts.includes('( •̀ ᴖ •́ )'), 'leading space trimmed');
  for (const t of ['sparkle', 'flower', 'face', 'happy', 'love', 'sad', 'shy', 'angry']) {
    assert.ok(allTags(EMOS).includes(t), t);
  }
  assert.equal(poolFor(EMOS, []).length, EMOS.length);
  assert.ok(poolFor(EMOS, ['sad', 'angry']).every((t) => EMOS.find((e) => e.text === t).tags.some((g) => g === 'sad' || g === 'angry')));
});

test('space after a terminator confirms a sentence', () => {
  assert.equal(onSpace('Hi!'), 'Hi!');
  assert.equal(onSpace('Hi! My name is Cheese.'), 'My name is Cheese.');
  assert.equal(onSpace('Really?!'), 'Really?!');
  assert.equal(onSpace('He said "go."'), 'He said "go."');
  assert.equal(onSpace('(It was fun.)'), '(It was fun.)');
});

test('abbreviations, initials, ellipses and decimals do not end sentences', () => {
  assert.equal(onSpace('I saw Dr.'), null);
  assert.equal(onSpace('I saw Dr. Smith today.'), 'I saw Dr. Smith today.');
  assert.equal(onSpace('We met J.'), null);
  assert.equal(onSpace('We met J. K. Rowling.'), 'We met J. K. Rowling.');
  assert.equal(onSpace('Wait...'), null);
  assert.equal(onSpace('Wait… what?'), 'Wait… what?');
  assert.equal(onSpace('Pi is 3.14 ok.'), 'Pi is 3.14 ok.');
  assert.equal(onSpace('Fruit, e.g.'), null);
  assert.equal(onSpace('Me and I.'), 'Me and I.');
});

test('terminators inside emoticons are ignored', () => {
  assert.equal(onSpace('Hi (*´▽`*)❀.'), null);
  assert.equal(onSpace('Ugh (｡•̀ ⤙ •́ ｡ꐦ) !!!'), null);
  assert.equal(onSpace('Hi! (*´▽`*)❀. My name is Bob.'), 'My name is Bob.');
  assert.equal(onSpace('Hi! ꒰ᐢ.   ̫ .ᐢ꒱ Bye.'), 'Bye.');
});

test('already-sprinkled sentences are not sprinkled again', () => {
  assert.equal(onSpace('Hi there (˶>⩊<˶) friend.'), null);
  const text = 'Hi!  (˶>⩊<˶) Bye.';
  assert.equal(sentenceBeforeSpace(text, 3, INDEX), null, 're-typed space before existing emoticon');
});

test('Enter ends a sentence even without punctuation, and after an ellipsis', () => {
  const t1 = 'hello there\n';
  assert.deepEqual(sentenceBeforeNewline(t1, 11, INDEX), { start: 0, end: 11 });
  const t2 = 'First. so...\n';
  assert.deepEqual(sentenceBeforeNewline(t2, 12, INDEX), { start: 7, end: 12 });
  const t3 = 'Done! (˶>⩊<˶) \n';
  assert.equal(sentenceBeforeNewline(t3, 14, INDEX), null, 'nothing new on that line');
  assert.equal(sentenceBeforeNewline('\n', 0, INDEX), null);
});

test('finalSentence flushes a terminated last sentence only', () => {
  assert.deepEqual(finalSentence('One. Two!', INDEX), { start: 5, end: 9 });
  assert.equal(finalSentence('One. Two', INDEX), null);
  assert.equal(finalSentence('Dr.', INDEX), null);
  assert.deepEqual(finalSentence('Hmm...  ', INDEX), { start: 0, end: 6 });
});

test('pasted text: every complete sentence in range', () => {
  const pasted = 'One. Dr. Who is here! Last line\nNext.';
  const text = 'Pre ' + pasted;
  const found = sentencesInRange(text, 4, text.length, INDEX).map((s) => text.slice(s.start, s.end));
  assert.deepEqual(found, ['Pre One.', 'Dr. Who is here!', 'Last line', 'Next.']);
});

test('slots sit after tokens followed by whitespace, plus the end', () => {
  const text = 'Angeles, CA is far.';
  assert.deepEqual(slotsFor(text, { start: 0, end: text.length }, INDEX), [8, 11, 14, 19]);
});

test('sprinkleEdit spreads over distinct slots and stacks extras at the end', () => {
  const text = 'Hi there.';
  const s = { start: 0, end: 9 };
  assert.equal(applyEdit(text, sprinkleEdit(text, s, ['A'], INDEX, seq(0))), 'Hi A there.');
  assert.equal(applyEdit(text, sprinkleEdit(text, s, ['A', 'B', 'C', 'D'], INDEX, seq(0))), 'Hi A there. B C D');
  assert.equal(applyEdit(text, sprinkleEdit(text, s, ['A'], INDEX, seq(0.99))), 'Hi there. A');
});

test('cursor mapping keeps the caret after the sprinkled sentence', () => {
  const text = 'Hi! ';
  const edit = sprinkleEdit(text, { start: 0, end: 3 }, ['(˶>⩊<˶)'], INDEX, seq(0));
  const out = applyEdit(text, edit);
  assert.equal(out, 'Hi! (˶>⩊<˶) ');
  assert.equal(mapPosition(4, edit), out.length);
  assert.equal(mapPosition(0, edit), 0);
});

test('mergeEdits combines paste edits into one', () => {
  const text = 'A. B.';
  const edits = [{ from: 0, to: 2, insert: 'A. x' }, { from: 3, to: 5, insert: 'B. y' }];
  assert.equal(applyEdit(text, mergeEdits(text, edits)), 'A. x B. y');
});

test('pickEmoticons avoids repeats until the pool runs out', () => {
  const got = pickEmoticons(['a', 'b', 'c'], 3, Math.random);
  assert.equal(new Set(got).size, 3);
  assert.equal(pickEmoticons(['a'], 3).length, 3);
  assert.deepEqual(pickEmoticons([], 3), []);
});

test('findEmoticons respects grapheme boundaries', () => {
  // "TᴖT" followed by a combining mark is not a standalone emoticon.
  assert.deepEqual(findEmoticons('x TᴖT́ y', INDEX), []);
  assert.deepEqual(findEmoticons('x TᴖT y', INDEX), [[2, 5]]);
});
