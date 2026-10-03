import {
  loadEmoticons, allTags, poolFor, makeIndex, pickEmoticons,
  sprinkleAtSpace, spaceSlotsInRange, retoneEdit, mergeEdits, mapPosition,
} from './sprinkle.js';

// Chance that pressing space adds an emoticon, per cuteness level (slider position 1..length):
// 1 in 6 at the low end up to 5 in 12 at the top, in even steps.
const CUTENESS_CHANCES = [8 / 48, 11 / 48, 14 / 48, 17 / 48, 20 / 48];
const DEFAULT_LEVEL = 3;
const RANDOM = 'random';
const SIDE_LINES = 22;
const INDENTS = [0, 0, 0, 1, 2, 3, 5];

const textarea = document.getElementById('writing');
const dial = document.getElementById('cuteness');
const copyButton = document.getElementById('copy');
const statusEl = document.getElementById('status');

let emoticons = [];
let index = makeIndex([]);
let selectedTags = [RANDOM];
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
  buildToneSelect([RANDOM, ...allTags(emoticons)]);
  fillSides();
}

// ---------------------------------------------------------------- sprinkling

function currentPool() {
  return poolFor(emoticons, selectedTags.includes(RANDOM) ? [] : selectedTags);
}

function currentChance() {
  return CUTENESS_CHANCES[Number(dial.value) - 1] ?? CUTENESS_CHANCES[0];
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
  if (busy || e.isComposing || !emoticons.length) return;
  const text = textarea.value;
  const caret = textarea.selectionStart;
  if (caret !== textarea.selectionEnd) return;

  let edit = null;
  if (e.inputType === 'insertText' && text[caret - 1] === ' ') {
    if (rollForEmoticon()) {
      const [emo] = pickEmoticons(currentPool(), 1);
      edit = sprinkleAtSpace(text, caret - 1, index, emo);
    }
  } else if ((e.inputType === 'insertFromPaste' || e.inputType === 'insertFromDrop') && pasteStart !== null) {
    const spots = spaceSlotsInRange(text, pasteStart, caret).filter(rollForEmoticon);
    const picks = pickEmoticons(currentPool(), spots.length);
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
dial.addEventListener('input', paintDial);
paintDial();

// ---------------------------------------------------------------- tone select (multi-select listbox)

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
    li.addEventListener('click', () => { setActive(i); toggleTag(tag); });
    li.addEventListener('mousemove', () => setActive(i));
    return li;
  }));
  renderTone();
}

function options() { return [...toneList.children]; }

function toggleTag(tag) {
  if (tag === RANDOM) {
    selectedTags = [RANDOM];
  } else {
    const rest = selectedTags.filter((t) => t !== RANDOM);
    selectedTags = rest.includes(tag) ? rest.filter((t) => t !== tag) : [...rest, tag];
    if (!selectedTags.length) selectedTags = [RANDOM];
  }
  renderTone();
  retone();
}

/** A new tone re-rolls every emoticon already in the text, and the side columns with them. */
function retone() {
  applyToTextarea(retoneEdit(textarea.value, index, (n) => pickEmoticons(currentPool(), n)));
  fillSides();
}

function renderTone() {
  for (const li of options()) li.setAttribute('aria-selected', String(selectedTags.includes(li.dataset.tag)));
  const order = options().map((li) => li.dataset.tag);
  const shown = [...selectedTags].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  toneValue.textContent = shown.length ? shown.map(titleCase).join(', ') : 'Select…';
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
  const first = options().findIndex((li) => selectedTags.includes(li.dataset.tag));
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
    case 'Enter': e.preventDefault(); toggleTag(opts[activeIndex].dataset.tag); break;
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
  const pool = currentPool();
  for (const side of document.querySelectorAll('.side')) {
    side.replaceChildren(...pickEmoticons(pool, SIDE_LINES).map((text) => {
      const p = document.createElement('p');
      p.textContent = text;
      p.style.paddingLeft = `${INDENTS[Math.floor(Math.random() * INDENTS.length)]}em`;
      return p;
    }));
  }
}

init();
