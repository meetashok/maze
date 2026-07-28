/**
 * Node smoke tests for maze generation, solve, seeds, URL helpers.
 * Run: node js/smoke-test.mjs
 */

import { generateMaze, solveBFS, canMove } from "./maze.js";
import {
  mulberry32,
  hashString,
  dailySeed,
  deriveSeed,
  difficultyLabel,
  detourLabel,
  formatTime,
  DAILY_SIZE,
  DAILY_DETOUR,
} from "./utils.js";

let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed++;
  } else {
    console.log("ok:", msg);
  }
}

function solutionRatio(maze) {
  const path = solveBFS(maze);
  if (!path.length) return 0;
  return path.length / (2 * maze.size - 2);
}

// Determinism
{
  const a = generateMaze(10, 42, 2);
  const b = generateMaze(10, 42, 2);
  assert(
    JSON.stringify(a.cells) === JSON.stringify(b.cells),
    "same size+seed+detour => same maze"
  );
  const c = generateMaze(10, 42, 0);
  assert(
    JSON.stringify(a.cells) !== JSON.stringify(c.cells),
    "different detour => different maze"
  );
  const d = generateMaze(10, 999, 2);
  assert(
    JSON.stringify(a.cells) !== JSON.stringify(d.cells),
    "different seed => different maze"
  );
}

// Always solvable & path reaches end
{
  for (const size of [4, 8, 15, 20]) {
    for (const detour of [0, 1, 2, 3]) {
      for (const seed of [1, 999, 123456]) {
        const maze = generateMaze(size, seed, detour);
        const path = solveBFS(maze);
        assert(path.length > 0, `solvable ${size} detour ${detour} seed ${seed}`);
        assert(path[0].r === 0 && path[0].c === 0, `starts at origin ${size}`);
        const last = path[path.length - 1];
        assert(
          last.r === size - 1 && last.c === size - 1,
          `ends at exit ${size} detour ${detour} seed ${seed}`
        );
        let ok = true;
        for (let i = 1; i < path.length; i++) {
          if (
            !canMove(
              maze.cells,
              path[i - 1].r,
              path[i - 1].c,
              path[i].r,
              path[i].c
            )
          ) {
            ok = false;
            break;
          }
        }
        assert(ok, `path corridors valid ${size} detour ${detour} seed ${seed}`);
      }
    }
  }
}

// Daily seed stable
{
  const d = new Date(2026, 6, 28);
  const s1 = dailySeed(d);
  const s2 = dailySeed(d);
  assert(s1 === s2 && s1 > 0, "daily seed stable");
  assert(DAILY_SIZE === 8, "daily size is 8");
  assert(DAILY_DETOUR === 2, "daily detour is 2 (Long)");
}

// PRNG range
{
  const rand = mulberry32(7);
  let inRange = true;
  for (let i = 0; i < 1000; i++) {
    const v = rand();
    if (!(v >= 0 && v < 1)) inRange = false;
  }
  assert(inRange, "mulberry32 in [0,1)");
}

// Higher detour tends to longer solution paths
{
  const n = 12;
  const samples = 20;
  let sumShort = 0;
  let sumTwisty = 0;
  for (let i = 0; i < samples; i++) {
    sumShort += solutionRatio(generateMaze(n, 1000 + i, 0));
    sumTwisty += solutionRatio(generateMaze(n, 1000 + i, 3));
  }
  assert(
    sumTwisty / samples > sumShort / samples,
    "twisty detours average longer solution than short"
  );
}

// Labels
{
  assert(difficultyLabel(4) === "Easy", "easy");
  assert(difficultyLabel(8) === "Medium", "medium");
  assert(detourLabel(0) === "Short", "short detour");
  assert(detourLabel(2) === "Long", "long detour");
  assert(detourLabel(3) === "Twisty", "twisty detour");
  assert(formatTime(65000) === "1:05.0", "formatTime");
}

// Derive seeds differ
{
  const a = deriveSeed(100, 0);
  const b = deriveSeed(100, 1);
  assert(a !== b, "worksheet seeds differ");
}

assert(hashString("abc") === hashString("abc"), "hash stable");

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll smoke tests passed.");
