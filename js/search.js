/**
 * Word Search  -  find hidden words in a letter grid.
 */

import { celebrate, showCelebrationOverlay, hideCelebrationOverlay } from "./confetti.js";
import { playPop, playBonk } from "./sound.js";
import {
  GameTimer,
  formatTime,
  copyToClipboard,
  buildGameUrl,
  setGameHash,
  parseGameHash,
  mulberry32,
  hashString,
  todayDateString,
} from "./common.js";

const PRINT_CREDIT = "myzoyna.com";
const HIGHLIGHT_COLORS = ["#ff6b4a", "#1f8a7e", "#ffc857", "#5c7cfa", "#6bcb77", "#c77dff"];

const BLOCKLIST = new Set([
  "ASS", "SEX", "DIE", "HELL", "DAMN", "FAG", "GAY", "KIL", "GUN", "WAR",
]);

export const SEARCH_DIFFICULTY = {
  easy: {
    size: 6,
    wordCount: [4, 5],
    len: [3, 4],
    dirs: [
      [0, 1],
      [1, 0],
    ],
  },
  medium: {
    size: 10,
    wordCount: [6, 8],
    len: [4, 6],
    dirs: [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ],
  },
  hard: {
    size: 14,
    wordCount: [10, 12],
    len: [4, 8],
    dirs: [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ],
  },
};

export function dailySearchSeed(date = new Date()) {
  return hashString(`daily-search:${todayDateString(date)}`);
}

async function loadWords() {
  const res = await fetch(new URL("./search-words.json", import.meta.url));
  return res.json();
}

function randInt(rand, n) {
  return Math.floor(rand() * n);
}

function shuffle(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(rand, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function emptyGrid(size) {
  return Array.from({ length: size }, () => Array(size).fill(null));
}

function canPlace(grid, word, r, c, dr, dc) {
  const n = grid.length;
  for (let i = 0; i < word.length; i++) {
    const rr = r + dr * i;
    const cc = c + dc * i;
    if (rr < 0 || cc < 0 || rr >= n || cc >= n) return false;
    const cell = grid[rr][cc];
    if (cell && cell !== word[i]) return false;
  }
  return true;
}

function placeWord(grid, word, r, c, dr, dc) {
  for (let i = 0; i < word.length; i++) {
    grid[r + dr * i][c + dc * i] = word[i];
  }
}

function safeFillLetter(rand, neighbors) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let attempt = 0; attempt < 40; attempt++) {
    const ch = alphabet[randInt(rand, 26)];
    const bad = neighbors.some((n) => n && BLOCKLIST.has((n + ch).slice(-3)));
    if (!bad) return ch;
  }
  return "X";
}

export function buildWordSearch(lib, categoryId, difficulty, seed) {
  const rand = mulberry32(seed >>> 0 || 1);
  const cfg = SEARCH_DIFFICULTY[difficulty] || SEARCH_DIFFICULTY.medium;
  const cat = lib.categories.find((c) => c.id === categoryId) || lib.categories[0];
  const [minLen, maxLen] = cfg.len;
  const [minCount, maxCount] = cfg.wordCount;
  const targetCount = minCount + randInt(rand, maxCount - minCount + 1);

  const pool = shuffle(
    cat.words.filter((w) => w.length >= minLen && w.length <= maxLen && w.length <= cfg.size),
    rand
  );
  const chosen = pool.slice(0, Math.min(targetCount, pool.length));
  const grid = emptyGrid(cfg.size);
  const placed = [];

  for (const word of chosen) {
    let ok = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      const [dr, dc] = cfg.dirs[randInt(rand, cfg.dirs.length)];
      const r = randInt(rand, cfg.size);
      const c = randInt(rand, cfg.size);
      if (!canPlace(grid, word, r, c, dr, dc)) continue;
      placeWord(grid, word, r, c, dr, dc);
      const cells = [];
      for (let i = 0; i < word.length; i++) {
        cells.push({ r: r + dr * i, c: c + dc * i });
      }
      placed.push({ word, cells, color: HIGHLIGHT_COLORS[placed.length % HIGHLIGHT_COLORS.length] });
      ok = true;
      break;
    }
    if (!ok) {
      // skip unplaceable word
    }
  }

  for (let r = 0; r < cfg.size; r++) {
    for (let c = 0; c < cfg.size; c++) {
      if (!grid[r][c]) {
        const neighbors = [
          c > 0 ? grid[r][c - 1] : "",
          r > 0 ? grid[r - 1][c] : "",
          r > 0 && c > 0 ? grid[r - 1][c - 1] : "",
        ];
        grid[r][c] = safeFillLetter(rand, neighbors);
      }
    }
  }

  return {
    category: cat,
    difficulty,
    size: cfg.size,
    grid,
    words: placed,
    seed: seed >>> 0,
  };
}

