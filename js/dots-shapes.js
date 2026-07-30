/**
 * Algorithmic paths for letters, numbers, and geometric shapes.
 * Letter/number strokes follow common manuscript order (Handwriting Without Tears /
 * Zaner-Bloser style): start at the top, pull down, left-to-right; separate strokes
 * where a pencil lift is normally taught.
 */

function toPoints(segments) {
  return segments.map(([x, y]) => ({ x, y }));
}

function strokesToPaths(strokes) {
  return strokes.map((stroke) => toPoints(stroke));
}

/**
 * Ellipse arc in y-down coords. 0°=right, 90°=bottom, ±180°=left, -90°=top.
 * Decreasing angles = usual “Magic C” / counterclockwise oval.
 */
function ellipseArc(cx, cy, rx, ry, a0, a1, steps = 28) {
  const pts = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const a = ((a0 + (a1 - a0) * t) * Math.PI) / 180;
    pts.push([
      Math.round((cx + rx * Math.cos(a)) * 1000) / 1000,
      Math.round((cy + ry * Math.sin(a)) * 1000) / 1000,
    ]);
  }
  return pts;
}

function circleDot(cx, cy, r = 0.035, steps = 12) {
  return ellipseArc(cx, cy, r, r, -90, -450, steps);
}

const LETTER_STROKES = {
  A: [
    [[0.5, 0.1], [0.28, 0.9]],
    [[0.5, 0.1], [0.72, 0.9]],
    [[0.38, 0.55], [0.62, 0.55]],
  ],
  B: [
    [[0.3, 0.1], [0.3, 0.9]],
    [[0.3, 0.1], ...ellipseArc(0.3, 0.3, 0.32, 0.2, -90, 90, 18), [0.3, 0.5]],
    [[0.3, 0.5], ...ellipseArc(0.3, 0.7, 0.36, 0.2, -90, 90, 18), [0.3, 0.9]],
  ],
  C: [ellipseArc(0.5, 0.5, 0.28, 0.4, -40, -320, 28)],
  D: [
    [[0.3, 0.1], [0.3, 0.9]],
    ellipseArc(0.3, 0.5, 0.42, 0.4, -90, 90, 28),
  ],
  E: [
    [[0.3, 0.1], [0.3, 0.9]],
    [[0.3, 0.1], [0.68, 0.1]],
    [[0.3, 0.5], [0.6, 0.5]],
    [[0.3, 0.9], [0.68, 0.9]],
  ],
  F: [
    [[0.3, 0.1], [0.3, 0.9]],
    [[0.3, 0.1], [0.68, 0.1]],
    [[0.3, 0.5], [0.6, 0.5]],
  ],
  G: [
    ellipseArc(0.5, 0.5, 0.28, 0.4, -35, -330, 30),
    [[0.5, 0.55], [0.74, 0.55]],
  ],
  H: [
    [[0.3, 0.1], [0.3, 0.9]],
    [[0.7, 0.1], [0.7, 0.9]],
    [[0.3, 0.5], [0.7, 0.5]],
  ],
  I: [
    [[0.5, 0.1], [0.5, 0.9]],
    [[0.35, 0.1], [0.65, 0.1]],
    [[0.35, 0.9], [0.65, 0.9]],
  ],
  J: [
    [[0.38, 0.1], [0.72, 0.1]],
    [[0.62, 0.1], [0.62, 0.65], ...ellipseArc(0.45, 0.65, 0.17, 0.25, 0, 150, 16)],
  ],
  K: [
    [[0.3, 0.1], [0.3, 0.9]],
    [[0.68, 0.1], [0.3, 0.5]],
    [[0.3, 0.5], [0.7, 0.9]],
  ],
  L: [[[0.3, 0.1], [0.3, 0.9], [0.72, 0.9]]],
  M: [
    [[0.22, 0.1], [0.22, 0.9]],
    [[0.22, 0.1], [0.5, 0.62]],
    [[0.5, 0.62], [0.78, 0.1]],
    [[0.78, 0.1], [0.78, 0.9]],
  ],
  N: [
    [[0.3, 0.1], [0.3, 0.9]],
    [[0.3, 0.1], [0.7, 0.9]],
    [[0.7, 0.1], [0.7, 0.9]],
  ],
  O: [ellipseArc(0.5, 0.5, 0.28, 0.4, -90, -450, 36)],
  P: [
    [[0.3, 0.1], [0.3, 0.9]],
    [[0.3, 0.1], ...ellipseArc(0.3, 0.3, 0.34, 0.22, -90, 90, 20), [0.3, 0.52]],
  ],
  Q: [
    ellipseArc(0.5, 0.5, 0.28, 0.4, -90, -450, 36),
    [[0.55, 0.65], [0.78, 0.9]],
  ],
  R: [
    [[0.3, 0.1], [0.3, 0.9]],
    [[0.3, 0.1], ...ellipseArc(0.3, 0.3, 0.34, 0.22, -90, 90, 20), [0.3, 0.52]],
    [[0.42, 0.52], [0.7, 0.9]],
  ],
  S: [[
    ...ellipseArc(0.5, 0.32, 0.22, 0.2, -30, -200, 16),
    ...ellipseArc(0.5, 0.68, 0.22, 0.22, -20, 160, 16),
  ]],
  T: [
    [[0.22, 0.1], [0.78, 0.1]],
    [[0.5, 0.1], [0.5, 0.9]],
  ],
  U: [[
    [0.28, 0.1],
    [0.28, 0.55],
    ...ellipseArc(0.5, 0.55, 0.22, 0.35, 180, 0, 20),
    [0.72, 0.1],
  ]],
  V: [
    [[0.25, 0.1], [0.5, 0.9]],
    [[0.75, 0.1], [0.5, 0.9]],
  ],
  W: [
    [[0.18, 0.1], [0.35, 0.9]],
    [[0.5, 0.35], [0.35, 0.9]],
    [[0.5, 0.35], [0.65, 0.9]],
    [[0.82, 0.1], [0.65, 0.9]],
  ],
  X: [
    [[0.28, 0.1], [0.72, 0.9]],
    [[0.72, 0.1], [0.28, 0.9]],
  ],
  Y: [
    [[0.28, 0.1], [0.5, 0.48]],
    [[0.72, 0.1], [0.5, 0.48]],
    [[0.5, 0.48], [0.5, 0.9]],
  ],
  Z: [[[0.28, 0.1], [0.72, 0.1], [0.28, 0.9], [0.72, 0.9]]],
};

