// Pure logic for the Sparkle Sprinkler: CSV parsing, emoticon lookup, insertion edits.
// No DOM access here, so it runs under `node --test` too.

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
 * Rows → [{ text, name, tags: string[] }]. The "Emoticons" column is the emoticon, "Name" and
 * "Type" are optional bookkeeping, and every other column is a tag column (so only the emotion
 * columns become tones). Duplicate emoticons are merged.
 */
export function loadEmoticons(csvText) {
  const [header, ...rows] = parseCSV(csvText);
  const cols = header.map((h) => h.trim().toLowerCase());
  const emoCol = cols.findIndex((c) => c === 'emoticons' || c === 'emoticon');
  if (emoCol < 0) throw new Error('CSV has no "Emoticons" column');
  const nameCol = cols.indexOf('name');
  const skip = new Set([emoCol, nameCol, cols.indexOf('type')]);
  const tagCols = cols.map((_, i) => i).filter((i) => !skip.has(i));

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

/** Index over known emoticon strings, longest first so longer matches win over shorter ones. */
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

// ---------------------------------------------------------------- sprinkling

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
 * The edit that drops `emoticon` just before the space at `wsPos` (so it lands after the word
 * that was finished), or null when that spot is not a good home for one: no word before it,
 * an emoticon already there, or existing emoticons on either side.
 */
export function sprinkleAtSpace(text, wsPos, index, emoticon) {
  if (!emoticon || !isSpace(text[wsPos])) return null;
  if (wsPos === 0 || isSpace(text[wsPos - 1])) return null;

  const masks = findEmoticons(text, index);
  if (maskAt(masks, wsPos - 1)) return null; // the word just typed is an emoticon

  let tokenStart = wsPos;
  while (tokenStart > 0 && !isSpace(text[tokenStart - 1])) tokenStart--;
  if (!hasWordChar(text.slice(tokenStart, wsPos))) return null;

  let after = wsPos + 1;
  while (after < text.length && text[after] === ' ') after++;
  if (masks.some(([s]) => s === after)) return null; // an emoticon already follows

  return { from: wsPos, to: wsPos, insert: ' ' + emoticon };
}

/** Candidate spaces inside [from, to) — one roll of the dice each. */
export function spaceSlotsInRange(text, from, to) {
  const out = [];
  for (let p = Math.max(from, 1); p < Math.min(to, text.length); p++) {
    if (text[p] === ' ') out.push(p);
  }
  return out;
}

/**
 * Re-tone: swap every emoticon already in `text` for a fresh one. `pick(n)` returns n emoticons
 * from the new pool. Returns one edit over the whole affected span, or null if there is nothing
 * to swap.
 */
export function retoneEdit(text, index, pick) {
  const ranges = findEmoticons(text, index);
  if (!ranges.length) return null;
  const picks = pick(ranges.length);
  if (picks.length < ranges.length) return null;
  return mergeEdits(text, ranges.map(([from, to], i) => ({ from, to, insert: picks[i] })));
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
