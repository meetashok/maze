/**
 * Memory Match — flip cards to find matching pairs.
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
  getStoredBest,
  saveStoredBest,
  mulberry32,
  hashString,
  todayDateString,
} from "./common.js";

const PB_KEY = "memory-personal-bests";
const PRINT_CREDIT = "meetashok.github.io/maze · bit.ly/mazeit";
const MISMATCH_PAUSE_MS = 1000;

export const MEMORY_DIFFICULTY = {
  easy: { rows: 2, cols: 2, pairs: 2 },
  medium: { rows: 3, cols: 4, pairs: 6 },
  hard: { rows: 4, cols: 4, pairs: 8 },
  expert: { rows: 4, cols: 5, pairs: 10 },
};

export function dailyMemorySeed(date = new Date()) {
  return hashString(`daily-memory:${todayDateString(date)}`);
}

async function loadThemes() {
  const res = await fetch(new URL("./memory-themes.json", import.meta.url));
  return res.json();
}

function shuffle(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildMemoryDeck(themes, categoryId, difficulty, seed) {
  const rand = mulberry32(seed >>> 0 || 1);
  const cfg = MEMORY_DIFFICULTY[difficulty] || MEMORY_DIFFICULTY.medium;
  const cat =
    themes.categories.find((c) => c.id === categoryId) || themes.categories[0];
  const pool = shuffle(cat.items, rand);
  const pairs = Math.min(cfg.pairs, pool.length);
  const chosen = pool.slice(0, pairs);
  const cards = [];
  chosen.forEach((item, pairIndex) => {
    cards.push({
      id: `${item.id}-a`,
      pairId: item.id,
      face: item.face,
      label: item.label,
      pairIndex,
    });
    cards.push({
      id: `${item.id}-b`,
      pairId: item.id,
      face: item.face,
      label: item.label,
      pairIndex,
    });
  });
  return {
    category: cat,
    difficulty,
    rows: cfg.rows,
    cols: cfg.cols,
    pairs,
    cards: shuffle(cards, rand),
    seed: seed >>> 0,
  };
}

function starRating(flips, pairs) {
  const perfect = pairs;
  if (flips <= perfect + 2) return 3;
  if (flips <= perfect + 6) return 2;
  return 1;
}

export class MemoryApp {
  constructor() {
    this.themes = null;
    this.category = "animals";
    this.difficulty = "medium";
    this.isDaily = false;
    this.deck = null;
    this.flipped = [];
    this.matched = new Set();
    this.lock = false;
    this.flips = 0;
    this.completed = false;
    this.timerEnabled = true;
    this.focusIndex = 0;
    this._stopCelebrate = null;
    this._mismatchTimer = 0;
    this.els = {};
    this.timer = new GameTimer((ms) => this._updateTimerDisplay(ms));
  }

  async init() {
    this._cacheEls();
    this.themes = await loadThemes();
    this._buildCategories();
    this._bindControls();
    const { game, params } = parseGameHash();
    if (game === "memory") {
      this.onHashChange(params);
    } else {
      this._newGame({ sync: false });
    }
  }

  _cacheEls() {
    const $ = (id) => document.getElementById(id);
    this.els = {
      stage: $("memory-stage"),
      categories: $("memory-categories"),
      difficulty: $("memory-difficulty"),
      btnNew: $("memory-btn-new"),
      btnReset: $("memory-btn-reset"),
      btnDaily: $("memory-btn-daily"),
      btnShare: $("memory-btn-share"),
      btnPrint: $("memory-btn-print"),
      timerToggle: $("memory-timer-toggle"),
      timerDisplay: $("memory-timer-display"),
      flipsDisplay: $("memory-flips"),
      bestDisplay: $("memory-best-display"),
      status: $("memory-status"),
      float: $("memory-float"),
      celebrate: $("memory-celebrate"),
      dailyChip: $("memory-daily-chip"),
      printModal: $("memory-print-modal"),
      printClose: $("memory-print-modal-close"),
      printGo: $("memory-print-go"),
      toast: $("toast"),
      live: $("memory-live"),
    };
  }

  _buildCategories() {
    const host = this.els.categories;
    if (!host || !this.themes) return;
    host.innerHTML = "";
    for (const cat of this.themes.categories) {
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
        this._newGame();
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
        this._newGame();
      });
    });
    this.els.btnNew?.addEventListener("click", () => {
      this.isDaily = false;
      this._newGame();
    });
    this.els.btnReset?.addEventListener("click", () => this._restart());
    this.els.btnDaily?.addEventListener("click", () => this._loadDaily());
    this.els.btnShare?.addEventListener("click", () => this._share());
    this.els.btnPrint?.addEventListener("click", () => this._openPrint());
    this.els.printClose?.addEventListener("click", () => this._closePrint());
    this.els.printGo?.addEventListener("click", () => this._doPrint());
    this.els.printModal?.addEventListener("click", (e) => {
      if (e.target === this.els.printModal) this._closePrint();
    });
    this.els.timerToggle?.addEventListener("change", () => {
      this.timerEnabled = this.els.timerToggle.checked;
      if (!this.timerEnabled) this.timer.reset();
      this._updateTimerDisplay(this.timer.ms);
    });
    this.els.stage?.addEventListener("keydown", (e) => this._onKey(e));
  }

  onHashChange(params) {
    if (!(params instanceof URLSearchParams)) params = new URLSearchParams(params || "");
    if (params.get("daily") === "1") {
      this._loadDaily();
      return;
    }
    const cat = params.get("cat");
    const diff = params.get("diff");
    if (cat && this.themes.categories.some((c) => c.id === cat)) this.category = cat;
    if (diff && MEMORY_DIFFICULTY[diff]) this.difficulty = diff;
    this.isDaily = false;
    this._syncCategories();
    this._syncDifficulty();
    const seedRaw = parseInt(params.get("seed"), 10);
    const seed = Number.isFinite(seedRaw) && seedRaw > 0 ? seedRaw >>> 0 : (Math.random() * 0xffffffff) >>> 0;
    this._setupDeck(seed);
  }

  _newGame({ sync = true } = {}) {
    const seed = (Math.random() * 0xffffffff) >>> 0;
    this._setupDeck(seed, { sync });
  }

  _restart() {
    if (!this.deck) return;
    this._setupDeck(this.deck.seed);
  }

  _loadDaily() {
    const seed = dailyMemorySeed();
    const cats = this.themes.categories;
    this.category = cats[seed % cats.length].id;
    this.difficulty = "medium";
    this.isDaily = true;
    this._syncCategories();
    this._syncDifficulty();
    this._setupDeck(seed);
  }

  _setupDeck(seed, { sync = true } = {}) {
    this._stopCelebrate?.();
    this._stopCelebrate = null;
    hideCelebrationOverlay(this.els.celebrate);
    clearTimeout(this._mismatchTimer);
    this.timer.reset();
    this.flipped = [];
    this.matched = new Set();
    this.lock = false;
    this.flips = 0;
    this.completed = false;
    this.focusIndex = 0;
    this.deck = buildMemoryDeck(this.themes, this.category, this.difficulty, seed);
    this._updateDailyChip();
    this._updateFlips();
    this._updateBest();
    this._updateStatus();
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

  _updateFlips() {
    if (this.els.flipsDisplay) this.els.flipsDisplay.textContent = `Flips: ${this.flips}`;
  }

  _updateTimerDisplay(ms) {
    if (this.els.timerDisplay) this.els.timerDisplay.textContent = formatTime(ms);
  }

  _updateBest() {
    const best = getStoredBest(PB_KEY, this.difficulty);
    if (this.els.bestDisplay) {
      this.els.bestDisplay.textContent = best ? `Best: ${best} flips` : "Best: —";
    }
  }

  _updateStatus() {
    if (!this.els.status || !this.deck) return;
    if (this.completed) {
      this.els.status.textContent = "You found them all!";
      return;
    }
    const found = this.matched.size;
    if (found === 0 && this.flipped.length === 0) {
      this.els.status.textContent = `🐾 Tap a green card to flip it!`;
      return;
    }
    if (this.flipped.length === 1) {
      this.els.status.textContent = "Nice! Tap one more card…";
      return;
    }
    this.els.status.textContent = `${this.deck.category.emoji} ${this.deck.category.name} — ${found} of ${this.deck.pairs} pairs`;
  }

  _announce(msg) {
    if (this.els.live) this.els.live.textContent = msg;
  }

  _render() {
    const stage = this.els.stage;
    if (!stage || !this.deck) return;
    stage.style.setProperty("--memory-cols", String(this.deck.cols));
    stage.style.setProperty("--memory-rows", String(this.deck.rows));
    stage.innerHTML = "";
    stage.setAttribute("role", "grid");
    stage.setAttribute("aria-label", "Memory cards — tap to flip");
    stage.tabIndex = 0;

    this.deck.cards.forEach((card, index) => {
      const faceKind = /[A-Z0-9]/.test(card.face) && card.face.length === 1 ? "glyph" : "emoji";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "memory-card";
      btn.dataset.index = String(index);
      btn.setAttribute("role", "gridcell");
      btn.innerHTML = `
        <span class="memory-card-back" aria-hidden="true">?<span class="memory-card-hint">Tap</span></span>
        <span class="memory-card-front memory-card-front--${faceKind}" aria-hidden="true">${card.face}<span class="memory-check">✓</span></span>
      `;
      // pointerup fires reliably on iPad; ignore non-primary mouse buttons
      btn.addEventListener("pointerup", (e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        e.preventDefault();
        this._flip(index);
      });
      stage.appendChild(btn);
    });
    this._syncCardDom();
  }

  /** Update face-up / matched classes without rebuilding the grid (keeps flips visible). */
  _syncCardDom() {
    const stage = this.els.stage;
    if (!stage || !this.deck) return;
    stage.querySelectorAll(".memory-card").forEach((btn) => {
      const index = Number(btn.dataset.index);
      const card = this.deck.cards[index];
      if (!card) return;
      const isMatched = this.matched.has(card.pairId);
      const isFlipped = isMatched || this.flipped.includes(index);
      btn.classList.toggle("is-flipped", isFlipped);
      btn.classList.toggle("is-matched", isMatched);
      btn.classList.toggle("is-focus", this.focusIndex === index);
      btn.disabled = isMatched || this.completed;
      btn.setAttribute(
        "aria-label",
        isFlipped
          ? `Card ${index + 1} of ${this.deck.cards.length}, ${card.label}`
          : `Card ${index + 1} of ${this.deck.cards.length}, face down — tap to flip`
      );
    });
  }

  _onKey(e) {
    if (!this.deck || this.completed) return;
    const n = this.deck.cards.length;
    const cols = this.deck.cols;
    let next = this.focusIndex;
    if (e.key === "ArrowRight") next = (this.focusIndex + 1) % n;
    else if (e.key === "ArrowLeft") next = (this.focusIndex - 1 + n) % n;
    else if (e.key === "ArrowDown") next = (this.focusIndex + cols) % n;
    else if (e.key === "ArrowUp") next = (this.focusIndex - cols + n) % n;
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      this._flip(this.focusIndex);
      return;
    } else return;
    e.preventDefault();
    this.focusIndex = next;
    this._syncCardDom();
    this.els.stage?.querySelector(`[data-index="${next}"]`)?.focus();
  }

  _flip(index) {
    if (this.lock || this.completed || !this.deck) return;
    if (this.matched.has(this.deck.cards[index].pairId)) return;
    if (this.flipped.includes(index)) return;
    if (this.flipped.length >= 2) return;

    if (this.flipped.length === 0 && this.timerEnabled && !this.timer.running) {
      this.timer.start();
    }

    this.flipped.push(index);
    this.focusIndex = index;
    playPop();
    this._syncCardDom();
    this._updateStatus();

    if (this.flipped.length < 2) return;

    this.flips += 1;
    this._updateFlips();
    this.lock = true;
    const [a, b] = this.flipped;
    const cardA = this.deck.cards[a];
    const cardB = this.deck.cards[b];

    if (cardA.pairId === cardB.pairId) {
      this.matched.add(cardA.pairId);
      this._announce(`Match found! ${cardA.label} and ${cardB.label}`);
      this._showFloat("Nice!");
      playPop();
      this.flipped = [];
      this.lock = false;
      this._updateStatus();
      this._syncCardDom();
      if (this.matched.size >= this.deck.pairs) this._onComplete();
    } else {
      playBonk();
      this._mismatchTimer = setTimeout(() => {
        this.flipped = [];
        this.lock = false;
        this._syncCardDom();
        this._updateStatus();
      }, MISMATCH_PAUSE_MS);
    }
  }

  _showFloat(text) {
    const el = this.els.float;
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
    el.classList.remove("show");
    void el.offsetWidth;
    el.classList.add("show");
    setTimeout(() => {
      el.classList.remove("show");
      el.hidden = true;
    }, 900);
  }

  _onComplete() {
    this.completed = true;
    this.timer.stop(true);
    const ms = this.timer.ms;
    const stars = starRating(this.flips, this.deck.pairs);
    let isNew = false;
    if (this.flips > 0) {
      const result = saveStoredBest(PB_KEY, this.difficulty, this.flips);
      // saveStoredBest treats lower as better for times — for flips lower is also better.
      // Our saveStoredBest only updates when ms < prev, so it works for flip counts too.
      isNew = result.isNew;
      this._updateBest();
    }
    this._updateStatus();
    this._announce("You found them all!");
    const detail = [
      `Flips: ${this.flips}`,
      this.timerEnabled && ms > 0 ? `Time: ${formatTime(ms)}` : null,
      `${"★".repeat(stars)}${"☆".repeat(3 - stars)}`,
      isNew ? "New best!" : null,
    ]
      .filter(Boolean)
      .join(" · ");
    this._stopCelebrate = celebrate(document.body, 3200);
    showCelebrationOverlay(this.els.celebrate, {
      emoji: "🃏",
      message: "You found them all!",
      detail,
      againLabel: "Play Again",
      newLabel: "New Game",
      onAgain: () => this._restart(),
      onNew: () => {
        this.isDaily = false;
        this._newGame();
      },
    });
  }

  getShareParams() {
    if (!this.deck) return {};
    return {
      cat: this.category !== "animals" ? this.category : undefined,
      diff: this.difficulty !== "medium" ? this.difficulty : undefined,
      seed: String(this.deck.seed),
      daily: this.isDaily ? "1" : undefined,
    };
  }

  _syncUrl() {
    const params = this.getShareParams();
    const { game } = parseGameHash();
    if (game === "memory") setGameHash("memory", params);
    return params;
  }

  async _share() {
    const url = buildGameUrl("memory", this.getShareParams());
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Memory Match", text: "Find the matching pairs!", url });
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

  _doPrint() {
    if (!this.deck) return;
    const sheet = document.getElementById("print-sheet");
    if (!sheet) return;
    sheet.innerHTML = "";
    sheet.hidden = false;
    document.body.classList.add("printing");

    const puzzle = document.createElement("section");
    puzzle.className = "print-page";
    const title = document.createElement("h1");
    title.className = "print-title";
    title.textContent = `Memory Match — ${this.deck.category.name} · ${this.difficulty} (${this.deck.pairs} pairs)`;
    puzzle.appendChild(title);
    const help = document.createElement("p");
    help.className = "print-bulk-help";
    help.textContent = "Cut out the cards. Numbers mark pairs — flip them over and play!";
    puzzle.appendChild(help);

    const grid = document.createElement("div");
    grid.className = "memory-print-grid";
    grid.style.setProperty("--memory-cols", String(this.deck.cols));
    this.deck.cards.forEach((card, i) => {
      const cell = document.createElement("div");
      cell.className = "memory-print-card";
      cell.textContent = String(i + 1);
      grid.appendChild(cell);
    });
    puzzle.appendChild(grid);
    const credit = document.createElement("p");
    credit.className = "print-credit";
    credit.textContent = PRINT_CREDIT;
    puzzle.appendChild(credit);
    sheet.appendChild(puzzle);

    const key = document.createElement("section");
    key.className = "print-page";
    const keyTitle = document.createElement("h1");
    keyTitle.className = "print-title";
    keyTitle.textContent = `Answer key — ${this.deck.category.name}`;
    key.appendChild(keyTitle);
    const keyGrid = document.createElement("div");
    keyGrid.className = "memory-print-grid";
    keyGrid.style.setProperty("--memory-cols", String(this.deck.cols));
    this.deck.cards.forEach((card, i) => {
      const cell = document.createElement("div");
      cell.className = "memory-print-card memory-print-card-key";
      cell.innerHTML = `<span class="memory-print-num">${i + 1}</span><span class="memory-print-face">${card.face}</span>`;
      keyGrid.appendChild(cell);
    });
    key.appendChild(keyGrid);
    const credit2 = document.createElement("p");
    credit2.className = "print-credit";
    credit2.textContent = PRINT_CREDIT;
    key.appendChild(credit2);
    sheet.appendChild(key);

    this._closePrint();
    requestAnimationFrame(() => window.print());
  }
}
