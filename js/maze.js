/**
 * Maze generation (multiple algorithms) and BFS solving.
 */

import { mulberry32 } from "./utils.js";

export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;

/** Max style index: 0 Simple … 4 Confusing paths */
export const MAX_DETOUR = 4;

const DIRS = [
  { bit: N, opp: S, dr: -1, dc: 0 },
  { bit: E, opp: W, dr: 0, dc: 1 },
  { bit: S, opp: N, dr: 1, dc: 0 },
  { bit: W, opp: E, dr: 0, dc: -1 },
];

const MAX_QUALITY_ATTEMPTS = 24;
/** Braid dead-end walls → loops. Higher = less wall-followable. */
const BRAID_DEAD_END = {
  3: 0.28,
  4: 0.42,
};
/** Extra mid-corridor loops for Confusing paths. */
const BRAID_PASSAGE = {
  4: 0.12,
};

function shuffle(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function emptyGrid(n) {
  return Array.from({ length: n }, () =>
    Array.from({ length: n }, () => N | E | S | W)
  );
}

function removeWall(cells, r, c, d) {
  cells[r][c] &= ~d.bit;
  cells[r + d.dr][c + d.dc] &= ~d.opp;
}

function openCount(cells, r, c) {
  const w = cells[r][c];
  return 4 - ((w & N ? 1 : 0) + (w & E ? 1 : 0) + (w & S ? 1 : 0) + (w & W ? 1 : 0));
}

function cellKey(n, r, c) {
  return r * n + c;
}

/** Open the outer wall(s) at an edge/corner cell so start/end read clearly. */
function openExterior(cells, n, cell) {
  if (cell.r === 0) cells[cell.r][cell.c] &= ~N;
  if (cell.r === n - 1) cells[cell.r][cell.c] &= ~S;
  if (cell.c === 0) cells[cell.r][cell.c] &= ~W;
  if (cell.c === n - 1) cells[cell.r][cell.c] &= ~E;
}

function edgeCells(n) {
  const edges = [];
  for (let i = 0; i < n; i++) {
    edges.push({ r: 0, c: i });
    edges.push({ r: n - 1, c: i });
    if (i > 0 && i < n - 1) {
      edges.push({ r: i, c: 0 });
      edges.push({ r: i, c: n - 1 });
    }
  }
  return edges;
}

/**
 * Classic corners for easier styles; varied far-apart edge points for harder styles
 * so kids can't always aim "toward the bottom-right."
 */
function pickStartEnd(n, rand, detour) {
  if (detour < 3) {
    return { start: { r: 0, c: 0 }, end: { r: n - 1, c: n - 1 } };
  }
  const edges = edgeCells(n);
  shuffle(edges, rand);
  const start = edges[0];
  const minDist = Math.max(3, Math.floor(n * 0.75));
  let end = null;
  let best = -1;
  for (let i = 1; i < edges.length; i++) {
    const cand = edges[i];
    if (cand.r === start.r && cand.c === start.c) continue;
    const dist = Math.abs(cand.r - start.r) + Math.abs(cand.c - start.c);
    if (dist < minDist) continue;
    if (dist > best) {
      best = dist;
      end = cand;
    }
  }
  if (!end) {
    for (let i = 1; i < edges.length; i++) {
      const cand = edges[i];
      if (cand.r === start.r && cand.c === start.c) continue;
      const dist = Math.abs(cand.r - start.r) + Math.abs(cand.c - start.c);
      if (dist > best) {
        best = dist;
        end = cand;
      }
    }
  }
  return { start, end: end || { r: n - 1, c: n - 1 } };
}

function finishMaze(cells, n, seed, detour, start, end) {
  openExterior(cells, n, start);
  openExterior(cells, n, end);
  return {
    size: n,
    seed,
    detour,
    cells,
    start: { r: start.r, c: start.c },
    end: { r: end.r, c: end.c },
  };
}

/** Count junctions (3+ ways) and dead ends (1 way) for difficulty tuning. */
export function analyzeMaze(maze) {
  const { cells } = maze;
  const n = cells.length;
  let junctions = 0;
  let deadEnds = 0;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const deg = openCount(cells, r, c);
      if (deg >= 3) junctions++;
      if (deg === 1) deadEnds++;
    }
  }
  return { junctions, deadEnds };
}