/** Manuscript-style lowercase strokes (x-height ~0.35–0.9). */
const LOWERCASE_STROKES = {
  a: [
    ellipseArc(0.5, 0.62, 0.2, 0.28, -40, -400, 28),
    [[0.68, 0.35], [0.68, 0.9]],
  ],
  b: [
    [[0.32, 0.1], [0.32, 0.9]],
    [...ellipseArc(0.5, 0.68, 0.2, 0.22, 180, -180, 24).slice(0, -1), [0.32, 0.82]],
  ],
  c: [ellipseArc(0.5, 0.62, 0.2, 0.28, -40, -320, 24)],
  d: [
    [[0.68, 0.1], [0.68, 0.9]],
    [...ellipseArc(0.5, 0.68, 0.2, 0.22, 0, 360, 24).slice(0, -1), [0.68, 0.82]],
  ],
  e: [[
    [0.3, 0.62],
    [0.68, 0.62],
    ...ellipseArc(0.5, 0.55, 0.2, 0.22, 20, -200, 20),
    ...ellipseArc(0.5, 0.7, 0.2, 0.22, -200, -320, 12),
  ]],
  f: [
    [[0.62, 0.18], [0.5, 0.1], [0.4, 0.18], [0.4, 0.9]],
    [[0.28, 0.45], [0.55, 0.45]],
  ],
  g: [[
    ...ellipseArc(0.5, 0.58, 0.2, 0.24, -40, -400, 28),
    [0.68, 0.35],
    [0.68, 0.88],
    ...ellipseArc(0.52, 0.88, 0.16, 0.1, 0, 160, 12),
  ]],
  h: [[
    [0.32, 0.1],
    [0.32, 0.9],
    [0.32, 0.5],
    ...ellipseArc(0.5, 0.5, 0.2, 0.18, 180, 0, 16),
    [0.68, 0.9],
  ]],
  i: [
    [[0.5, 0.35], [0.5, 0.9]],
    circleDot(0.5, 0.2, 0.04, 14),
  ],
  j: [
    [[0.55, 0.35], [0.55, 0.85], ...ellipseArc(0.42, 0.85, 0.13, 0.12, 0, 160, 12)],
    circleDot(0.55, 0.2, 0.04, 14),
  ],
  k: [
    [[0.32, 0.1], [0.32, 0.9]],
    [[0.65, 0.35], [0.32, 0.62]],
    [[0.42, 0.55], [0.68, 0.9]],
  ],
  l: [[[0.5, 0.1], [0.5, 0.9]]],
  m: [[
    [0.22, 0.35],
    [0.22, 0.9],
    [0.22, 0.5],
    ...ellipseArc(0.36, 0.5, 0.14, 0.16, 180, 0, 12),
    [0.5, 0.9],
    [0.5, 0.5],
    ...ellipseArc(0.64, 0.5, 0.14, 0.16, 180, 0, 12),
    [0.78, 0.9],
  ]],
  n: [[
    [0.3, 0.35],
    [0.3, 0.9],
    [0.3, 0.5],
    ...ellipseArc(0.5, 0.5, 0.2, 0.16, 180, 0, 14),
    [0.68, 0.9],
  ]],
  o: [ellipseArc(0.5, 0.62, 0.2, 0.28, -90, -450, 32)],
  p: [
    [[0.32, 0.35], [0.32, 0.98]],
    [...ellipseArc(0.5, 0.62, 0.2, 0.22, 180, -180, 22).slice(0, -1), [0.32, 0.78]],
  ],
  q: [
    [[0.68, 0.35], [0.68, 0.98]],
    [...ellipseArc(0.5, 0.62, 0.2, 0.22, 0, 360, 22).slice(0, -1), [0.68, 0.78]],
  ],
  r: [
    [[0.32, 0.35], [0.32, 0.9]],
    [[0.32, 0.5], ...ellipseArc(0.48, 0.48, 0.16, 0.14, 180, 20, 12)],
  ],
  s: [[
    ...ellipseArc(0.5, 0.48, 0.18, 0.14, -30, -200, 14),
    ...ellipseArc(0.5, 0.75, 0.18, 0.16, -20, 160, 14),
  ]],
  t: [
    [[0.48, 0.18], [0.48, 0.82], [0.58, 0.9]],
    [[0.32, 0.42], [0.62, 0.42]],
  ],
  u: [
    [
      [0.3, 0.35],
      [0.3, 0.65],
      ...ellipseArc(0.5, 0.65, 0.2, 0.25, 180, 0, 16),
      [0.68, 0.35],
    ],
    [[0.68, 0.35], [0.68, 0.9]],
  ],
  v: [
    [[0.28, 0.35], [0.5, 0.9]],
    [[0.72, 0.35], [0.5, 0.9]],
  ],
  w: [
    [[0.2, 0.35], [0.35, 0.9]],
    [[0.5, 0.5], [0.35, 0.9]],
    [[0.5, 0.5], [0.65, 0.9]],
    [[0.8, 0.35], [0.65, 0.9]],
  ],
  x: [
    [[0.3, 0.35], [0.7, 0.9]],
    [[0.7, 0.35], [0.3, 0.9]],
  ],
  y: [
    [[0.28, 0.35], [0.5, 0.78]],
    [[0.72, 0.35], [0.5, 0.78], [0.4, 0.98]],
  ],
  z: [[[0.3, 0.35], [0.7, 0.35], [0.3, 0.9], [0.7, 0.9]]],
};

