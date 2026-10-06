import {
  loadEmoticons, allTags, poolsFor, makeIndex, pickEmoticons,
  sprinkleAtSpace, spaceSlotsInRange, retoneEdit, mergeEdits, mapPosition,
} from './sprinkle.js';
import { FRAMES, FRAMES_ALT, COLS, ROWS, frameCells } from './twinkle.js';

// Chance that pressing space adds an emoticon, per cuteness level (slider position 1..length):
// 1 in 4 at the low end up to 5 in 12 at the top, in even steps.
const CUTENESS_CHANCES = [6 / 24, 7 / 24, 8 / 24, 9 / 24, 10 / 24];
const DEFAULT_LEVEL = 3;
const RANDOM = 'random';
const HIDDEN_TAGS = ['love'];
const SIDE_LINES_MIN = 5;
const SIDE_LINES_MAX = 22;
const INDENTS = [0, 0, 0, 1, 2, 3, 5];
const FONTS = ['serif', 'Fontdiner Swanky', 'Mr Bedfort', 'Seaweed Script', 'Ribeye', 'Vibes', 'Press Start 2P', 'Sancreek'];

const textarea = document.getElementById('writing');
const dial = document.getElementById('cuteness');
const copyButton = document.getElementById('copy');
const statusEl = document.getElementById('status');
const h1 = document.querySelector('h1');

let currentFontIndex = 0;

let emoticons = [];
let index = makeIndex([]);
let selectedTag = RANDOM;
let busy = false;
let pasteStart = null;

// ---------------------------------------------------------------- data

async function init() {
  try {
    const res = await fetch('../data/emoticons.csv', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    emoticons = loadEmoticons(await res.text());
  } catch (err) {
    console.error('Could not load emoticons', err);
    statusEl.textContent = 'Could not load emoticons. Serve this folder over http.';
    return;
  }
  index = makeIndex(emoticons);
  buildToneSelect([RANDOM, ...allTags(emoticons).filter((t) => !HIDDEN_TAGS.includes(t))]);
  fillSides();
}

// ---------------------------------------------------------------- sprinkling

function currentPools() {
  return poolsFor(emoticons, selectedTag === RANDOM ? null : selectedTag);
}

function currentChance() {
  return CUTENESS_CHANCES[Number(dial.value) - 1] ?? CUTENESS_CHANCES[0];
}

function currentSideLines() {
  const level = Number(dial.value);
  const min = Number(dial.min);
  const max = Number(dial.max);
  const ratio = (level - min) / (max - min);
  return Math.round(SIDE_LINES_MIN + (SIDE_LINES_MAX - SIDE_LINES_MIN) * ratio);
}

const rollForEmoticon = () => Math.random() < currentChance();

/** Replace [from, to) as one native undo step, then put the selection back where it belongs. */
function applyToTextarea(edit) {
  if (!edit) return;
  const previous = document.activeElement;
  const { selectionStart, selectionEnd, selectionDirection } = textarea;
  const scroll = textarea.scrollTop;
  busy = true;
  try {
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(edit.from, edit.to);
    const ok = document.execCommand && document.execCommand('insertText', false, edit.insert);
    if (!ok || textarea.value.slice(edit.from, edit.from + edit.insert.length) !== edit.insert) {
      textarea.setRangeText(edit.insert, edit.from, edit.to, 'preserve');
    }
  } finally {
    busy = false;
  }
  textarea.setSelectionRange(mapPosition(selectionStart, edit), mapPosition(selectionEnd, edit), selectionDirection);
  textarea.scrollTop = scroll;
  if (previous && previous !== textarea) previous.focus({ preventScroll: true });
}

textarea.addEventListener('beforeinput', (e) => {
  if (busy) return;
  pasteStart = e.inputType === 'insertFromPaste' || e.inputType === 'insertFromDrop'
    ? textarea.selectionStart
    : null;
});

textarea.addEventListener('input', (e) => {
  if (!busy && e.inputType.startsWith('insert')) sparkles.forEach((advance) => advance());
  if (busy || e.isComposing || !emoticons.length) return;
  const text = textarea.value;
  const caret = textarea.selectionStart;
  if (caret !== textarea.selectionEnd) return;

  let edit = null;
  if (e.inputType === 'insertText' && text[caret - 1] === ' ') {
    if (rollForEmoticon()) {
      const [emo] = pickEmoticons(currentPools(), 1);
      edit = sprinkleAtSpace(text, caret - 1, index, emo);
    }
  } else if ((e.inputType === 'insertFromPaste' || e.inputType === 'insertFromDrop') && pasteStart !== null) {
    const spots = spaceSlotsInRange(text, pasteStart, caret).filter(rollForEmoticon);
    const picks = pickEmoticons(currentPools(), spots.length);
    edit = mergeEdits(text, spots
      .map((p, i) => sprinkleAtSpace(text, p, index, picks[i]))
      .filter(Boolean));
  }
  pasteStart = null;
  applyToTextarea(edit);
});

// ---------------------------------------------------------------- copy

let statusTimer;
function flash(message) {
  statusEl.textContent = message;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { statusEl.textContent = ''; }, 1600);
}

copyButton.addEventListener('click', async () => {
  const text = textarea.value;
  try {
    await navigator.clipboard.writeText(text);
    flash('Copied! ♡');
  } catch {
    const { selectionStart, selectionEnd } = textarea;
    textarea.select();
    const ok = document.execCommand('copy');
    textarea.setSelectionRange(selectionStart, selectionEnd);
    flash(ok ? 'Copied! ♡' : 'Copy failed');
  }
  currentFontIndex = (currentFontIndex + 1) % FONTS.length;
  h1.style.fontFamily = FONTS[currentFontIndex];
  fillSides();
});