/**
 * Measure false-path (spur) lengths off the shortest solution.
 * Longer spurs = more convincing wrong turns.
 */
export function analyzeSpurs(maze) {
  const solution = solveBFS(maze);
  if (solution.length < 2) {
    return { longSpurs: 0, maxSpur: 0, avgSpur: 0, spurCount: 0 };
  }
  const n = maze.size;
  const onSol = new Set(solution.map((p) => cellKey(n, p.r, p.c)));
  const seenRoot = new Set();
  let longSpurs = 0;
  let maxSpur = 0;
  let sum = 0;
  let spurCount = 0;
  const longThresh = Math.max(3, Math.floor(n * 0.4));

  for (const p of solution) {
    for (const nb of openNeighbors(maze.cells, p.r, p.c)) {
      const nk = cellKey(n, nb.r, nb.c);
      if (onSol.has(nk) || seenRoot.has(nk)) continue;
      seenRoot.add(nk);
      const len = measureSpurLength(maze, nb, onSol);
      maxSpur = Math.max(maxSpur, len);
      sum += len;
      spurCount++;
      if (len >= longThresh) longSpurs++;
    }
  }
  return {
    longSpurs,
    maxSpur,
    avgSpur: spurCount ? sum / spurCount : 0,
    spurCount,
  };
}

/** Farthest distance into a false branch before hitting the solution again. */
function measureSpurLength(maze, entry, onSol) {
  const n = maze.size;
  const key = (r, c) => cellKey(n, r, c);
  const queue = [{ r: entry.r, c: entry.c, d: 1 }];
  const seen = new Set([key(entry.r, entry.c)]);
  let maxD = 1;
  while (queue.length) {
    const cur = queue.shift();
    maxD = Math.max(maxD, cur.d);
    for (const nb of openNeighbors(maze.cells, cur.r, cur.c)) {
      const k = key(nb.r, nb.c);
      if (seen.has(k) || onSol.has(k)) continue;
      seen.add(k);
      queue.push({ r: nb.r, c: nb.c, d: cur.d + 1 });
    }
  }
  return maxD;
}

function minStats(n, detour) {
  if (detour >= 4) {
    return {
      junctions: Math.max(5, Math.floor(n * 0.75)),
      deadEnds: Math.max(3, Math.floor(n * 0.55)),
      longSpurs: Math.max(2, Math.floor(n * 0.25)),
      maxSpur: Math.max(4, Math.floor(n * 0.5)),
      minSolution: Math.max(n * 2, Math.floor(n * n * 0.22)),
    };
  }
  if (detour >= 3) {
    return {
      junctions: Math.max(4, Math.floor(n * 0.6)),
      deadEnds: Math.max(5, Math.floor(n * 0.85)),
      longSpurs: Math.max(1, Math.floor(n * 0.2)),
      maxSpur: Math.max(3, Math.floor(n * 0.4)),
      minSolution: 0,
    };
  }
  if (detour >= 2) {
    return {
      junctions: Math.max(3, Math.floor(n * 0.45)),
      deadEnds: Math.max(4, Math.floor(n * 0.8)),
      longSpurs: 0,
      maxSpur: 0,
      minSolution: 0,
    };
  }
  return { junctions: 0, deadEnds: 0, longSpurs: 0, maxSpur: 0, minSolution: 0 };
}