const DIGIT_STROKES = {
  0: [ellipseArc(0.5, 0.5, 0.26, 0.4, -90, -450, 36)],
  1: [[[0.5, 0.1], [0.5, 0.9]]],
  2: [[
    ...ellipseArc(0.5, 0.28, 0.24, 0.2, -160, 20, 18),
    [0.28, 0.9],
    [0.72, 0.9],
  ]],
  3: [
    ellipseArc(0.42, 0.3, 0.26, 0.2, -160, 70, 16),
    ellipseArc(0.42, 0.7, 0.28, 0.22, -70, 160, 16),
  ],
  4: [
    [[0.58, 0.1], [0.28, 0.55], [0.72, 0.55]],
    [[0.58, 0.1], [0.58, 0.9]],
  ],
  5: [[
    [0.65, 0.1],
    [0.32, 0.1],
    [0.32, 0.45],
    ...ellipseArc(0.5, 0.62, 0.26, 0.28, -160, 120, 20),
  ]],
  6: [[
    [0.62, 0.18],
    ...ellipseArc(0.5, 0.55, 0.26, 0.35, -60, -420, 32),
  ]],
  7: [[[0.28, 0.1], [0.72, 0.1], [0.38, 0.9]]],
  8: [[
    ...ellipseArc(0.5, 0.3, 0.2, 0.18, -90, -450, 20),
    ...ellipseArc(0.5, 0.7, 0.24, 0.22, -90, -450, 22),
  ]],
  9: [
    ellipseArc(0.5, 0.35, 0.22, 0.24, -90, -450, 28),
    [[0.72, 0.35], [0.72, 0.75], ...ellipseArc(0.55, 0.75, 0.17, 0.16, 0, 150, 12)],
  ],
};

