// The sparkles beside the title and in the bottom-right corner: flipbooks that turn one frame per typed character.
// Each frame is ROWS strings of COLS cells (' ' = empty), drawn only with glyphs from the emoticon list
// so the self-hosted fonts already cover them. `center` scales the middle cell, `scale` lists extra
// [row, col, size] cells to enlarge, and `opacity` dims the frame.

export const COLS = 7;
export const ROWS = 5;
const CENTER_ROW = 2;
const CENTER_COL = 3;

export const FRAMES = [
  {
    center: 1.6,
    rows: [
      '       ',
      '       ',
      '   ⋆   ',
      '       ',
      '       ',
    ],
  },
  {
    center: 1.2,
    rows: [
      '       ',
      '     ˚ ',
      '   ✧   ',
      '       ',
      '       ',
    ],
  },
  {
    center: 2.6,
    rows: [
      '       ',
      '   ·   ',
      '  ·⭒·  ',
      '   ·   ',
      '       ',
    ],
  },
  {
    center: 1.6,
    rows: [
      '   ˖   ',
      '     ˚ ',
      ' ˖ ✩ ˖ ',
      ' ˚     ',
      '   ˖   ',
    ],
  },
  {
    center: 2.2,
    rows: [
      '   ⁺   ',
      ' ⋆   ⋆ ',
      ' ˖ ✮ ˖ ',
      ' ⋆   ⋆ ',
      '   ₊   ',
    ],
  },
  {
    center: 1.3,
    rows: [
      '   ˚   ',
      ' ₊   ˖ ',
      '⋆  ⟡  ⋆',
      ' ˖   ₊ ',
      '   ˚   ',
    ],
  },
  {
    opacity: 0.85,
    rows: [
      ' ˖   ₊ ',
      '₊     ˚',
      '       ',
      '˚     ˖',
      ' ₊   ˖ ',
    ],
  },
  {
    opacity: 0.6,
    rows: [
      '°    ˚ ',
      '      ·',
      '·      ',
      '      °',
      ' ˚   · ',
    ],
  },
  {
    opacity: 0.35,
    rows: [
      '°      ',
      '       ',
      '      °',
      '       ',
      ' °     ',
    ],
  },
  {
    opacity: 0.6,
    rows: [
      '       ',
      '       ',
      '   ·   ',
      '       ',
      '       ',
    ],
  },
];

// The bottom-right variant: a shooting star arcs over a crescent moon, lands, and turns into a ♡ that floats away.
export const FRAMES_ALT = [
  {
    center: 2.4,
    rows: [
      '       ',
      '       ',
      '   ☾   ',
      '       ',
      '  ·    ',
    ],
  },
  {
    center: 2.4,
    scale: [[3, 0, 1.3]],
    rows: [
      '       ',
      '       ',
      '   ☾   ',
      '✧      ',
      '       ',
    ],
  },
  {
    center: 2.4,
    scale: [[1, 0, 1.3]],
    rows: [
      '       ',
      '✧      ',
      '   ☾   ',
      '˖      ',
      '       ',
    ],
  },
  {
    center: 2.4,
    scale: [[0, 2, 1.3]],
    rows: [
      '  ✧    ',
      '⋆      ',
      '   ☾   ',
      '·      ',
      '       ',
    ],
  },
  {
    center: 2.4,
    scale: [[0, 4, 1.3]],
    rows: [
      '  ⋆ ✧  ',
      '·      ',
      '   ☾   ',
      '       ',
      '       ',
    ],
  },
  {
    center: 2.4,
    scale: [[1, 6, 1.3]],
    rows: [
      '  · ⋆  ',
      '      ✧',
      '   ☾   ',
      '       ',
      '       ',
    ],
  },
  {
    center: 2.4,
    scale: [[3, 6, 1.3]],
    rows: [
      '    ·  ',
      '      ⋆',
      '   ☾   ',
      '      ✧',
      '       ',
    ],
  },
  {
    center: 2.4,
    scale: [[3, 6, 1.4]],
    rows: [
      '       ',
      '      ·',
      '   ☾   ',
      '      ♡',
      '       ',
    ],
  },
  {
    center: 2.4,
    scale: [[1, 6, 1.2]],
    rows: [
      '       ',
      '      ♡',
      '   ☾   ',
      '      ·',
      '       ',
    ],
  },
  {
    center: 2.4,
    rows: [
      '      ˚',
      '       ',
      '   ☾   ',
      '       ',
      '       ',
    ],
  },
];

/** Flatten a frame into COLS × ROWS cells, row by row. */
export function frameCells({ rows, center = 1, scale = [], opacity = 1 }) {
  const sizes = new Map([[CENTER_ROW * COLS + CENTER_COL, center]]);
  for (const [r, c, size] of scale) sizes.set(r * COLS + c, size);
  return rows.flatMap((row, r) => Array.from(row, (ch, c) => ({
    ch: ch === ' ' ? '' : ch,
    scale: sizes.get(r * COLS + c) ?? 1,
    opacity,
  })));
}
