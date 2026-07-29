/**
 * Node smoke tests for maze generation, solve, seeds, URL helpers.
 * Run: node --experimental-vm-modules js/smoke-test.mjs
 * (or: node js/smoke-test.mjs with import assertions)
 */

import { generateMaze, solveBFS, canMove, getHintSteps, analyzeMaze } from "./maze.js";
import {
  mulberry32,
  hashString,
  dailySeed,
  dailyDotsSeed,
  dailyTraceSeed,
  deriveSeed,
  formatTime,
  GAME_PATHS,
  PATH_TO_GAME,
} from "./common.js";
import {
  difficultyLabel,
  detourLabel,
  DAILY_SIZE,
  DAILY_DETOUR,
} from "./utils.js";
import {
  samplePaths,
  buildPuzzleFromPaths,
  labelForIndex,
  pickDailyPicture,
  resolvePictureGuides,
} from "./dots.js";
import {
  resolveTraceGlyph,
  listTraceGlyphs,
  pickDailyTraceGlyph,
  guideStyleForDifficulty,
} from "./trace.js";
import { getGlyphTip, ENCOURAGE_TIPS } from "./trace-tips.js";
import { letterPaths, numberPaths, shapePaths } from "./dots-shapes.js";
import { buildMemoryDeck, MEMORY_DIFFICULTY, dailyMemorySeed } from "./memory.js";
import { buildWordSearch, SEARCH_DIFFICULTY, lineCells, dailySearchSeed } from "./search.js";
import library from "./dots-library.json" with { type: "json" };
import memoryThemes from "./memory-themes.json" with { type: "json" };
import searchWords from "./search-words.json" with { type: "json" };

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

// Detour determinism
{
  const a = generateMaze(10, 42, 2);
  const b = generateMaze(10, 42, 2);
  assert(
    JSON.stringify(a.cells) === JSON.stringify(b.cells),
    "same seed+size+detour => same maze"
  );
  const c = generateMaze(10, 42, 0);
  assert(
    JSON.stringify(a.cells) !== JSON.stringify(c.cells),
    "different detour => different maze"
  );
}

// Daily seed stable
{
  const d = new Date(2026, 6, 28); // local Jul 28 2026
  const s1 = dailySeed(d);
  const s2 = dailySeed(d);
  assert(s1 === s2 && s1 > 0, "daily seed stable");
  assert(DAILY_SIZE === 8, "daily size is 8");
  assert(DAILY_DETOUR === 2, "daily detour is 2 (Tricky)");
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

// Higher detour tends to more dead ends and junctions
{
  const n = 12;
  const samples = 20;
  let sumSimpleDead = 0;
  let sumExpertDead = 0;
  let sumSimpleJunctions = 0;
  let sumExpertJunctions = 0;
  for (let i = 0; i < samples; i++) {
    const simple = analyzeMaze(generateMaze(n, 1000 + i, 0));
    const expert = analyzeMaze(generateMaze(n, 1000 + i, 3));
    sumSimpleDead += simple.deadEnds;
    sumExpertDead += expert.deadEnds;
    sumSimpleJunctions += simple.junctions;
    sumExpertJunctions += expert.junctions;
  }
  assert(
    sumExpertDead / samples > sumSimpleDead / samples,
    "expert style averages more dead ends than simple"
  );
  assert(
    sumExpertJunctions / samples > sumSimpleJunctions / samples,
    "expert style averages more junctions than simple"
  );
}

// Labels
{
  assert(difficultyLabel(4) === "Easy", "easy");
  assert(difficultyLabel(8) === "Medium", "medium");
  assert(difficultyLabel(12) === "Hard", "hard");
  assert(difficultyLabel(20) === "Expert", "expert");
  assert(detourLabel(0) === "Simple", "simple style");
  assert(detourLabel(1) === "Lots of paths", "lots of paths style");
  assert(detourLabel(2) === "Tricky dead ends", "tricky dead ends style");
  assert(detourLabel(3) === "Very tricky", "very tricky style");
  assert(formatTime(65000) === "1:05.0", "formatTime");
}

// Derive seeds differ
{
  const a = deriveSeed(100, 0);
  const b = deriveSeed(100, 1);
  assert(a !== b, "worksheet seeds differ");
}

assert(hashString("abc") === hashString("abc"), "hash stable");

// Path-based game URLs
{
  assert(GAME_PATHS.mazes === "maze", "mazes path is /maze");
  assert(GAME_PATHS.dots === "connect", "dots path is /connect");
  assert(GAME_PATHS.trace === "trace", "trace path is /trace");
  assert(GAME_PATHS.memory === "memory", "memory path is /memory");
  assert(GAME_PATHS.search === "search", "search path is /search");
  assert(GAME_PATHS.home === "", "home path is site root");
  assert(PATH_TO_GAME.maze === "mazes", "maze maps to mazes");
  assert(PATH_TO_GAME.connect === "dots", "connect maps to dots");
  assert(PATH_TO_GAME.trace === "trace", "trace maps to trace");
  assert(PATH_TO_GAME.memory === "memory", "memory maps to memory");
  assert(PATH_TO_GAME.search === "search", "search maps to search");
}

// Home route stays home (maze must not own the URL on boot)
{
  assert(GAME_PATHS.home === "", "home has empty path segment");
}

// Dots sampling
{
  const paths = [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]];
  const pts = samplePaths(paths, 8);
  assert(pts.length === 8, "samplePaths returns requested count");
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  assert(Math.max(...xs) - Math.min(...xs) >= 0.5, "samplePaths spans canvas width");
  assert(Math.max(...ys) - Math.min(...ys) >= 0.5, "samplePaths spans canvas height");
}