// ---------------------------------------------------------------- cuteness dial

dial.max = String(CUTENESS_CHANCES.length);
dial.value = String(Math.min(DEFAULT_LEVEL, CUTENESS_CHANCES.length));
function paintDial() {
  const min = Number(dial.min), max = Number(dial.max);
  dial.style.setProperty('--p', max > min ? (dial.value - min) / (max - min) : 1);
  const n = Math.round(1 / currentChance());
  dial.setAttribute('aria-valuetext', `Level ${dial.value}: about one emoticon every ${n} words`);
}
dial.addEventListener('input', () => {
  paintDial();
  fillSides();
});
paintDial();

// ---------------------------------------------------------------- tone select (single-select listbox)

const toneButton = document.getElementById('tone-button');
const toneValue = document.getElementById('tone-value');
const toneList = document.getElementById('tone-list');
let activeIndex = 0;

const titleCase = (s) => s.replace(/\b\p{L}/gu, (c) => c.toUpperCase());

function buildToneSelect(tags) {
  toneList.replaceChildren(...tags.map((tag, i) => {
    const li = document.createElement('li');
    li.id = `tone-opt-${i}`;
    li.role = 'option';
    li.dataset.tag = tag;
    li.textContent = titleCase(tag);
    li.addEventListener('mousedown', (e) => e.preventDefault());
    li.addEventListener('click', () => { setActive(i); selectTag(tag); });
    li.addEventListener('mousemove', () => setActive(i));
    return li;
  }));
  renderTone();
}

function options() { return [...toneList.children]; }

function selectTag(tag) {
  closeList();
  if (tag === selectedTag) return;
  selectedTag = tag;
  renderTone();
  retone();
}

/** A new tone re-rolls every emoticon already in the text, and the side columns with them. */
function retone() {
  applyToTextarea(retoneEdit(textarea.value, index, (n) => pickEmoticons(currentPools(), n)));
  fillSides();
}

function renderTone() {
  for (const li of options()) li.setAttribute('aria-selected', String(li.dataset.tag === selectedTag));
  toneValue.textContent = titleCase(selectedTag);
}

function setActive(i) {
  const opts = options();
  activeIndex = (i + opts.length) % opts.length;
  opts.forEach((li, j) => li.classList.toggle('active', j === activeIndex));
  toneList.setAttribute('aria-activedescendant', opts[activeIndex].id);
  opts[activeIndex].scrollIntoView({ block: 'nearest' });
}

function openList() {
  if (!toneList.hidden) return;
  toneList.hidden = false;
  toneButton.setAttribute('aria-expanded', 'true');
  const first = options().findIndex((li) => li.dataset.tag === selectedTag);
  setActive(Math.max(first, 0));
  toneList.focus();
}

function closeList(refocus = true) {
  if (toneList.hidden) return;
  toneList.hidden = true;
  toneButton.setAttribute('aria-expanded', 'false');
  options().forEach((li) => li.classList.remove('active'));
  if (refocus) toneButton.focus();
}

toneButton.addEventListener('click', () => (toneList.hidden ? openList() : closeList()));
toneButton.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); openList(); }
});

toneList.addEventListener('keydown', (e) => {
  const opts = options();
  switch (e.key) {
    case 'ArrowDown': e.preventDefault(); setActive(activeIndex + 1); break;
    case 'ArrowUp': e.preventDefault(); setActive(activeIndex - 1); break;
    case 'Home': e.preventDefault(); setActive(0); break;
    case 'End': e.preventDefault(); setActive(opts.length - 1); break;
    case ' ':
    case 'Enter': e.preventDefault(); selectTag(opts[activeIndex].dataset.tag); break;
    case 'Escape': e.preventDefault(); closeList(); break;
    case 'Tab': closeList(false); break;
  }
});

toneList.addEventListener('mouseleave', () => options().forEach((li) => li.classList.remove('active')));

document.addEventListener('pointerdown', (e) => {
  if (!document.getElementById('tone').contains(e.target)) closeList(false);
});

// ---------------------------------------------------------------- decorative side columns

/** Each column gets its own picks and its own ragged indents, so the two sides never mirror. */
function fillSides() {
  const pools = currentPools();
  const count = currentSideLines();
  for (const side of document.querySelectorAll('.side-lines')) {
    side.replaceChildren(...pickEmoticons(pools, count).map((text) => {
      const p = document.createElement('p');
      p.textContent = text;
      p.style.paddingLeft = `${INDENTS[Math.floor(Math.random() * INDENTS.length)]}em`;
      return p;
    }));
  }
}

// ---------------------------------------------------------------- sparkle flipbooks (one frame per typed character)

/** Fill `el` with a COLS × ROWS grid of cells; returns a function that steps to the next frame. */
function makeSparkle(el, frames) {
  const cells = Array.from({ length: COLS * ROWS }, () => document.createElement('span'));
  el.replaceChildren(...cells);
  let frame = 0;
  const draw = () => frameCells(frames[frame]).forEach(({ ch, scale, opacity }, i) => {
    cells[i].textContent = ch;
    cells[i].style.setProperty('--s', scale);
    cells[i].style.opacity = opacity;
  });
  draw();
  return () => {
    frame = (frame + 1) % frames.length;
    draw();
  };
}

const sparkles = [
  makeSparkle(document.getElementById('sparkle-top'), FRAMES),
  makeSparkle(document.getElementById('sparkle-bottom'), FRAMES_ALT),
];

init();
