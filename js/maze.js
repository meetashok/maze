/**
 * Maze generation (recursive backtracking) and BFS solving.
 */

import { mulberry32 } from "./utils.js";

export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;

const DIRS = [
  { bit: N, opp: S, dr: -1, dc: 0 },
  { bit: E, opp: W, dr: 0, dc: 1 },
  { bit: S, opp: N, dr: 1, dc: 0 },
  { bit: W, opp: E, dr: 0, dc: -1 },
];

const MAX_REJECT_ATTEMPTS = 12;
const MIN_SOLUTION_RATIO = { 2: 1.3, 3: 1.5 };

function shuffle(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function dirIndex(d) {
  return DIRS.indexOf(d);
}

/** Prefer straight corridors; at higher detour, also wander away from the exit. */
function orderNeighbors(inDir, rand, detour, r, c, n) {
  const bias = detour * 0.25;
  const goalR = n - 1;
  const goalC = n - 1;
  const scored = DIRS.map((d, i) => {
    let pref = 1;
    if (inDir !== null) {
      const opposite = (inDir + 2) % 4;
      if (i === inDir) pref = 0;
      else if (i === opposite) pref = 2;
      else pref = 1;
    }

    const nr = r + d.dr;
    const nc = c + d.dc;
    let goalPref = 1;
    if (detour >= 1 && nr >= 0 && nc >= 0 && nr < n && nc < n) {
      const curDist = Math.abs(goalR - r) + Math.abs(goalC - c);
      const nextDist = Math.abs(goalR - nr) + Math.abs(goalC - nc);
      if (nextDist > curDist) goalPref = 0;
      else if (nextDist < curDist) goalPref = 2;
      else goalPref = 1;
    }

    const wanderWeight = detour >= 2 ? 0.55 : detour >= 1 ? 0.3 : 0;
    const combined = pref * (1 - wanderWeight) + goalPref * wanderWeight;
    const jitter = rand();
    const score = combined * (1 + bias * 3) + jitter * (1 - bias);
    return { d, score };
  });
  scored.sort((a, b) => a.score - b.score);
  return scored.map((s) => s.d);
}

function carveMaze(n, seed, detour) {
  const rand = mulberry32(seed);
  const cells = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => N | E | S | W)
  );
  const visited = Array.from({ length: n }, () => Array(n).fill(false));

  function carve(r, c, inDir) {
    visited[r][c] = true;
    const order =
      detour === 0
        ? shuffle([...DIRS], rand)
        : orderNeighbors(inDir, rand, detour, r, c, n);

    for (const d of order) {
      const nr = r + d.dr;
      const nc = c + d.dc;
      if (nr < 0 || nc < 0 || nr >= n || nc >= n) continue;
      if (visited[nr][nc]) continue;
      cells[r][c] &= ~d.bit;
      cells[nr][nc] &= ~d.opp;
      carve(nr, nc, dirIndex(d));
    }
  }

  carve(0, 0, null);

  cells[0][0] &= ~N;
  cells[n - 1][n - 1] &= ~S;

  return {
    size: n,
    seed,
    detour,
    cells,
    start: { r: 0, c: 0 },
    end: { r: n - 1, c: n - 1 },
  };
}

function solutionRatio(maze) {
  const path = solveBFS(maze);
  if (!path.length) return 0;
  const minLen = 2 * maze.size - 2;
  return path.length / minLen;
}

/**
 * @param {number} size grid dimension 4–20
 * @param {number} seed PRNG seed
 * @param {number} [detour=1] detour level 0–3 (Short → Twisty)
 */
export function generateMaze(size, seed, detour = 1) {
  const n = Math.max(4, Math.min(20, size | 0));
  const s = (seed >>> 0) || 1;
  const d = Math.max(0, Math.min(3, detour | 0));
  const minRatio = MIN_SOLUTION_RATIO[d] ?? 0;

  if (minRatio === 0) {
    return { ...carveMaze(n, s, d), seed: s };
  }

  for (let attempt = 0; attempt < MAX_REJECT_ATTEMPTS; attempt++) {
    const trySeed = (s + attempt) >>> 0;
    const maze = carveMaze(n, trySeed, d);
    if (solutionRatio(maze) >= minRatio) {
      return { ...maze, seed: s };
    }
  }

  return { ...carveMaze(n, s, d), seed: s };
}