// Dots puzzle build
{
  const heart = shapePaths("heart");
  const puzzle = buildPuzzleFromPaths(heart.paths, "easy", "numbers");
  assert(puzzle.points.length >= 8 && puzzle.points.length <= 12, "easy puzzle respects spacing cap");
  assert(puzzle.labels[0] === "1", "number labels start at 1");
  const letters = buildPuzzleFromPaths(heart.paths, "medium", "letters");
  assert(letters.labels[0] === "A", "letter labels start at A");
  assert(labelForIndex(2, "skip") === "6", "skip counting labels");
}

// Daily dots picture stable
{
  const d = new Date(2026, 6, 28);
  const lib = { pictures: library.pictures };
  const p1 = pickDailyPicture(lib, d);
  const p2 = pickDailyPicture(lib, d);
  assert(p1.id === p2.id, "daily dots picture stable");
  assert(dailyDotsSeed(d) > 0, "daily dots seed positive");
}

// Dots regression: spacing and clustering
{
  const butterfly = library.pictures.find((p) => p.id === "butterfly");
  const puzzle = buildPuzzleFromPaths(butterfly.paths, "medium", "numbers", {
    guides: butterfly.guides,
  });
  assert(puzzle.points.length >= 15 && puzzle.points.length <= 25, "butterfly medium respects spacing");
  assert(puzzle.guides.length >= 3, "butterfly has pre-drawn guides");

  let closePairs = 0;
  for (let i = 0; i < puzzle.points.length; i++) {
    for (let j = i + 1; j < puzzle.points.length; j++) {
      const dx = puzzle.points[i].x - puzzle.points[j].x;
      const dy = puzzle.points[i].y - puzzle.points[j].y;
      if (Math.hypot(dx, dy) < 0.05) closePairs++;
    }
  }
  assert(closePairs === 0, "butterfly has no overlapping dot pairs");

  const flower = library.pictures.find((p) => p.id === "flower");
  const flowerPuzzle = buildPuzzleFromPaths(flower.paths, "medium", "numbers");
  let flowerClose = 0;
  for (let i = 0; i < flowerPuzzle.points.length; i++) {
    for (let j = i + 1; j < flowerPuzzle.points.length; j++) {
      const dx = flowerPuzzle.points[i].x - flowerPuzzle.points[j].x;
      const dy = flowerPuzzle.points[i].y - flowerPuzzle.points[j].y;
      if (Math.hypot(dx, dy) < 0.08) flowerClose++;
    }
  }
  assert(flowerClose === 0, "flower has no overlapping dots");

  const letterG = buildPuzzleFromPaths(letterPaths("G").paths, "medium", "numbers", { compact: true });
  let gClose = 0;
  for (let i = 0; i < letterG.points.length; i++) {
    for (let j = i + 1; j < letterG.points.length; j++) {
      const dx = letterG.points[i].x - letterG.points[j].x;
      const dy = letterG.points[i].y - letterG.points[j].y;
      if (Math.hypot(dx, dy) < 0.08) gClose++;
    }
  }
  assert(gClose === 0, "letter G has no overlapping dots");

  let tinySegs = 0;
  for (let i = 1; i < puzzle.points.length; i++) {
    const a = puzzle.points[i - 1];
    const b = puzzle.points[i];
    if (Math.hypot(b.x - a.x, b.y - a.y) < 0.04) tinySegs++;
  }
  assert(tinySegs === 0, "no tiny consecutive segments");

  const xs = puzzle.points.map((p) => p.x);
  const bboxW = Math.max(...xs) - Math.min(...xs);
  assert(bboxW >= 0.55, "butterfly uses most of canvas width");
}

