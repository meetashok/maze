/**
 * Maze generation (multiple algorithms) and BFS solving.
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

const MAX_QUALITY_ATTEMPTS = 16;
const BRAID_PROB = 0.1;

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

function finishMaze(cells, n, seed, detour) {
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

function minStats(n, detour) {
  if (detour >= 3) {
    return {
      junctions: Math.max(4, Math.floor(n * 0.55)),
      deadEnds: Math.max(6, Math.floor(n * 1.1)),
    };
  }
  if (detour >= 2) {
    return {
      junctions: Math.max(3, Math.floor(n * 0.4)),
      deadEnds: Math.max(4, Math.floor(n * 0.75)),
    };
  }
  return { junctions: 0, deadEnds: 0 };
}

function passesQuality(maze, detour) {
  const mins = minStats(maze.size, detour);
  if (!mins.junctions && !mins.deadEnds) return true;
  const { junctions, deadEnds } = analyzeMaze(maze);
  return junctions >= mins.junctions && deadEnds >= mins.deadEnds;
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

/** Light braiding: remove some dead-end walls to add loops (expert only). */
function braidMaze(cells, n, rand, prob = BRAID_PROB) {
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

function buildCells(n, seed, detour) {
  const rand = mulberry32(seed);
  if (detour <= 0) return carveDFS(n, rand);
  if (detour === 1) return carveWilson(n, rand);
  const cells = carveKruskal(n, rand);
  if (detour >= 3) braidMaze(cells, n, rand, BRAID_PROB);
  return cells;
}

/**
 * @param {number} size grid dimension 4–20
 * @param {number} seed PRNG seed
 * @param {number} [detour=1] 0 Simple, 1 Branchy, 2 Tricky, 3 Expert
 */
export function generateMaze(size, seed, detour = 1) {
  const n = Math.max(4, Math.min(20, size | 0));
  const s = (seed >>> 0) || 1;
  const d = Math.max(0, Math.min(3, detour | 0));

  if (d < 2) {
    const cells = buildCells(n, s, d);
    return finishMaze(cells, n, s, d);
  }

  for (let attempt = 0; attempt < MAX_QUALITY_ATTEMPTS; attempt++) {
    const trySeed = (s + attempt) >>> 0;
    const cells = buildCells(n, trySeed, d);
    const maze = finishMaze(cells, n, s, d);
    if (passesQuality(maze, d)) return maze;
  }

  const cells = buildCells(n, s, d);
  return finishMaze(cells, n, s, d);
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