export function lineCells(start, end) {
  const dr = end.r - start.r;
  const dc = end.c - start.c;
  if (dr === 0 && dc === 0) return [{ r: start.r, c: start.c }];

  const dirs = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  const len = Math.hypot(dr, dc) || 1;
  const vr = dr / len;
  const vc = dc / len;
  let best = dirs[0];
  let bestDot = -Infinity;
  for (const [r, c] of dirs) {
    const dlen = Math.hypot(r, c);
    const dot = (vr * r + vc * c) / dlen;
    if (dot > bestDot) {
      bestDot = dot;
      best = [r, c];
    }
  }
  const [sr, sc] = best;
  const steps = Math.max(Math.abs(dr), Math.abs(dc));
  const cells = [];
  for (let i = 0; i <= steps; i++) {
    cells.push({ r: start.r + sr * i, c: start.c + sc * i });
  }
  return cells;
}

function wordFromCells(grid, cells) {
  return cells.map((p) => grid[p.r]?.[p.c] || "").join("");
}

export class SearchApp {
  constructor() {
    this.lib = null;
    this.category = "animals";
    this.difficulty = "easy";
    this.isDaily = false;
    this.puzzle = null;
    this.found = new Set();
    this.foundPaths = new Map();
    this.dragging = false;
    this.dragStart = null;
    this.dragCells = [];
    this.showAll = false;
    this.completed = false;
    this.timerEnabled = false;
    this._stopCelebrate = null;
    this.els = {};
    this.timer = new GameTimer((ms) => this._updateTimerDisplay(ms));
  }

  async init() {
    this._cacheEls();
    this.lib = await loadWords();
    this._buildCategories();
    this._bindControls();
    this.timerEnabled = !!this.els.timerToggle?.checked;
    this._syncTimerVisibility();
    const { game, params } = parseGameHash();
    if (game === "search") {
      this.onHashChange(params);
    } else {
      this._newPuzzle({ sync: false });
    }
  }

  _cacheEls() {
    const $ = (id) => document.getElementById(id);
    this.els = {
      stage: $("search-stage"),
      wordList: $("search-word-list"),
      categories: $("search-categories"),
      difficulty: $("search-difficulty"),
      btnNew: $("search-btn-new"),
      btnReset: $("search-btn-reset"),
      btnDaily: $("search-btn-daily"),
      btnShow: $("search-btn-show"),
      btnShare: $("search-btn-share"),
      btnPrint: $("search-btn-print"),
      timerToggle: $("search-timer-toggle"),
      timerDisplay: $("search-timer-display"),
      status: $("search-status"),
      preview: $("search-preview"),
      celebrate: $("search-celebrate"),
      dailyChip: $("search-daily-chip"),
      foundToast: $("search-found-toast"),
      printModal: $("search-print-modal"),
      printClose: $("search-print-modal-close"),
      printGo: $("search-print-go"),
      toast: $("toast"),
    };
  }

