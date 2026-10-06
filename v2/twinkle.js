// The sparkles beside the title and in the bottom-right corner: flipbooks that turn one frame per typed character.
// Each frame is ROWS strings of COLS cells (' ' = empty), drawn only with glyphs from the emoticon list
// so the self-hosted fonts already cover them. `center` scales the middle cell; `opacity` dims the frame.

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

// The bottom-right variant: diagonal (X) arms instead of a plus, peaking on ✧ and blooming into a ❀.
export const FRAMES_ALT = [
  {
    center: 1.2,
    rows: [
      '       ',
      '       ',
      '   ⊹   ',
      '       ',
      '       ',
    ],
  },
  {
    center: 1.8,
    rows: [
      '       ',
      '       ',
      '   ⋆   ',
      ' ˚     ',
      '       ',
    ],
  },
  {
    center: 2.4,
    rows: [
      '       ',
      '  · ·  ',
      '   ⭑   ',
      '  · ·  ',
      '       ',
    ],
  },
  {
    center: 1.8,
    rows: [
      ' ˖   ˖ ',
      '       ',
      '   ✩   ',
      '       ',
      ' ˖   ˖ ',
    ],
  },
  {
    center: 2.8,
    rows: [
      '⋆  ⁺  ⋆',
      '       ',
      '˖  ✧  ˖',
      '       ',
      '⋆  ₊  ⋆',
    ],
  },
  {
    center: 1.5,
    rows: [
      ' ⋆ ˚ ⋆ ',
      '˖     ˖',
      '   ❀   ',
      '˖     ˖',
      ' ⋆ ₊ ⋆ ',
    ],
  },
  {
    opacity: 0.85,
    rows: [
      '˖ ·   ₊',
      '      ·',
      '⋆      ',
      '     ˖ ',
      '₊   · ˚',
    ],
  },
  {
    opacity: 0.6,
    rows: [
      '  °    ',
      '      ˚',
      '·      ',
      '       ',
      '  ˚  ° ',
    ],
  },
  {
    opacity: 0.35,
    rows: [
      '      °',
      '       ',
      '       ',
      '°      ',
      '    °  ',
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

/** Flatten a frame into COLS × ROWS cells, row by row. */
export function frameCells({ rows, center = 1, opacity = 1 }) {
  return rows.flatMap((row, r) => Array.from(row, (ch, c) => ({
    ch: ch === ' ' ? '' : ch,
    scale: r === CENTER_ROW && c === CENTER_COL ? center : 1,
    opacity,
  })));
}