export function canMove(cells, r, c, nr, nc) {
  const n = cells.length;
  if (nr < 0 || nc < 0 || nr >= n || nc >= n) return false;
  const dr = nr - r;
  const dc = nc - c;
  if (Math.abs(dr) + Math.abs(dc) !== 1) return false;
  const walls = cells[r][c];
  if (dr === -1) return (walls & N) === 0;
  if (dr === 1) return (walls & S) === 0;
  if (dc === -1) return (walls & W) === 0;
  if (dc === 1) return (walls & E) === 0;
  return false;
}

export function openNeighbors(cells, r, c) {
  const result = [];
  for (const d of DIRS) {
    const nr = r + d.dr;
    const nc = c + d.dc;
    if (canMove(cells, r, c, nr, nc)) result.push({ r: nr, c: nc });
  }
  return result;
}

/**
 * Shortest path from start to end via BFS.
 * @returns {{r:number,c:number}[]}
 */
export function solveBFS(maze) {
  const { cells, start, end } = maze;
  const n = cells.length;
  const key = (r, c) => r * n + c;
  const queue = [{ r: start.r, c: start.c }];
  const prev = new Map();
  prev.set(key(start.r, start.c), null);

  while (queue.length) {
    const cur = queue.shift();
    if (cur.r === end.r && cur.c === end.c) break;
    for (const nb of openNeighbors(cells, cur.r, cur.c)) {
      const k = key(nb.r, nb.c);
      if (prev.has(k)) continue;
      prev.set(k, cur);
      queue.push(nb);
    }
  }

  const endKey = key(end.r, end.c);
  if (!prev.has(endKey)) return [];

  const path = [];
  let node = { r: end.r, c: end.c };
  while (node) {
    path.push(node);
    node = prev.get(key(node.r, node.c));
  }
  path.reverse();
  return path;
}

/**
 * Next hint steps from current position along the solution path.
 * If current is not on the solution, find nearest solution cell via BFS then continue.
 */
export function getHintSteps(maze, solution, current, count = 4) {
  if (!solution.length || !current) return [];

  let idx = solution.findIndex((p) => p.r === current.r && p.c === current.c);
  if (idx === -1) {
    const onPath = findNearestSolutionIndex(maze, solution, current);
    if (onPath === -1) return solution.slice(0, Math.min(count, solution.length));
    idx = onPath;
    const steps = [];
    const target = solution[idx];
    if (target.r !== current.r || target.c !== current.c) {
      const bridge = shortestPathBetween(maze, current, target);
      for (let i = 1; i < bridge.length && steps.length < count; i++) {
        steps.push(bridge[i]);
      }
      if (steps.length >= count) return steps;
      for (let i = idx + 1; i < solution.length && steps.length < count; i++) {
        steps.push(solution[i]);
      }
      return steps;
    }
  }

  return solution.slice(idx + 1, idx + 1 + count);
}

function findNearestSolutionIndex(maze, solution, current) {
  const { cells } = maze;
  const n = cells.length;
  const key = (r, c) => r * n + c;
  const solIndex = new Map();
  solution.forEach((p, i) => solIndex.set(key(p.r, p.c), i));

  const queue = [{ r: current.r, c: current.c }];
  const seen = new Set([key(current.r, current.c)]);
  while (queue.length) {
    const cur = queue.shift();
    const si = solIndex.get(key(cur.r, cur.c));
    if (si !== undefined) return si;
    for (const nb of openNeighbors(cells, cur.r, cur.c)) {
      const k = key(nb.r, nb.c);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push(nb);
    }
  }
  return -1;
}

function shortestPathBetween(maze, from, to) {
  const { cells } = maze;
  const n = cells.length;
  const key = (r, c) => r * n + c;
  const queue = [{ r: from.r, c: from.c }];
  const prev = new Map([[key(from.r, from.c), null]]);

  while (queue.length) {
    const cur = queue.shift();
    if (cur.r === to.r && cur.c === to.c) break;
    for (const nb of openNeighbors(cells, cur.r, cur.c)) {
      const k = key(nb.r, nb.c);
      if (prev.has(k)) continue;
      prev.set(k, cur);
      queue.push(nb);
    }
  }

  const endKey = key(to.r, to.c);
  if (!prev.has(endKey)) return [from];
  const path = [];
  let node = { r: to.r, c: to.c };
  while (node) {
    path.push(node);
    node = prev.get(key(node.r, node.c));
  }
  path.reverse();
  return path;
}