function passesQuality(maze, detour) {
  const mins = minStats(maze.size, detour);
  if (!mins.junctions && !mins.deadEnds) return true;
  const { junctions, deadEnds } = analyzeMaze(maze);
  if (junctions < mins.junctions || deadEnds < mins.deadEnds) return false;
  if (mins.longSpurs || mins.maxSpur || mins.minSolution) {
    const spurs = analyzeSpurs(maze);
    if (spurs.longSpurs < mins.longSpurs) return false;
    if (spurs.maxSpur < mins.maxSpur) return false;
    if (mins.minSolution) {
      const solLen = solveBFS(maze).length;
      if (solLen < mins.minSolution) return false;
    }
  }
  return true;
}

function carveDFS(n, rand) {
  const cells = emptyGrid(n);
  const visited = Array.from({ length: n }, () => Array(n).fill(false));

  function carve(r, c) {
    visited[r][c] = true;
    for (const d of shuffle([...DIRS], rand)) {
      const nr = r + d.dr;
      const nc = c + d.dc;
      if (nr < 0 || nc < 0 || nr >= n || nc >= n || visited[nr][nc]) continue;
      removeWall(cells, r, c, d);
      carve(nr, nc);
    }
  }
  carve(0, 0);
  return cells;
}

function carveWilson(n, rand) {
  const cells = emptyGrid(n);
  const inMaze = Array.from({ length: n }, () => Array(n).fill(false));
  inMaze[0][0] = true;

  let unvisited = n * n - 1;
  while (unvisited > 0) {
    let sr = 0;
    let sc = 0;
    outer: for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!inMaze[r][c]) {
          sr = r;
          sc = c;
          break outer;
        }
      }
    }

    const path = [{ r: sr, c: sc }];
    const pathMap = new Map([[`${sr},${sc}`, 0]]);
    let cr = sr;
    let cc = sc;

    while (!inMaze[cr][cc]) {
      const options = DIRS.filter((d) => {
        const nr = cr + d.dr;
        const nc = cc + d.dc;
        return nr >= 0 && nc >= 0 && nr < n && nc < n;
      });
      if (!options.length) break;
      const d = options[Math.floor(rand() * options.length)];
      const nr = cr + d.dr;
      const nc = cc + d.dc;
      cr = nr;
      cc = nc;
      const key = `${cr},${cc}`;
      if (pathMap.has(key)) {
        const idx = pathMap.get(key);
        path.length = idx + 1;
        pathMap.clear();
        path.forEach((p, i) => pathMap.set(`${p.r},${p.c}`, i));
      } else {
        pathMap.set(key, path.length);
        path.push({ r: cr, c: cc });
      }
    }

    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      const dr = b.r - a.r;
      const dc = b.c - a.c;
      const d = DIRS.find((x) => x.dr === dr && x.dc === dc);
      if (d) removeWall(cells, a.r, a.c, d);
    }
    for (const p of path) {
      if (!inMaze[p.r][p.c]) {
        inMaze[p.r][p.c] = true;
        unvisited--;
      }
    }
  }
  return cells;
}

class UnionFind {
  constructor(n) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.rank = Array(n).fill(0);
  }
  find(x) {
    if (this.parent[x] !== x) this.parent[x] = this.find(this.parent[x]);
    return this.parent[x];
  }
  union(a, b) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return false;
    if (this.rank[ra] < this.rank[rb]) this.parent[ra] = rb;
    else if (this.rank[ra] > this.rank[rb]) this.parent[rb] = ra;
    else {
      this.parent[rb] = ra;
      this.rank[ra]++;
    }
    return true;
  }
}

function carveKruskal(n, rand) {
  const cells = emptyGrid(n);
  const uf = new UnionFind(n * n);
  const edges = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const id = r * n + c;
      if (c + 1 < n) edges.push({ r, c, d: DIRS[1], a: id, b: id + 1 });
      if (r + 1 < n) edges.push({ r, c, d: DIRS[2], a: id, b: id + n });
    }
  }
  shuffle(edges, rand);
  for (const e of edges) {
    if (uf.union(e.a, e.b)) removeWall(cells, e.r, e.c, e.d);
  }
  return cells;
}