// Scaffolded guides on all curated pictures (not letters/numbers)
{
  assert(typeof resolvePictureGuides === "function", "resolvePictureGuides exported");
  for (const pic of library.pictures) {
    assert(Array.isArray(pic.guides) && pic.guides.length > 0, `${pic.id} has pre-drawn guides`);
    assert(pic.paths.length >= 1 && pic.paths.length <= 2, `${pic.id} has a clear connect outline`);
    const puzzle = buildPuzzleFromPaths(pic.paths, "medium", "numbers", { guides: pic.guides });
    assert(puzzle.guides.length === pic.guides.length, `${pic.id} guides survive fit`);
    assert(puzzle.points.length >= 8, `${pic.id} has enough outline dots`);
    let close = 0;
    for (let i = 0; i < puzzle.points.length; i++) {
      for (let j = i + 1; j < puzzle.points.length; j++) {
        const dx = puzzle.points[i].x - puzzle.points[j].x;
        const dy = puzzle.points[i].y - puzzle.points[j].y;
        if (Math.hypot(dx, dy) < 0.08) close++;
      }
    }
    assert(close === 0, `${pic.id} has no overlapping dots`);
  }
}

// Generated letter paths
{
  const a = letterPaths("A");
  assert(a?.paths?.length >= 2, "letter A has multiple strokes");
  assert(a.paths[0].length >= 2, "letter A stroke has points");
}

// Manuscript stroke order: stems start at the top (y small), not the bottom
{
  const topStarters = {
    A: true, B: true, D: true, E: true, F: true, H: true, I: true, J: true,
    K: true, L: true, M: true, N: true, P: true, R: true, T: true, U: true,
    V: true, W: true, X: true, Y: true, Z: true,
    1: true, 4: true, 5: true, 7: true, 9: true,
  };
  for (const ch of Object.keys(topStarters)) {
    const data = /[A-Z]/.test(ch) ? letterPaths(ch) : numberPaths(ch);
    const first = data.paths[0][0];
    assert(first.y <= 0.35, `${ch} first stroke starts near the top (y=${first.y})`);
  }
  const p = letterPaths("P");
  assert(p.paths.length === 2, "P uses stem then bowl");
  assert(p.paths[0][0].y < p.paths[0][p.paths[0].length - 1].y, "P stem goes top to bottom");
  const nine = numberPaths("9");
  assert(nine.paths[0][0].y <= 0.2, "9 starts at top of the bowl");
}

