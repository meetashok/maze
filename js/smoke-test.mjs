/**
 * Node smoke tests for maze generation, solve, seeds, URL helpers.
 * Run: node --experimental-vm-modules js/smoke-test.mjs
 * (or: node js/smoke-test.mjs with import assertions)
 */

import { generateMaze, solveBFS, canMove, getHintSteps } from "./maze.js";
import {
  mulberry32,
  hashString,
  dailySeed,
  deriveSeed,
  difficultyLabel,
  formatTime,
  DAILY_SIZE,
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

// Determinism
{
  const a = generateMaze(10, 42);
  const b = generateMaze(10, 42);
  assert(
    JSON.stringify(a.cells) === JSON.stringify(b.cells),
    "same seed+size => same maze"
  );
  const c = generateMaze(10, 43);
  assert(
    JSON.stringify(a.cells) !== JSON.stringify(c.cells),
    "different seed => different maze"
  );
}

// Always solvable & path reaches end
{
  for (const size of [4, 8, 15, 20]) {
    for (const seed of [1, 999, 123456]) {
      const maze = generateMaze(size, seed);
      const path = solveBFS(maze);
      assert(path.length > 0, `solvable ${size} seed ${seed}`);
      assert(path[0].r === 0 && path[0].c === 0, `starts at origin ${size}`);
      const last = path[path.length - 1];
      assert(
        last.r === size - 1 && last.c === size - 1,
        `ends at exit ${size} seed ${seed}`
      );
      // Path steps are adjacent and open
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
      assert(ok, `path corridors valid ${size} seed ${seed}`);
    }
  }
}

// Daily seed stable
{
  const d = new Date(2026, 6, 28); // local Jul 28 2026
  const s1 = dailySeed(d);
  const s2 = dailySeed(d);
  assert(s1 === s2 && s1 > 0, "daily seed stable");
  assert(DAILY_SIZE === 8, "daily size is 8");
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

// Hints
{
  const maze = generateMaze(8, 55);
  const sol = solveBFS(maze);
  const hints = getHintSteps(maze, sol, sol[0], 4);
  assert(hints.length === 4, "hint returns 4 steps from start");
  assert(hints[0].r === sol[1].r && hints[0].c === sol[1].c, "hint follows solution");
}

// Difficulty + format
{
  assert(difficultyLabel(4) === "Easy", "easy");
  assert(difficultyLabel(8) === "Medium", "medium");
  assert(difficultyLabel(12) === "Hard", "hard");
  assert(difficultyLabel(20) === "Expert", "expert");
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
