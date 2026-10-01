// Pure logic for the Sparkle Sprinkler: CSV parsing, sentence detection, emoticon insertion.
// No DOM access here, so it runs under `node --test` too.

// Tokens that end in "." without ending a sentence. Lowercase, without the final dot.
export const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'mx', 'dr', 'prof', 'st', 'sr', 'jr', 'mt', 'ave', 'blvd', 'rd',
  'vs', 'etc', 'e.g', 'i.e', 'a.m', 'p.m', 'no', 'approx', 'dept', 'est', 'fig',
  'inc', 'ltd', 'co', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept',
  'oct', 'nov', 'dec', 'u.s', 'u.k',
]);

const TERMINATORS = '.!?…';
const CLOSERS = '"\'”’)]»';

const isSpace = (ch) => ch !== undefined && /\s/u.test(ch);
const hasWordChar = (s) => /[\p{L}\p{N}]/u.test(s);

// ---------------------------------------------------------------- CSV

/** RFC 4180 parser: quoted fields, "" escapes, commas/newlines inside quotes, CRLF, BOM. */
export function parseCSV(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

/**
 * Rows → [{ text, name, tags: string[] }]. The "Emoticons" column is the emoticon, "Name" is
 * optional, and every other column is a tag column. Duplicate emoticons are merged.
 */
export function loadEmoticons(csvText) {
  const [header, ...rows] = parseCSV(csvText);
  const cols = header.map((h) => h.trim().toLowerCase());
  const emoCol = cols.findIndex((c) => c === 'emoticons' || c === 'emoticon');
  if (emoCol < 0) throw new Error('CSV has no "Emoticons" column');
  const nameCol = cols.indexOf('name');
  const tagCols = cols.map((_, i) => i).filter((i) => i !== emoCol && i !== nameCol);

  const byText = new Map();
  for (const r of rows) {
    const text = (r[emoCol] ?? '').trim();
    if (!text) continue;
    const tags = tagCols.map((i) => (r[i] ?? '').trim().toLowerCase()).filter(Boolean);
    const existing = byText.get(text);
    if (existing) {
      for (const t of tags) if (!existing.tags.includes(t)) existing.tags.push(t);
    } else {
      byText.set(text, { text, name: nameCol >= 0 ? (r[nameCol] ?? '').trim() : '', tags });
    }
  }
  return [...byText.values()];
}

/** Tags in first-seen order. */
export function allTags(emoticons) {
  const seen = [];
  for (const e of emoticons) for (const t of e.tags) if (!seen.includes(t)) seen.push(t);
  return seen;
}

/** Emoticons that carry any of `tags`; an empty list means every emoticon ("random"). */
export function poolFor(emoticons, tags) {
  if (!tags.length) return emoticons.map((e) => e.text);
  return emoticons.filter((e) => e.tags.some((t) => tags.includes(t))).map((e) => e.text);
}

// ---------------------------------------------------------------- graphemes & known emoticons

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function boundaryChecker(text) {
  const segs = graphemes.segment(text);
  return (i) => i <= 0 || i >= text.length || segs.containing(i).index === i;
}

/** Index over known emoticon strings, longest first so "!!!"-style tails win over shorter matches. */
export function makeIndex(emoticons) {
  const list = [...new Set(emoticons.map((e) => (typeof e === 'string' ? e : e.text)))]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  return { list };
}

/**
 * Ranges [start, end) of known emoticons in `text`, non-overlapping, sorted. A match must start
 * and end on grapheme boundaries so a combining mark is never split from its base.
 */
export function findEmoticons(text, index) {
  const isBoundary = boundaryChecker(text);
  const found = [];
  for (const e of index.list) {
    for (let i = text.indexOf(e); i >= 0; i = text.indexOf(e, i + 1)) {
      if (isBoundary(i) && isBoundary(i + e.length)) found.push([i, i + e.length]);
    }
  }
  found.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const ranges = [];
  for (const r of found) {
    if (!ranges.length || r[0] >= ranges[ranges.length - 1][1]) ranges.push(r);
  }
  return ranges;
}

const maskAt = (masks, i) => masks.find(([s, e]) => i >= s && i < e);
const overlaps = (masks, s, e) => masks.some(([ms, me]) => ms < e && s < me);

// ---------------------------------------------------------------- sentence boundaries

/** If text just before `pos` is terminators + optional closers, return where they start. */
function terminatorRunBefore(text, pos) {
  let i = pos;
  while (i > 0 && CLOSERS.includes(text[i - 1])) i--;
  const termEnd = i;
  while (i > 0 && TERMINATORS.includes(text[i - 1])) i--;
  if (i === termEnd) return null;
  return { termStart: i, termEnd };
}

/**
 * Whether the terminator run [termStart, termEnd) really ends a sentence.
 * `final` is true at Enter, end of paste and on Copy, where an ellipsis also counts.
 */
function isSentenceEnd(text, termStart, termEnd, masks, final) {
  if (overlaps(masks, termStart, termEnd)) return false; // part of an emoticon
  const run = text.slice(termStart, termEnd);
  if (!final && (run.includes('..') || run.includes('…'))) return false;
  if (run === '.') {
    let t = termStart;
    while (t > 0 && !isSpace(text[t - 1])) t--;
    const token = text.slice(t, termStart).replace(/^[^\p{L}\p{N}]+/u, '');
    if (ABBREVIATIONS.has(token.toLowerCase())) return false;
    if (/^\p{Lu}$/u.test(token) && token !== 'I') return false; // initials: "J. K. Rowling"
  }
  return true;
}

/** Start of the sentence ending at `end`, skipping leading whitespace and previous emoticons. */
function sentenceStart(text, end, masks) {
  let start = 0;
  for (let i = end - 1; i >= 0; i--) {
    const m = maskAt(masks, i);
    if (m) { i = m[0]; continue; }
    if (text[i] === '\n') { start = i + 1; break; }
    if (isSpace(text[i]) && i > 0 && !isSpace(text[i - 1])) {
      const run = terminatorRunBefore(text, i);
      if (run && isSentenceEnd(text, run.termStart, run.termEnd, masks, false)) { start = i + 1; break; }
    }
  }
  for (;;) {
    while (start < end && isSpace(text[start])) start++;
    const m = masks.find(([s]) => s === start);
    if (!m || m[1] > end) break;
    start = m[1];
  }
  return start;
}

function sentenceEndingAt(text, end, masks, { final, requireTerminator }) {
  const run = terminatorRunBefore(text, end);
  if (run) {
    if (!isSentenceEnd(text, run.termStart, run.termEnd, masks, final)) return null;
  } else if (requireTerminator) {
    return null;
  }
  const start = sentenceStart(text, run ? run.termStart : end, masks);
  const body = text.slice(start, run ? run.termStart : end);
  if (!hasWordChar(body)) return null;
  if (overlaps(masks, start, end)) return null; // already sprinkled
  return { start, end };
}

/**
 * The user typed whitespace at `wsPos` (text[wsPos] is that whitespace).
 * Returns { start, end } of the sentence it confirms, or null.
 */
export function sentenceBeforeSpace(text, wsPos, index) {
  const masks = findEmoticons(text, index);
  let after = wsPos + 1;
  while (after < text.length && text[after] === ' ') after++;
  if (masks.some(([s]) => s === after)) return null; // re-typed space before existing sprinkles
  return sentenceEndingAt(text, wsPos, masks, { final: false, requireTerminator: true });
}

/** The user pressed Enter: text[nlPos] is the new line break. Punctuation is optional. */
export function sentenceBeforeNewline(text, nlPos, index) {
  const masks = findEmoticons(text, index);
  let end = nlPos;
  while (end > 0 && text[end - 1] !== '\n' && isSpace(text[end - 1])) end--;
  return sentenceEndingAt(text, end, masks, { final: true, requireTerminator: false });
}

/** A terminated, unsprinkled final sentence at the very end of the text (flushed on Copy). */
export function finalSentence(text, index) {
  const masks = findEmoticons(text, index);
  let end = text.length;
  while (end > 0 && isSpace(text[end - 1])) end--;
  return sentenceEndingAt(text, end, masks, { final: true, requireTerminator: true });
}

/** All complete sentences that end inside [from, to] (a paste), left to right, non-overlapping. */
export function sentencesInRange(text, from, to, index) {
  const masks = findEmoticons(text, index);
  const out = [];
  const push = (s) => {
    if (s && (!out.length || s.start >= out[out.length - 1].end)) out.push(s);
  };
  for (let p = Math.max(from, 1); p <= to; p++) {
    if (maskAt(masks, p - 1)) continue;
    const atEnd = p === to;
    if (p < text.length && text[p] === '\n') {
      let end = p;
      while (end > 0 && text[end - 1] !== '\n' && isSpace(text[end - 1])) end--;
      push(sentenceEndingAt(text, end, masks, { final: true, requireTerminator: false }));
    } else if (atEnd || (isSpace(text[p]) && !isSpace(text[p - 1]))) {
      if (isSpace(text[p - 1])) continue;
      push(sentenceEndingAt(text, p, masks, { final: atEnd, requireTerminator: true }));
    }
  }
  return out;
}

// ---------------------------------------------------------------- sprinkling

/**
 * Insertion points in a sentence: right after each token that is followed by whitespace
 * (so "word," stays together), plus the sentence end.
 */
export function slotsFor(text, { start, end }, index) {
  const masks = findEmoticons(text, index);
  const isBoundary = boundaryChecker(text);
  const slots = [];
  for (let i = start + 1; i < end; i++) {
    if (isSpace(text[i]) && !isSpace(text[i - 1]) && !maskAt(masks, i - 1) && isBoundary(i)) slots.push(i);
  }
  slots.push(end);
  return slots;
}

/** `n` emoticons from `pool`, without repeats while the pool lasts. */
export function pickEmoticons(pool, n, rng = Math.random) {
  const out = [];
  let bag = [];
  while (out.length < n && pool.length) {
    if (!bag.length) bag = [...pool];
    out.push(bag.splice(Math.floor(rng() * bag.length), 1)[0]);
  }
  return out;
}

/**
 * The edit that sprinkles `emoticons` into the sentence: spread over distinct random slots,
 * extras stacked at the end. Each emoticon is inserted as " " + emoticon.
 */
export function sprinkleEdit(text, sentence, emoticons, index, rng = Math.random) {
  const slots = slotsFor(text, sentence, index);
  const chosen = new Map();
  const free = [...slots];
  for (const emo of emoticons) {
    const slot = free.length ? free.splice(Math.floor(rng() * free.length), 1)[0] : sentence.end;
    chosen.set(slot, [...(chosen.get(slot) ?? []), emo]);
  }
  let out = '';
  let last = sentence.start;
  for (const slot of [...chosen.keys()].sort((a, b) => a - b)) {
    out += text.slice(last, slot) + chosen.get(slot).map((e) => ' ' + e).join('');
    last = slot;
  }
  out += text.slice(last, sentence.end);
  return { from: sentence.start, to: sentence.end, insert: out };
}

/** Merge non-overlapping edits (sorted by position) into one edit over their span. */
export function mergeEdits(text, edits) {
  if (!edits.length) return null;
  let insert = '';
  let last = edits[0].from;
  for (const e of edits) {
    insert += text.slice(last, e.from) + e.insert;
    last = e.to;
  }
  return { from: edits[0].from, to: last, insert };
}

export function applyEdit(text, edit) {
  return text.slice(0, edit.from) + edit.insert + text.slice(edit.to);
}

/** Where a caret at `pos` lands after `edit` (positions inside the edited span move to its end). */
export function mapPosition(pos, edit) {
  if (pos <= edit.from) return pos;
  if (pos >= edit.to) return pos + edit.insert.length - (edit.to - edit.from);
  return edit.from + edit.insert.length;
}
