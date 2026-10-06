// The v3 rainbow: one screen-wide color field that runs left to right, with a few spots
// that send out rainbow rings and fade back into it. Pure functions, so they're testable in node.

export const STOPS = ['#e0102e', '#e05a00', '#b88700', '#1fa022', '#00958f', '#2b55ff', '#9a35f0', '#de1a9c'];

// Ring centers as fractions of the viewport; r is how far (in shorter-screen-sides) the rings reach.
export const SPOTS = [
  { x: 0.14, y: 0.22, r: 0.3 },
  { x: 0.5, y: 0.62, r: 0.28 },
  { x: 0.86, y: 0.8, r: 0.3 },
];

// Distance (in shorter-screen-sides) for the rings to go once through the whole rainbow.
export const RING = 0.5;

const RGB = STOPS.map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)));

const mix = (a, b, f) => a.map((v, i) => Math.round(v + (b[i] - v) * f));

/** Color at fraction p of linear-gradient(...STOPS), stops evenly spaced, sRGB like CSS. */
export function lineColor(p) {
  const x = Math.min(Math.max(p, 0), 1) * (RGB.length - 1);
  const i = Math.min(Math.floor(x), RGB.length - 2);
  return mix(RGB[i], RGB[i + 1], x - i);
}

/** Color at t on the stops bent into a loop (magenta runs back into red at t = 1). */
export function ringColor(t) {
  const x = (((t % 1) + 1) % 1) * RGB.length;
  const i = Math.floor(x) % RGB.length;
  return mix(RGB[i], RGB[(i + 1) % RGB.length], x - Math.floor(x));
}

/** Position in the looped rainbow (for ringColor) at pixel (x, y) of a w × h screen. */
export function fieldT(x, y, w, h, spots = SPOTS) {
  const base = (px) => (px / w) * (RGB.length - 1) / RGB.length;
  const s = Math.min(w, h);
  const t0 = base(x);
  let t = t0;
  for (const spot of spots) {
    const d = Math.hypot(x - spot.x * w, y - spot.y * h) / s;
    const weight = Math.exp(-((d / spot.r) ** 2));
    t += weight * (base(spot.x * w) + d / RING - t0);
  }
  return t;
}