// Trace letters & numbers
{
  const a = resolveTraceGlyph("letter", "a");
  assert(a?.glyph === "A" && a.paths.length >= 2, "resolveTraceGlyph letter A");
  const lowerA = resolveTraceGlyph("letter", "a", "lower");
  assert(lowerA?.glyph === "a" && lowerA.paths.length >= 1, "resolveTraceGlyph lowercase a");
  const five = resolveTraceGlyph("number", "5");
  assert(five?.glyph === "5" && five.paths.length >= 1, "resolveTraceGlyph number 5");
  assert(listTraceGlyphs("letter").length === 26, "26 letters");
  assert(listTraceGlyphs("letter", "lower").length === 26, "26 lowercase letters");
  assert(listTraceGlyphs("number").length === 10, "10 digits");
  assert(letterPaths("a")?.case === "lower", "letterPaths lowercase");
  assert(letterPaths("A")?.case === "upper", "letterPaths uppercase");
  const d = new Date(2026, 6, 28);
  const g1 = pickDailyTraceGlyph(d);
  const g2 = pickDailyTraceGlyph(d);
  assert(g1.id === g2.id, "daily trace glyph stable");
  assert(dailyTraceSeed(d) > 0, "daily trace seed positive");
  const easy = guideStyleForDifficulty("easy");
  assert(easy.showArrows && easy.showStrokeNumbers, "easy guides show arrows and numbers");
  const hard = guideStyleForDifficulty("hard");
  assert(!hard.showArrows && !hard.showLines, "hard guides are minimal");
}

// Parent tips for Trace
{
  const p = getGlyphTip("letter", "P");
  assert(p?.steps?.length >= 2, "P has parent stroke steps");
  assert(/top/i.test(p.steps[0]), "P tip starts from the top");
  const nine = getGlyphTip("number", "9");
  assert(nine?.steps?.length >= 1, "9 has parent stroke steps");
  for (const ch of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    assert(getGlyphTip("letter", ch)?.steps?.length > 0, `tip for ${ch}`);
  }
  for (const n of "0123456789") {
    assert(getGlyphTip("number", n)?.steps?.length > 0, `tip for ${n}`);
  }
  assert(ENCOURAGE_TIPS.length >= 5, "encouragement tips available");
}

// Memory Match
{
  const deck = buildMemoryDeck(memoryThemes, "animals", "easy", 42);
  assert(deck.cards.length === 4, "easy memory has 4 cards");
  assert(deck.pairs === 2, "easy memory has 2 pairs");
  const ids = deck.cards.map((c) => c.pairId).sort();
  assert(ids[0] === ids[1] && ids[2] === ids[3], "memory cards come in pairs");
  const med = buildMemoryDeck(memoryThemes, "food", "medium", 7);
  assert(med.cards.length === MEMORY_DIFFICULTY.medium.pairs * 2, "medium memory card count");
  const a = buildMemoryDeck(memoryThemes, "animals", "hard", 99);
  const b = buildMemoryDeck(memoryThemes, "animals", "hard", 99);
  assert(JSON.stringify(a.cards) === JSON.stringify(b.cards), "memory deck deterministic");
  const d = new Date(2026, 6, 28);
  assert(dailyMemorySeed(d) === dailyMemorySeed(d) && dailyMemorySeed(d) > 0, "daily memory seed stable");
  assert(memoryThemes.categories.length >= 6, "memory themes loaded");
}

// Word Search
{
  const puz = buildWordSearch(searchWords, "animals", "easy", 42);
  assert(puz.size === SEARCH_DIFFICULTY.easy.size, "easy search grid size");
  assert(puz.words.length >= 3, "easy search places several words");
  for (const w of puz.words) {
    const spelled = w.cells.map((cell) => puz.grid[cell.r][cell.c]).join("");
    assert(spelled === w.word, `placed word ${w.word} matches cells`);
  }
  const hard = buildWordSearch(searchWords, "space", "hard", 123);
  assert(hard.size === 14 && hard.words.length >= 6, "hard search has larger grid");
  const a = buildWordSearch(searchWords, "food", "medium", 55);
  const b = buildWordSearch(searchWords, "food", "medium", 55);
  assert(JSON.stringify(a.grid) === JSON.stringify(b.grid), "word search deterministic");
  const line = lineCells({ r: 0, c: 0 }, { r: 3, c: 0 });
  assert(line.length === 4 && line[3].r === 3, "lineCells vertical");
  const diag = lineCells({ r: 1, c: 1 }, { r: 4, c: 4 });
  assert(diag.every((p, i) => p.r === 1 + i && p.c === 1 + i), "lineCells diagonal");
  const d = new Date(2026, 6, 28);
  assert(dailySearchSeed(d) === dailySearchSeed(d) && dailySearchSeed(d) > 0, "daily search seed stable");
  assert(searchWords.categories.length >= 6, "search word lists loaded");
}

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll smoke tests passed.");
