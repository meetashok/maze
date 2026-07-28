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

function shuffle(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * @returns {{ size: number, seed: number, cells: number[][], start: {r:number,c:number}, end: {r:number,c:number} }}
 */
export function generateMaze(size, seed) {
  const n = Math.max(4, Math.min(20, size | 0));
  const s = (seed >>> 0) || 1;
  const rand = mulberry32(s);
  const cells = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => N | E | S | W)
  );

  const visited = Array.from({ length: n }, () => Array(n).fill(false));

  function carve(r, c) {
    visited[r][c] = true;
    const order = shuffle([...DIRS], rand);
    for (const d of order) {
      const nr = r + d.dr;
      const nc = c + d.dc;
      if (nr < 0 || nc < 0 || nr >= n || nc >= n) continue;
      if (visited[nr][nc]) continue;
      cells[r][c] &= ~d.bit;
      cells[nr][nc] &= ~d.opp;
      carve(nr, nc);
    }
  }

  carve(0, 0);

  // Open outer walls at entrance (top) and exit (bottom) for readability
  cells[0][0] &= ~N;
  cells[n - 1][n - 1] &= ~S;

  return {
    size: n,
    seed: s,
    cells,
    start: { r: 0, c: 0 },
    end: { r: n - 1, c: n - 1 },
  };
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
    // Walk toward solution: find first solution cell reachable as next open neighbor preference
    // Fall back to start of solution from nearest point
    const onPath = findNearestSolutionIndex(maze, solution, current);
    if (onPath === -1) return solution.slice(0, Math.min(count, solution.length));
    idx = onPath;
    // Include the nearest solution cell as first hint step if not current
    const steps = [];
    const target = solution[idx];
    if (target.r !== current.r || target.c !== current.c) {
      // Build short path from current to that solution cell
      const bridge = shortestPathBetween(maze, current, target);
      for (let i = 1; i < bridge.length && steps.length < count; i++) {
        steps.push(bridge[i]);
      }
      if (steps.length >= count) return steps;
      // Continue along solution after target
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