export function letterPaths(char) {
  const raw = String(char);
  const lower = raw.toLowerCase();
  if (raw === lower && LOWERCASE_STROKES[lower]) {
    return { paths: strokesToPaths(LOWERCASE_STROKES[lower]), color: "#5c7cfa", case: "lower" };
  }
  const key = raw.toUpperCase();
  const strokes = LETTER_STROKES[key];
  if (!strokes) return null;
  return { paths: strokesToPaths(strokes), color: "#5c7cfa", case: "upper" };
}

export function numberPaths(n) {
  const key = String(n);
  const strokes = DIGIT_STROKES[key];
  if (!strokes) return null;
  return { paths: strokesToPaths(strokes), color: "#ff6b4a" };
}

export function shapePaths(shape) {
  switch (shape) {
    case "heart": {
      const pts = [];
      for (let i = 0; i <= 32; i++) {
        const t = (i / 32) * Math.PI * 2;
        pts.push({
          x: 0.5 + 0.22 * Math.pow(Math.sin(t), 3),
          y: 0.48 - 0.24 * Math.cos(t) + 0.1 * Math.cos(2 * t),
        });
      }
      return { paths: [pts], color: "#ff6b6b" };
    }
    case "star": {
      const pts = [];
      for (let i = 0; i <= 10; i++) {
        const r = i % 2 === 0 ? 0.38 : 0.16;
        const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
        pts.push({ x: 0.5 + r * Math.cos(a), y: 0.5 + r * Math.sin(a) });
      }
      return { paths: [pts], color: "#ffc857" };
    }
    case "diamond":
      return {
        paths: [toPoints([[0.5, 0.08], [0.88, 0.5], [0.5, 0.92], [0.12, 0.5], [0.5, 0.08]])],
        color: "#4ecdc4",
      };
    case "arrow":
      return {
        paths: [
          toPoints([[0.15, 0.5], [0.55, 0.5], [0.55, 0.3], [0.85, 0.5], [0.55, 0.7], [0.55, 0.5]]),
        ],
        color: "#6bcb77",
      };
    case "house":
      return {
        paths: [
          toPoints([[0.2, 0.55], [0.5, 0.15], [0.8, 0.55], [0.8, 0.9], [0.2, 0.9], [0.2, 0.55]]),
          toPoints([[0.38, 0.9], [0.38, 0.68], [0.62, 0.68], [0.62, 0.9]]),
        ],
        color: "#f4a261",
      };
    default:
      return null;
  }
}

export function listGeneratedPictures() {
  const items = [];
  for (const ch of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    items.push({
      id: `letter-${ch.toLowerCase()}`,
      name: ch,
      category: "letters",
      generated: "letter",
      glyph: ch,
      color: "#5c7cfa",
    });
  }
  for (let n = 0; n <= 9; n++) {
    items.push({
      id: `number-${n}`,
      name: String(n),
      category: "letters",
      generated: "number",
      glyph: String(n),
      color: "#ff6b4a",
    });
  }
  for (const shape of ["heart", "star", "diamond", "arrow", "house"]) {
    items.push({
      id: `shape-${shape}`,
      name: shape.charAt(0).toUpperCase() + shape.slice(1),
      category: "shapes",
      generated: "shape",
      glyph: shape,
    });
  }
  return items;
}

export function resolveGeneratedPicture(meta) {
  if (meta.generated === "letter") return letterPaths(meta.glyph);
  if (meta.generated === "number") return numberPaths(meta.glyph);
  if (meta.generated === "shape") return shapePaths(meta.glyph);
  return null;
}