  _buildCategories() {
    const host = this.els.categories;
    if (!host || !this.lib) return;
    host.innerHTML = "";
    for (const cat of this.lib.categories) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "category-btn";
      btn.dataset.category = cat.id;
      btn.textContent = `${cat.emoji} ${cat.name}`;
      btn.setAttribute("aria-pressed", cat.id === this.category ? "true" : "false");
      btn.addEventListener("click", () => {
        if (this.category === cat.id) return;
        this.category = cat.id;
        this.isDaily = false;
        this._syncCategories();
        this._newPuzzle();
      });
      host.appendChild(btn);
    }
  }

  _syncCategories() {
    this.els.categories?.querySelectorAll(".category-btn").forEach((btn) => {
      const on = btn.dataset.category === this.category;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  _syncDifficulty() {
    this.els.difficulty?.querySelectorAll(".diff-btn").forEach((btn) => {
      const on = btn.dataset.diff === this.difficulty;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  _bindControls() {
    this.els.difficulty?.querySelectorAll(".diff-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.dataset.diff === this.difficulty) return;
        this.difficulty = btn.dataset.diff;
        this.isDaily = false;
        this._syncDifficulty();
        this._newPuzzle();
      });
    });
    this.els.btnNew?.addEventListener("click", () => {
      this.isDaily = false;
      this._newPuzzle();
    });
    this.els.btnReset?.addEventListener("click", () => this._restart());
    this.els.btnDaily?.addEventListener("click", () => this._loadDaily());
    this.els.btnShow?.addEventListener("click", () => {
      this.showAll = !this.showAll;
      this.els.btnShow?.setAttribute("aria-pressed", this.showAll ? "true" : "false");
      this.els.btnShow.textContent = this.showAll ? "Hide Words" : "Show All";
      this._render();
    });
    this.els.btnShare?.addEventListener("click", () => this._share());
    this.els.btnPrint?.addEventListener("click", () => this._openPrint());
    this.els.printClose?.addEventListener("click", () => this._closePrint());
    this.els.printGo?.addEventListener("click", () => this._doPrint());
    this.els.printModal?.addEventListener("click", (e) => {
      if (e.target === this.els.printModal) this._closePrint();
    });
    this.els.timerToggle?.addEventListener("change", () => {
      this.timerEnabled = this.els.timerToggle.checked;
      this._syncTimerVisibility();
    });
  }

  onHashChange(params) {
    if (!(params instanceof URLSearchParams)) params = new URLSearchParams(params || "");
    if (params.get("daily") === "1") {
      this._loadDaily();
      return;
    }
    const cat = params.get("cat");
    const diff = params.get("diff");
    if (cat && this.lib.categories.some((c) => c.id === cat)) this.category = cat;
    if (diff && SEARCH_DIFFICULTY[diff]) this.difficulty = diff;
    this.isDaily = false;
    this._syncCategories();
    this._syncDifficulty();
    const seedRaw = parseInt(params.get("seed"), 10);
    const seed = Number.isFinite(seedRaw) && seedRaw > 0 ? seedRaw >>> 0 : (Math.random() * 0xffffffff) >>> 0;
    this._setupPuzzle(seed);
  }

  _newPuzzle({ sync = true } = {}) {
    const seed = (Math.random() * 0xffffffff) >>> 0;
    this._setupPuzzle(seed, { sync });
  }

  _restart() {
    if (!this.puzzle) return;
    this._setupPuzzle(this.puzzle.seed);
  }

  _loadDaily() {
    const seed = dailySearchSeed();
    const cats = this.lib.categories;
    this.category = cats[seed % cats.length].id;
    this.difficulty = "medium";
    this.isDaily = true;
    this._syncCategories();
    this._syncDifficulty();
    this._setupPuzzle(seed);
  }

  _setupPuzzle(seed, { sync = true } = {}) {
    this._stopCelebrate?.();
    this._stopCelebrate = null;
    hideCelebrationOverlay(this.els.celebrate);
    this.timer.reset();
    this.found = new Set();
    this.foundPaths = new Map();
    this.dragging = false;
    this.dragStart = null;
    this.dragCells = [];
    this.showAll = false;
    this.completed = false;
    if (this.els.btnShow) {
      this.els.btnShow.textContent = "Show All";
      this.els.btnShow.setAttribute("aria-pressed", "false");
    }
    this.puzzle = buildWordSearch(this.lib, this.category, this.difficulty, seed);
    this._updateDailyChip();
    this._updateStatus();
    this._renderPreview();
    this._render();
    if (sync) this._syncUrl();
  }

  _updateDailyChip() {
    if (!this.els.dailyChip) return;
    this.els.dailyChip.hidden = !this.isDaily;
    if (this.isDaily) {
      this.els.dailyChip.textContent = new Date().toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
    }
    this.els.btnDaily?.classList.toggle("is-active", this.isDaily);
  }

  _updateTimerDisplay(ms) {
    if (this.els.timerDisplay) this.els.timerDisplay.textContent = formatTime(ms);
  }

  _syncTimerVisibility() {
    if (this.els.timerDisplay) this.els.timerDisplay.hidden = !this.timerEnabled;
  }

  _updateStatus() {
    if (!this.els.status || !this.puzzle) return;
    const total = this.puzzle.words.length;
    const found = this.found.size;
    this.els.status.textContent = this.completed
      ? "You found them all!"
      : `Found ${found} of ${total} words`;
  }

  _emojiForWord(word) {
    // Best-effort: map a few common words; otherwise category emoji
    const map = {
      CAT: "🐱",
      DOG: "🐶",
      FISH: "🐟",
      BIRD: "🐦",
      FROG: "🐸",
      BEAR: "🐻",
      DUCK: "🦆",
      LION: "🦁",
      SUN: "☀️",
      MOON: "🌙",
      STAR: "⭐",
      PIE: "🥧",
      CAKE: "🎂",
      RED: "🔴",
      BLUE: "🔵",
      MOM: "👩",
      DAD: "👨",
      ELF: "🧝",
      SNOW: "❄️",
      TREE: "🎄",
    };
    return map[word] || this.puzzle?.category?.emoji || "🔍";
  }

  _renderPreview() {
    const host = this.els.preview;
    if (!host || !this.puzzle) return;
    host.innerHTML = this.puzzle.words
      .map((w) => `<span class="search-preview-item">${this._emojiForWord(w.word)} ${w.word}</span>`)
      .join("");
  }

  _cellAtPoint(clientX, clientY) {
    const el = document.elementFromPoint(clientX, clientY);
    const cell = el?.closest?.(".search-cell");
    if (!cell || !this.els.stage?.contains(cell)) return null;
    return { r: Number(cell.dataset.r), c: Number(cell.dataset.c) };
  }

  _bindGridPointer(gridEl) {
    const onDown = (e) => {
      if (this.completed) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const cell = this._cellAtPoint(e.clientX, e.clientY);
      if (!cell) return;
      e.preventDefault();
      try {
        gridEl.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (!this.timer.running) this.timer.start();
      this.dragging = true;
      this.dragStart = cell;
      this.dragCells = [cell];
      this._paintSelection();
    };
    const onMove = (e) => {
      if (!this.dragging || !this.dragStart) return;
      const cell = this._cellAtPoint(e.clientX, e.clientY);
      if (!cell) return;
      e.preventDefault();
      this.dragCells = lineCells(this.dragStart, cell).filter(
        (p) => p.r >= 0 && p.c >= 0 && p.r < this.puzzle.size && p.c < this.puzzle.size
      );
      this._paintSelection();
    };
    const onUp = (e) => {
      if (!this.dragging) return;
      e.preventDefault();
      this.dragging = false;
      this._commitSelection();
    };
    gridEl.addEventListener("pointerdown", onDown);
    gridEl.addEventListener("pointermove", onMove);
    gridEl.addEventListener("pointerup", onUp);
    gridEl.addEventListener("pointercancel", onUp);
  }

  _paintSelection() {
    this.els.stage?.querySelectorAll(".search-cell").forEach((el) => {
      el.classList.remove("is-selecting");
    });
    for (const p of this.dragCells) {
      this.els.stage
        ?.querySelector(`.search-cell[data-r="${p.r}"][data-c="${p.c}"]`)
        ?.classList.add("is-selecting");
    }
  }

  _commitSelection() {
    const cells = this.dragCells;
    this.dragCells = [];
    this.dragStart = null;
    this._paintSelection();
    if (cells.length < 2 || !this.puzzle) {
      playBonk();
      return;
    }
    const forward = wordFromCells(this.puzzle.grid, cells);
    const backward = [...forward].reverse().join("");
    const match = this.puzzle.words.find(
      (w) => !this.found.has(w.word) && (w.word === forward || w.word === backward)
    );
    if (!match) {
      playBonk();
      return;
    }
    this.found.add(match.word);
    this.foundPaths.set(match.word, cells);
    playPop();
    this._showFoundToast(match.word);
    this._updateStatus();
    this._render();
    if (this.found.size >= this.puzzle.words.length) this._onComplete();
  }

  _showFoundToast(word) {
    const el = this.els.foundToast;
    if (!el) return;
    el.textContent = `${this._emojiForWord(word)} ${word} ✓`;
    el.hidden = false;
    el.classList.remove("show");
    void el.offsetWidth;
    el.classList.add("show");
    setTimeout(() => {
      el.classList.remove("show");
      el.hidden = true;
    }, 1200);
  }

  _hintWord(word) {
    const entry = this.puzzle?.words.find((w) => w.word === word);
    if (!entry || this.found.has(word)) return;
    const first = entry.cells[0];
    const el = this.els.stage?.querySelector(`.search-cell[data-r="${first.r}"][data-c="${first.c}"]`);
    el?.classList.add("is-hint");
    setTimeout(() => el?.classList.remove("is-hint"), 1600);
  }

  _render() {
    const stage = this.els.stage;
    if (!stage || !this.puzzle) return;
    stage.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "search-layout";

    const grid = document.createElement("div");
    grid.className = "search-grid";
    grid.style.setProperty("--search-size", String(this.puzzle.size));
    grid.setAttribute("role", "grid");
    grid.setAttribute("aria-label", "Word search grid");

    const cellColor = new Map();
    for (const [word, cells] of this.foundPaths.entries()) {
      const entry = this.puzzle.words.find((w) => w.word === word);
      const color = entry?.color || HIGHLIGHT_COLORS[0];
      for (const p of cells) cellColor.set(`${p.r},${p.c}`, color);
    }
    if (this.showAll) {
      for (const w of this.puzzle.words) {
        if (this.found.has(w.word)) continue;
        for (const p of w.cells) {
          if (!cellColor.has(`${p.r},${p.c}`)) cellColor.set(`${p.r},${p.c}`, w.color);
        }
      }
    }

    for (let r = 0; r < this.puzzle.size; r++) {
      for (let c = 0; c < this.puzzle.size; c++) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "search-cell";
        cell.dataset.r = String(r);
        cell.dataset.c = String(c);
        cell.textContent = this.puzzle.grid[r][c];
        cell.setAttribute("aria-label", `Row ${r + 1} column ${c + 1}, ${this.puzzle.grid[r][c]}`);
        const color = cellColor.get(`${r},${c}`);
        if (color) {
          cell.classList.add("is-found");
          cell.style.setProperty("--hl", color);
        }
        grid.appendChild(cell);
      }
    }
    this._bindGridPointer(grid);
    wrap.appendChild(grid);

    const list = document.createElement("div");
    list.className = "search-words";
    list.setAttribute("aria-label", "Words to find");
    for (const w of this.puzzle.words) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = `search-word${this.found.has(w.word) ? " is-found" : ""}`;
      row.style.setProperty("--hl", w.color);
      row.innerHTML = `<span class="search-word-emoji">${this._emojiForWord(w.word)}</span><span class="search-word-text">${w.word}</span>${
        this.found.has(w.word) ? '<span class="search-word-check">✓</span>' : ""
      }`;
      row.addEventListener("click", () => this._hintWord(w.word));
      list.appendChild(row);
    }
    wrap.appendChild(list);

    stage.appendChild(wrap);
    if (this.els.wordList) this.els.wordList.hidden = true;
  }

  async _onComplete() {
    this.completed = true;
    this.timer.stop(true);
    this._updateStatus();
    // Cascade pulse
    const words = this.puzzle.words;
    for (let i = 0; i < words.length; i++) {
      await new Promise((r) => setTimeout(r, 120));
      const cells = this.foundPaths.get(words[i].word) || words[i].cells;
      for (const p of cells) {
        this.els.stage
          ?.querySelector(`.search-cell[data-r="${p.r}"][data-c="${p.c}"]`)
          ?.classList.add("is-pulse");
      }
    }
    const ms = this.timer.ms;
    const detail = [
      `${this.found.size} words`,
      ms > 0 ? `Time: ${formatTime(ms)}` : null,
      this.difficulty,
    ]
      .filter(Boolean)
      .join(" · ");
    this._stopCelebrate = celebrate(document.body, 3200);
    showCelebrationOverlay(this.els.celebrate, {
      emoji: "🔍",
      message: "You found them all!",
      detail,
      againLabel: "Play Again",
      newLabel: "New Puzzle",
      onAgain: () => this._restart(),
      onNew: () => {
        this.isDaily = false;
        this._newPuzzle();
      },
    });
  }

  getShareParams() {
    if (!this.puzzle) return {};
    return {
      cat: this.category !== "animals" ? this.category : undefined,
      diff: this.difficulty !== "easy" ? this.difficulty : undefined,
      seed: String(this.puzzle.seed),
      daily: this.isDaily ? "1" : undefined,
    };
  }

  _syncUrl() {
    const params = this.getShareParams();
    const { game } = parseGameHash();
    if (game === "search") setGameHash("search", params);
    return params;
  }

  async _share() {
    const url = buildGameUrl("search", this.getShareParams());
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Word Search", text: "Find the hidden words!", url });
        return;
      } catch (err) {
        if (err?.name === "AbortError") return;
      }
    }
    try {
      await copyToClipboard(url);
      this._toast("Link copied!");
    } catch {
      this._toast("Could not copy link");
    }
  }

  _toast(msg) {
    const t = this.els.toast;
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    t.classList.add("show");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      t.classList.remove("show");
      t.hidden = true;
    }, 2000);
  }

  _openPrint() {
    if (this.els.printModal) {
      this.els.printModal.hidden = false;
      this.els.printModal.setAttribute("aria-hidden", "false");
    }
  }

  _closePrint() {
    if (this.els.printModal) {
      this.els.printModal.hidden = true;
      this.els.printModal.setAttribute("aria-hidden", "true");
    }
  }

  _buildPrintGrid({ withAnswers = false } = {}) {
    const wrap = document.createElement("div");
    wrap.className = "search-print-grid";
    wrap.style.setProperty("--search-size", String(this.puzzle.size));
    const marked = new Set();
    if (withAnswers) {
      for (const w of this.puzzle.words) {
        for (const p of w.cells) marked.add(`${p.r},${p.c}`);
      }
    }
    for (let r = 0; r < this.puzzle.size; r++) {
      for (let c = 0; c < this.puzzle.size; c++) {
        const cell = document.createElement("span");
        cell.className = `search-print-cell${marked.has(`${r},${c}`) ? " is-answer" : ""}`;
        cell.textContent = this.puzzle.grid[r][c];
        wrap.appendChild(cell);
      }
    }
    return wrap;
  }

  _doPrint() {
    if (!this.puzzle) return;
    const layout =
      document.querySelector('input[name="search-print-layout"]:checked')?.value || "single";
    const withAnswers =
      document.querySelector('input[name="search-print-solution"]:checked')?.value === "yes";
    const sheet = document.getElementById("print-sheet");
    if (!sheet) return;
    sheet.innerHTML = "";
    sheet.hidden = false;
    document.body.classList.add("printing");

    const makePage = (puzzle, answers) => {
      const page = document.createElement("section");
      page.className = "print-page";
      const title = document.createElement("h1");
      title.className = "print-title";
      title.textContent = `Word Search: ${puzzle.category.emoji} ${puzzle.category.name} · ${puzzle.difficulty} (${puzzle.words.length} words)${
        answers ? ": Answer key" : ""
      }`;
      page.appendChild(title);
      page.appendChild(this._buildPrintGrid({ withAnswers: answers }));
      const list = document.createElement("p");
      list.className = "search-print-words";
      list.textContent = `Words: ${puzzle.words.map((w) => w.word).join(" · ")}`;
      page.appendChild(list);
      const credit = document.createElement("p");
      credit.className = "print-credit";
      credit.textContent = PRINT_CREDIT;
      page.appendChild(credit);
      return page;
    };

    if (layout === "batch2") {
      const page = document.createElement("section");
      page.className = "print-page print-page-worksheet";
      const title = document.createElement("h1");
      title.className = "print-title";
      title.textContent = `Word Search: 2 puzzles · ${this.difficulty}`;
      page.appendChild(title);
      const grid = document.createElement("div");
      grid.className = "search-print-batch";
      const seeds = [this.puzzle.seed, hashString(`${this.puzzle.seed}:b`)];
      for (const seed of seeds) {
        const puz = buildWordSearch(this.lib, this.category, this.difficulty, seed);
        const card = document.createElement("figure");
        card.className = "print-card";
        const prev = this.puzzle;
        this.puzzle = puz;
        card.appendChild(this._buildPrintGrid({ withAnswers: false }));
        this.puzzle = prev;
        const cap = document.createElement("figcaption");
        cap.textContent = puz.words.map((w) => w.word).join(" · ");
        card.appendChild(cap);
        grid.appendChild(card);
      }
      page.appendChild(grid);
      const credit = document.createElement("p");
      credit.className = "print-credit";
      credit.textContent = PRINT_CREDIT;
      page.appendChild(credit);
      sheet.appendChild(page);
    } else {
      sheet.appendChild(makePage(this.puzzle, false));
      if (withAnswers) sheet.appendChild(makePage(this.puzzle, true));
    }

    this._closePrint();
    requestAnimationFrame(() => window.print());
  }
}