/** Remove some dead-end walls to add loops (breaks pure wall-following). */
function braidDeadEnds(cells, n, rand, prob) {
  if (!(prob > 0)) return;
  const dead = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (openCount(cells, r, c) === 1) dead.push({ r, c });
    }
  }
  shuffle(dead, rand);
  for (const cell of dead) {
    if (rand() >= prob) continue;
    if (openCount(cells, cell.r, cell.c) !== 1) continue;
    const options = DIRS.filter((d) => {
      const nr = cell.r + d.dr;
      const nc = cell.c + d.dc;
      if (nr < 0 || nc < 0 || nr >= n || nc >= n) return false;
      return (cells[cell.r][cell.c] & d.bit) !== 0;
    });
    if (!options.length) continue;
    const d = options[Math.floor(rand() * options.length)];
    removeWall(cells, cell.r, cell.c, d);
  }
}

/**
 * Light mid-corridor loops: open a wall from some degree-2 cells.
 * Adds ambiguous junctions without fully opening the maze.
 */
function braidPassages(cells, n, rand, prob) {
  if (!(prob > 0)) return;
  const candidates = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (openCount(cells, r, c) === 2) candidates.push({ r, c });
    }
  }
  shuffle(candidates, rand);
  for (const cell of candidates) {
    if (rand() >= prob) continue;
    if (openCount(cells, cell.r, cell.c) !== 2) continue;
    const options = DIRS.filter((d) => {
      const nr = cell.r + d.dr;
      const nc = cell.c + d.dc;
      if (nr < 0 || nc < 0 || nr >= n || nc >= n) return false;
      return (cells[cell.r][cell.c] & d.bit) !== 0;
    });
    if (!options.length) continue;
    const d = options[Math.floor(rand() * options.length)];
    removeWall(cells, cell.r, cell.c, d);
  }
}

function buildCells(n, seed, detour) {
  const rand = mulberry32(seed);
  if (detour <= 0) return carveDFS(n, rand);
  if (detour === 1) return carveWilson(n, rand);
  const cells = carveKruskal(n, rand);
  if (detour >= 3) braidDeadEnds(cells, n, rand, BRAID_DEAD_END[detour] ?? 0.28);
  if (detour >= 4) braidPassages(cells, n, rand, BRAID_PASSAGE[4]);
  return cells;
}

/**
 * @param {number} size grid dimension 4–20
 * @param {number} seed PRNG seed
 * @param {number} [detour=1] 0 Simple … 4 Confusing paths
 */
export function generateMaze(size, seed, detour = 1) {
  const n = Math.max(4, Math.min(20, size | 0));
  const s = (seed >>> 0) || 1;
  const d = Math.max(0, Math.min(MAX_DETOUR, detour | 0));

  if (d < 2) {
    const cells = buildCells(n, s, d);
    const { start, end } = pickStartEnd(n, mulberry32(s ^ 0x9e3779b9), d);
    return finishMaze(cells, n, s, d, start, end);
  }

  let best = null;
  let bestScore = -1;
  for (let attempt = 0; attempt < MAX_QUALITY_ATTEMPTS; attempt++) {
    const trySeed = (s + attempt) >>> 0;
    const cells = buildCells(n, trySeed, d);
    const { start, end } = pickStartEnd(n, mulberry32(trySeed ^ 0x85ebca6b), d);
    const maze = finishMaze(cells, n, s, d, start, end);
    if (passesQuality(maze, d)) return maze;
    // Keep the richest attempt if quality gates never fully pass
    const stats = analyzeMaze(maze);
    const spurs = analyzeSpurs(maze);
    const score = stats.junctions * 3 + stats.deadEnds + spurs.longSpurs * 4 + spurs.maxSpur;
    if (score > bestScore) {
      bestScore = score;
      best = maze;
    }
  }

  return best || finishMaze(buildCells(n, s, d), n, s, d, { r: 0, c: 0 }, { r: n - 1, c: n - 1 });
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
