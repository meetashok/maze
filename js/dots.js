/**
 * Connect the Dots game logic and UI.
 */

import { celebrate, showCelebrationOverlay, hideCelebrationOverlay } from "./confetti.js";
import { playPop, playBonk } from "./sound.js";
import {
  GameTimer,
  dailyDotsSeed,
  formatTime,
  copyToClipboard,
  buildGameUrl,
  setGameHash,
  parseGameHash,
  getStoredBest,
  saveStoredBest,
  mulberry32,
  deriveSeed,
} from "./common.js";
import { listGeneratedPictures, resolveGeneratedPicture } from "./dots-shapes.js";

const DOTS_PB_KEY = "dots-personal-bests";
const DIFFICULTY_COUNTS = { easy: 12, medium: 25, hard: 50 };
const RAINBOW = ["#ff6b4a", "#ffc857", "#6bcb77", "#4ecdc4", "#5c7cfa", "#c77dff"];
const INACTIVITY_HINT_MS = 5000;
const PRINT_CREDIT = "meetashok.github.io/maze · bit.ly/mazeit";
const MIN_VERTEX_DIST = 0.005;
const MIN_DOT_SPACING = 0.09;
const FIT_MIN = 0.1;
const FIT_MAX = 0.9;

function dist(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.hypot(dx, dy);
}

function toPoint(pt) {
  return Array.isArray(pt) ? { x: pt[0], y: pt[1] } : { x: pt.x, y: pt.y };
}

function cleanSubpath(path) {
  const pts = [];
  for (const p of path) {
    const pt = toPoint(p);
    if (!pts.length || dist(pts[pts.length - 1], pt) >= MIN_VERTEX_DIST) {
      pts.push(pt);
    }
  }
  return pts;
}

function prepareSubpath(path) {
  let pts = cleanSubpath(path);
  if (pts.length > 2 && dist(pts[0], pts[pts.length - 1]) < MIN_VERTEX_DIST) {
    pts = pts.slice(0, -1);
  }
  return pts;
}

function dedupePoints(points) {
  if (!points.length) return [];
  const result = [points[0]];
  for (let i = 1; i < points.length; i++) {
    if (dist(result[result.length - 1], points[i]) >= MIN_VERTEX_DIST) {
      result.push(points[i]);
    }
  }
  if (result.length > 1 && dist(result[0], result[result.length - 1]) < MIN_VERTEX_DIST) {
    result.pop();
  }
  return result;
}

function subpathLength(path) {
  let len = 0;
  for (let i = 1; i < path.length; i++) len += dist(path[i - 1], path[i]);
  return len;
}

function sampleSubpath(path, count) {
  if (!path.length) return [];
  if (count <= 1) return [path[0]];
  const total = subpathLength(path);
  if (total === 0) return [path[0]];

  const result = [path[0]];
  const step = total / (count - 1);
  let segIdx = 0;
  let along = 0;

  for (let i = 1; i < count; i++) {
    const target = i === count - 1 ? total - 1e-6 : i * step;
    while (segIdx < path.length - 2 && along + dist(path[segIdx], path[segIdx + 1]) < target) {
      along += dist(path[segIdx], path[segIdx + 1]);
      segIdx++;
    }
    const a = path[segIdx];
    const b = path[segIdx + 1];
    const segLen = dist(a, b);
    const t = segLen > 0 ? (target - along) / segLen : 0;
    result.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return result;
}

function allocateCounts(lengths, total) {
  const n = lengths.length;
  if (!n) return [];
  if (total <= n) {
    const order = lengths.map((len, i) => ({ len, i })).sort((a, b) => b.len - a.len);
    const counts = Array(n).fill(0);
    for (let i = 0; i < total; i++) counts[order[i].i] = 1;
    return counts;
  }

  const minEach = Math.min(2, Math.floor(total / n));
  const counts = Array(n).fill(minEach);
  let remaining = total - minEach * n;
  const totalLen = lengths.reduce((s, l) => s + l, 0) || 1;

  const extras = lengths.map((len, i) => ({
    i,
    extra: (len / totalLen) * remaining,
  }));
  extras.forEach(({ i, extra }) => {
    const add = Math.floor(extra);
    counts[i] += add;
    remaining -= add;
  });
  extras
    .sort((a, b) => b.extra - Math.floor(b.extra) - (a.extra - Math.floor(a.extra)))
    .forEach(({ i }) => {
      if (remaining <= 0) return;
      counts[i]++;
      remaining--;
    });

  return counts.map((c, i) =>
    Math.min(c, Math.max(1, Math.floor(lengths[i] / MIN_DOT_SPACING)))
  );
}

function enforceMinSpacing(points, minDist = MIN_DOT_SPACING) {
  if (!points.length) return [];
  const result = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const pt = points[i];
    let tooClose = false;
    for (const existing of result) {
      if (dist(existing, pt) < minDist) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) result.push(pt);
  }
  return result;
}

function maxDotsForPaths(paths) {
  const totalLen = paths.reduce((sum, p) => sum + subpathLength(p), 0);
  return Math.max(4, Math.floor(totalLen / MIN_DOT_SPACING));
}

function collectBounds(paths, points) {
  const all = [];
  for (const path of paths) for (const p of path) all.push(p);
  for (const p of points) all.push(p);
  if (!all.length) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  return {
    minX: Math.min(...all.map((p) => p.x)),
    minY: Math.min(...all.map((p) => p.y)),
    maxX: Math.max(...all.map((p) => p.x)),
    maxY: Math.max(...all.map((p) => p.y)),
  };
}

function fitGeometry(paths, points, min = FIT_MIN, max = FIT_MAX, guides = []) {
  const bounds = collectBounds([...paths, ...guides], points);
  const w = bounds.maxX - bounds.minX || 1;
  const h = bounds.maxY - bounds.minY || 1;
  const span = max - min;
  const scale = span / Math.max(w, h);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const mid = (min + max) / 2;
  const map = (p) => ({
    x: mid + (p.x - cx) * scale,
    y: mid + (p.y - cy) * scale,
  });
  return {
    paths: paths.map((path) => path.map(map)),
    guides: guides.map((path) => path.map(map)),
    points: points.map(map),
  };
}

/** Sample dots along separate subpaths, then fit to canvas. */
export function samplePaths(paths, count) {
  const subpaths = paths.map(prepareSubpath).filter((p) => p.length >= 1);
  if (!subpaths.length) return [];

  const lengths = subpaths.map((p) => Math.max(subpathLength(p), 0.001));
  const allocations = allocateCounts(lengths, count);

  const points = [];
  for (let i = 0; i < subpaths.length; i++) {
    for (const pt of sampleSubpath(subpaths[i], allocations[i])) {
      let ok = true;
      for (const existing of points) {
        if (dist(existing, pt) < MIN_DOT_SPACING) {
          ok = false;
          break;
        }
      }
      if (ok) points.push(pt);
    }
  }

  return enforceMinSpacing(dedupePoints(points));
}

export function labelForIndex(index, type) {
  if (type === "letters") return String.fromCharCode(65 + index);
  if (type === "skip") return String((index + 1) * 2);
  return String(index + 1);
}

export function buildLabels(count, type) {
  return Array.from({ length: count }, (_, i) => labelForIndex(i, type));
}

function normalizePaths(rawPaths) {
  return rawPaths.map((path) => prepareSubpath(path));
}

export function buildPuzzleFromPaths(paths, difficulty, labelType = "numbers", options = {}) {
  let count = DIFFICULTY_COUNTS[difficulty] || DIFFICULTY_COUNTS.medium;
  const norm = normalizePaths(paths);
  const guides = normalizePaths(options.guides || []);
  count = Math.min(count, maxDotsForPaths(norm));
  if (options.compact) count = Math.min(count, difficulty === "hard" ? 30 : difficulty === "medium" ? 18 : 10);
  const points = enforceMinSpacing(samplePaths(norm, count));
  const fitted = fitGeometry(norm, points, FIT_MIN, FIT_MAX, guides);
  return {
    points: fitted.points,
    labels: buildLabels(fitted.points.length, labelType),
    paths: fitted.paths,
    guides: fitted.guides,
  };
}

let libraryCache = null;

export async function loadDotsLibrary() {
  if (libraryCache) return libraryCache;
  const res = await fetch(new URL("./dots-library.json", import.meta.url));
  const data = await res.json();
  const generated = listGeneratedPictures();
  libraryCache = {
    categories: data.categories,
    pictures: [...data.pictures, ...generated],
  };
  return libraryCache;
}

export function getPictureById(lib, id) {
  return lib.pictures.find((p) => p.id === id) || null;
}

export function getPicturesByCategory(lib, category) {
  return lib.pictures.filter((p) => p.category === category);
}

export function pickDailyPicture(lib, date = new Date()) {
  const seed = dailyDotsSeed(date);
  const curated = lib.pictures.filter((p) => !p.generated);
  const idx = seed % curated.length;
  return curated[idx];
}

export function pickRandomPicture(lib, category, seed) {
  const pool = getPicturesByCategory(lib, category).filter((p) => !p.dailyOnly);
  if (!pool.length) return null;
  const rand = mulberry32(seed);
  return pool[Math.floor(rand() * pool.length)];
}

export function resolvePicturePaths(picture) {
  if (picture.paths) return normalizePaths(picture.paths);
  const gen = resolveGeneratedPicture(picture);
  return gen?.paths || [];
}

export function resolvePictureGuides(picture) {
  if (picture.guides?.length) return normalizePaths(picture.guides);
  const gen = resolveGeneratedPicture(picture);
  return gen?.guides ? normalizePaths(gen.guides) : [];
}

export function resolvePictureColor(picture) {
  if (picture.color) return picture.color;
  const gen = resolveGeneratedPicture(picture);
  return gen?.color || "#5c7cfa";
}

export class DotsApp {
  constructor() {
    this.lib = null;
    this.category = "animals";
    this.picture = null;
    this.difficulty = "medium";
    this.labelType = "numbers";
    this.isDaily = false;
    this.puzzle = null;
    this.connected = 0;
    this.completed = false;
    this.hintPulse = false;
    this.autoHint = true;
    this.timerEnabled = true;
    this.lineStyle = "straight";
    this.lastDrawnSegment = -1;
    this._stopCelebrate = null;
    this._inactivityTimer = 0;
    this.els = {};
    this.timer = new GameTimer((ms) => this._updateTimerDisplay(ms));
  }

  async init() {
    this._cacheEls();
    this.lib = await loadDotsLibrary();
    this._buildCategoryButtons();
    this._bindControls();
    // Hub owns deep-link routing; prepare a default puzzle without touching the hash.
    if (!this.picture) {
      const seed = (Math.random() * 0xffffffff) >>> 0;
      this.picture = pickRandomPicture(this.lib, this.category, seed);
      this._setupPuzzle({ sync: false });
    }
    window.addEventListener("resize", () => this._render());
  }

  _cacheEls() {
    const $ = (id) => document.getElementById(id);
    this.els = {
      stage: $("dots-stage"),
      categories: $("dots-categories"),
      difficulty: $("dots-difficulty"),
      labelType: $("dots-label-type"),
      autoHint: $("dots-auto-hint"),
      timerToggle: $("dots-timer-toggle"),
      timerDisplay: $("dots-timer-display"),
      bestDisplay: $("dots-best-display"),
      btnNew: $("dots-btn-new"),
      btnDaily: $("dots-btn-daily"),
      btnHint: $("dots-btn-hint"),
      btnShare: $("dots-btn-share"),
      btnPrint: $("dots-btn-print"),
      btnReset: $("dots-btn-reset"),
      completeBanner: $("dots-complete-banner"),
      completeTime: $("dots-complete-time"),
      completeBest: $("dots-complete-best"),
      status: $("dots-status"),
      celebrate: $("dots-celebrate"),
      lineStyle: $("dots-line-style"),
      dailyChip: $("dots-daily-chip"),
      printModal: $("dots-print-modal"),
      printModalClose: $("dots-print-modal-close"),
      printGo: $("dots-print-go"),
      toast: $("toast"),
    };
  }

  _buildCategoryButtons() {
    const host = this.els.categories;
    if (!host) return;
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
        this._syncCategoryButtons();
        this._newPuzzle();
      });
      host.appendChild(btn);
    }
  }

  _syncCategoryButtons() {
    this.els.categories?.querySelectorAll(".category-btn").forEach((btn) => {
      const active = btn.dataset.category === this.category;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  _bindControls() {
    const { els } = this;

    els.difficulty?.querySelectorAll(".diff-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const next = btn.dataset.diff;
        if (next === this.difficulty) return;
        this.difficulty = next;
        this.isDaily = false;
        this._syncDifficultyButtons();
        this._newPuzzle();
      });
    });

    els.labelType?.addEventListener("change", () => {
      this.labelType = els.labelType.value;
      this.isDaily = false;
      this._newPuzzle();
    });

    els.lineStyle?.querySelectorAll("[data-line]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.lineStyle = btn.dataset.line;
        els.lineStyle.querySelectorAll("[data-line]").forEach((b) => {
          const on = b.dataset.line === this.lineStyle;
          b.classList.toggle("is-active", on);
          b.setAttribute("aria-pressed", on ? "true" : "false");
        });
        this._render();
      });
    });

    els.autoHint?.addEventListener("change", () => {
      this.autoHint = els.autoHint.checked;
    });

    els.timerToggle?.addEventListener("change", () => {
      this.timerEnabled = els.timerToggle.checked;
      els.timerDisplay.hidden = !this.timerEnabled;
      els.bestDisplay.hidden = !this.timerEnabled;
      if (!this.timerEnabled) this.timer.stop(true);
    });

    els.btnNew?.addEventListener("click", () => {
      this.isDaily = false;
      this._newPuzzle();
    });

    els.btnDaily?.addEventListener("click", () => {
      this.isDaily = true;
      this._loadDaily();
    });

    els.btnHint?.addEventListener("click", () => this._showHint());

    els.btnReset?.addEventListener("click", () => this._resetProgress());

    els.btnShare?.addEventListener("click", (e) => {
      e.preventDefault();
      void this._share();
    });

    els.btnPrint?.addEventListener("click", () => this._openPrintModal());
    els.printModalClose?.addEventListener("click", () => this._closePrintModal());
    els.printModal?.addEventListener("click", (e) => {
      if (e.target === els.printModal) this._closePrintModal();
    });
    els.printGo?.addEventListener("click", () => this._doPrint());

    els.stage?.addEventListener(
      "pointerdown",
      (e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        const index = this._hitIndexFromPoint(e.clientX, e.clientY);
        if (index == null) return;
        e.preventDefault();
        this._tapDot(index);
      },
      { passive: false }
    );
  }

  _hitIndexFromPoint(clientX, clientY) {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return null;
    const hit = el.closest?.(".dot-hit, .dot-group");
    if (!hit || !this.els.stage?.contains(hit)) return null;
    const index = Number(hit.dataset.index);
    return Number.isFinite(index) ? index : null;
  }

  loadFromHashParams(params) {
    const pic = params.get("pic");
    const diff = params.get("diff");
    const labels = params.get("labels");
    const daily = params.get("daily") === "1";

    if (diff && DIFFICULTY_COUNTS[diff]) this.difficulty = diff;
    if (labels && ["numbers", "letters", "skip"].includes(labels)) this.labelType = labels;
    if (this.els.labelType) this.els.labelType.value = this.labelType;
    this._syncDifficultyButtons();

    if (daily) {
      this.isDaily = true;
      this._loadDaily();
      return;
    }

    this.isDaily = false;
    if (pic) {
      const found = getPictureById(this.lib, pic);
      if (found) {
        this.picture = found;
        this.category = found.category;
        this._syncCategoryButtons();
        this._setupPuzzle();
        return;
      }
    }
    this._newPuzzle();
  }

  _loadFromHash() {
    const hash = window.location.hash.slice(1);
    const q = hash.indexOf("?");
    const params = new URLSearchParams(q === -1 ? "" : hash.slice(q + 1));
    if (this.lib) this.loadFromHashParams(params);
  }

  onHashChange(params) {
    if (!this.lib) return;
    this.loadFromHashParams(params);
  }

  _newPuzzle() {
    const seed = (Math.random() * 0xffffffff) >>> 0;
    const pic = pickRandomPicture(this.lib, this.category, seed);
    this.picture = pic;
    this._setupPuzzle();
  }

  _loadDaily() {
    this.picture = pickDailyPicture(this.lib);
    this.category = this.picture.category;
    this.difficulty = "medium";
    this._syncCategoryButtons();
    this._syncDifficultyButtons();
    this._setupPuzzle();
  }

  _setupPuzzle({ sync = true } = {}) {
    this._stopCelebrate?.();
    this._stopCelebrate = null;
    hideCelebrationOverlay(this.els.celebrate);
    this.timer.reset();
    this.connected = 0;
    this.completed = false;
    this.hintPulse = false;
    this.lastDrawnSegment = -1;
    clearTimeout(this._inactivityTimer);
    if (this.els.completeBanner) this.els.completeBanner.hidden = true;

    const paths = resolvePicturePaths(this.picture);
    const guides = resolvePictureGuides(this.picture);
    const compact = Boolean(this.picture?.generated);
    this.puzzle = buildPuzzleFromPaths(paths, this.difficulty, this.labelType, { compact, guides });
    this.puzzle.color = resolvePictureColor(this.picture);

    this._updateBestDisplay();
    this._updateDailyChip();
    this._updateStatus();
    this._render();
    if (sync) this._syncUrl();
    this._armInactivityHint();
  }

  _resetProgress() {
    this._stopCelebrate?.();
    this._stopCelebrate = null;
    hideCelebrationOverlay(this.els.celebrate);
    this.timer.reset();
    this.connected = 0;
    this.completed = false;
    this.hintPulse = false;
    this.lastDrawnSegment = -1;
    if (this.els.completeBanner) this.els.completeBanner.hidden = true;
    this._updateStatus();
    this._render();
    this._armInactivityHint();
  }

  _syncDifficultyButtons() {
    this.els.difficulty?.querySelectorAll(".diff-btn").forEach((btn) => {
      const active = btn.dataset.diff === this.difficulty;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  _updateDailyChip() {
    if (!this.els.dailyChip) return;
    this.els.dailyChip.hidden = !this.isDaily;
    if (this.isDaily) {
      const d = new Date();
      this.els.dailyChip.textContent = d.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
    }
    this.els.btnDaily?.classList.toggle("is-active", this.isDaily);
  }

  _onStageClick(e) {
    const index = this._hitIndexFromPoint(e.clientX, e.clientY);
    if (index == null) return;
    this._tapDot(index);
  }

  _tapDot(index) {
    if (this.completed || !this.puzzle) return;
    clearTimeout(this._inactivityTimer);

    if (index === this.connected) {
      if (this.connected === 0 && this.timerEnabled) this.timer.start();
      this.connected++;
      this.lastDrawnSegment = this.connected - 1;
      this.hintPulse = false;
      playPop();
      this._updateStatus();
      if (this.connected >= this.puzzle.points.length) this._onComplete();
      else this._armInactivityHint();
    } else {
      playBonk();
      this._shakeDot(index);
      this.hintPulse = true;
      this._armInactivityHint();
      this._render();
      return;
    }
    this._render();
  }

  _updateStatus() {
    if (!this.els.status) return;
    const cat = this.lib?.categories?.find((c) => c.id === this.category);
    const emoji = cat?.emoji || "🔵";
    const name = this.picture?.name || "picture";
    const n = this.puzzle?.points?.length || 0;
    const left = Math.max(0, n - this.connected);

    if (this.completed) {
      this.els.status.textContent = `${emoji} You found the ${name}!`;
      return;
    }
    if (this.connected === 0) {
      this.els.status.textContent = `${emoji} Can you find the ${name}? Tap dot 1 to start!`;
      return;
    }
    if (left <= 3) {
      this.els.status.textContent = `Almost there! Just ${left} more!`;
      return;
    }
    if (this.connected <= 3) {
      this.els.status.textContent = `Great start! ${left} dots to go!`;
      return;
    }
    if (this.connected >= Math.floor(n / 2)) {
      this.els.status.textContent = `You're doing awesome! Keep going! (${left} left)`;
      return;
    }
    this.els.status.textContent = `Keep going! ${left} more dots!`;
  }

  _shakeDot(index) {
    const dot = this.els.stage?.querySelector(`.dot-group[data-index="${index}"]`);
    dot?.classList.add("shake");
    setTimeout(() => dot?.classList.remove("shake"), 400);
    if (navigator.vibrate) navigator.vibrate(20);
  }

  _showHint() {
    if (this.completed) return;
    this.hintPulse = true;
    this._render();
    setTimeout(() => {
      this.hintPulse = false;
      this._render();
    }, 2000);
  }

  _armInactivityHint() {
    clearTimeout(this._inactivityTimer);
    if (!this.autoHint || this.completed) return;
    this._inactivityTimer = setTimeout(() => {
      this.hintPulse = true;
      this._render();
    }, INACTIVITY_HINT_MS);
  }

  _onComplete() {
    this.completed = true;
    this.timer.stop(true);
    const ms = this.timer.ms;
    let isNew = false;
    if (this.timerEnabled && ms > 0) {
      const key = `${this.difficulty}:${this.labelType}`;
      const result = saveStoredBest(DOTS_PB_KEY, key, ms);
      isNew = result.isNew;
      this._updateBestDisplay();
    }

    if (this.els.completeBanner) this.els.completeBanner.hidden = false;
    if (this.els.completeTime) {
      this.els.completeTime.textContent = this.timerEnabled
        ? `Time: ${formatTime(ms)}${isNew ? " — New record!" : ""}`
        : "Picture complete!";
    }
    const best = getStoredBest(DOTS_PB_KEY, `${this.difficulty}:${this.labelType}`);
    if (this.els.completeBest) {
      this.els.completeBest.textContent = best ? `Your best (${this.difficulty}): ${formatTime(best)}` : "";
    }

    this._updateStatus();
    this._stopCelebrate = celebrate(document.body, 3200);
    showCelebrationOverlay(this.els.celebrate, {
      emoji: "🎉",
      detail: this.timerEnabled && ms > 0 ? `Time: ${formatTime(ms)}` : `${this.picture?.name || "Picture"} complete!`,
      againLabel: "Play Again",
      newLabel: "New Picture",
      onAgain: () => this._resetProgress(),
      onNew: () => {
        this.isDaily = false;
        this._newPuzzle();
      },
    });
    this._render();
  }

  _updateTimerDisplay(ms) {
    if (this.els.timerDisplay) this.els.timerDisplay.textContent = formatTime(ms);
  }

  _updateBestDisplay() {
    const best = getStoredBest(DOTS_PB_KEY, `${this.difficulty}:${this.labelType}`);
    if (this.els.bestDisplay) {
      this.els.bestDisplay.textContent = best ? `Best: ${formatTime(best)}` : "Best: —";
    }
  }

  _puzzleCentroid() {
    const pts = this.puzzle?.points || [];
    if (!pts.length) return { x: 0.5, y: 0.5 };
    const sum = pts.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { x: sum.x / pts.length, y: sum.y / pts.length };
  }

  _dotRadii(count) {
    // Easy = big juicy dots; hard = smaller. Hit targets stay large for fingers.
    const byDiff = {
      easy: { visible: 2.4, hit: 6.5 },
      medium: { visible: 1.7, hit: 5.5 },
      hard: { visible: 1.2, hit: 5 },
    };
    const base = byDiff[this.difficulty] || byDiff.medium;
    const visible = Math.max(base.visible * 0.85, Math.min(base.visible, 3.2 - count * 0.03));
    const hit = Math.max(base.hit, visible + 3.2);
    return { visible, hit, done: visible * 0.7 };
  }

  _labelFontSize(count) {
    const byDiff = { easy: 3.8, medium: 3.1, hard: 2.6 };
    const base = byDiff[this.difficulty] || 3.1;
    return Math.max(2.4, Math.min(base, base + 0.4 - count * 0.02));
  }

  _bestLabelOffset(pt, index, points, centroid, tx, ty) {
    const base = Math.max(3.5, 5 - points.length * 0.035);
    const px = tx(pt.x);
    const py = ty(pt.y);
    const cx = tx(centroid.x);
    const cy = ty(centroid.y);
    let best = { x: 0, y: -base };
    let bestScore = -1;

    const odx = px - cx;
    const ody = py - cy;
    const olen = Math.hypot(odx, ody) || 1;
    const outward = { x: odx / olen, y: ody / olen };

    const candidates = [];
    for (let d = 0; d < 8; d++) {
      const angle = (d / 8) * Math.PI * 2;
      candidates.push({ x: Math.cos(angle) * base, y: Math.sin(angle) * base });
    }
    candidates.push(
      { x: outward.x * base, y: outward.y * base },
      { x: -outward.x * base, y: -outward.y * base }
    );

    for (const off of candidates) {
      const lx = px + off.x;
      const ly = py + off.y;
      let minDist = Infinity;
      for (let j = 0; j < points.length; j++) {
        if (j === index) continue;
        const d = Math.hypot(lx - tx(points[j].x), ly - ty(points[j].y));
        if (d < minDist) minDist = d;
      }
      if (minDist > bestScore) {
        bestScore = minDist;
        best = off;
      }
    }
    return best;
  }

  _render() {
    const { stage } = this.els;
    if (!stage || !this.puzzle) return;

    const vb = 100;
    const pad = 8;
    const scale = vb - pad * 2;
    const tx = (x) => pad + x * scale;
    const ty = (y) => pad + y * scale;
    const count = this.puzzle.points.length;
    const radii = this._dotRadii(count);
    const labelSize = this._labelFontSize(count);
    const centroid = this._puzzleCentroid();
    const lineCount = this.completed ? count : this.connected;
    const animateFrom = this.lastDrawnSegment;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${vb} ${vb}`);
    svg.setAttribute("class", "dots-svg");
    svg.setAttribute("aria-label", this.picture?.name || "Connect the dots");

    if (this.completed) {
      for (const path of this.puzzle.paths) {
        if (path.length < 2) continue;
        const fill = document.createElementNS("http://www.w3.org/2000/svg", "path");
        let d = `M ${tx(path[0].x)} ${ty(path[0].y)}`;
        for (let i = 1; i < path.length; i++) d += ` L ${tx(path[i].x)} ${ty(path[i].y)}`;
        if (path.length > 2) d += " Z";
        fill.setAttribute("d", d);
        fill.setAttribute("class", "dots-fill");
        fill.setAttribute("fill", this.puzzle.color);
        svg.appendChild(fill);
      }
    }

    const guidesG = document.createElementNS("http://www.w3.org/2000/svg", "g");
    // Easy: faint ghost outline. Medium/Hard: hide until complete (mystery reveal).
    let guideClass = "dots-guides";
    if (this.completed) guideClass += " complete";
    else if (this.difficulty === "easy") guideClass += " ghost";
    else guideClass += " hidden-play";
    guidesG.setAttribute("class", guideClass);
    for (const path of this.puzzle.guides || []) {
      if (path.length < 2) continue;
      const guide = document.createElementNS("http://www.w3.org/2000/svg", "path");
      let d = `M ${tx(path[0].x)} ${ty(path[0].y)}`;
      for (let i = 1; i < path.length; i++) d += ` L ${tx(path[i].x)} ${ty(path[i].y)}`;
      guide.setAttribute("d", d);
      guide.setAttribute("class", "dots-guide");
      guidesG.appendChild(guide);
    }
    svg.appendChild(guidesG);

    const lines = document.createElementNS("http://www.w3.org/2000/svg", "g");
    lines.setAttribute("class", `dots-lines${this.completed ? " dots-lines-complete" : ""}`);
    for (let i = 1; i < lineCount; i++) {
      const a = this.puzzle.points[i - 1];
      const b = this.puzzle.points[i];
      const x1 = tx(a.x);
      const y1 = ty(a.y);
      const x2 = tx(b.x);
      const y2 = ty(b.y);
      const color =
        this.lineStyle === "rainbow" ? RAINBOW[(i - 1) % RAINBOW.length] : undefined;

      let line;
      if (this.lineStyle === "curved") {
        line = document.createElementNS("http://www.w3.org/2000/svg", "path");
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.hypot(dx, dy) || 1;
        const bulge = Math.min(4, len * 0.18);
        const cx = mx - (dy / len) * bulge;
        const cy = my + (dx / len) * bulge;
        line.setAttribute("d", `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`);
        line.setAttribute("fill", "none");
      } else {
        line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", x1);
        line.setAttribute("y1", y1);
        line.setAttribute("x2", x2);
        line.setAttribute("y2", y2);
      }
      line.setAttribute("class", `dots-line${i === animateFrom ? " draw-in" : ""}`);
      if (color) line.setAttribute("stroke", color);
      lines.appendChild(line);
    }
    svg.appendChild(lines);
    this.lastDrawnSegment = -1;

    const dotsG = document.createElementNS("http://www.w3.org/2000/svg", "g");
    dotsG.setAttribute("class", "dots-points");
    this.puzzle.points.forEach((pt, i) => {
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class", "dot-group");
      g.dataset.index = String(i);

      const done = i < this.connected;
      const next = i === this.connected && !this.completed;
      const pulse = next && this.hintPulse;
      const labelOff = this._bestLabelOffset(pt, i, this.puzzle.points, centroid, tx, ty);
      const labelR = Math.hypot(labelOff.x, labelOff.y) + labelSize * 0.7;
      const hitR = Math.max(radii.hit, labelR + 0.5);

      const hit = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      hit.setAttribute("cx", tx(pt.x));
      hit.setAttribute("cy", ty(pt.y));
      hit.setAttribute("r", hitR);
      hit.setAttribute("class", `dot-hit${done ? " done" : ""}${next ? " next" : ""}${pulse ? " pulse" : ""}`);
      hit.dataset.index = String(i);

      const visible = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      visible.setAttribute("cx", tx(pt.x));
      visible.setAttribute("cy", ty(pt.y));
      visible.setAttribute("r", done ? radii.done : radii.visible);
      visible.setAttribute(
        "class",
        `dot${done ? " done" : ""}${next ? " next" : ""}${pulse ? " pulse" : ""}${
          done && i === this.connected - 1 ? " pop" : ""
        }`
      );
      visible.setAttribute("pointer-events", "none");

      g.appendChild(hit);
      g.appendChild(visible);
      const showLabel = !this.completed && i >= this.connected;
      if (showLabel) {
        const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute("x", tx(pt.x) + labelOff.x);
        label.setAttribute("y", ty(pt.y) + labelOff.y);
        label.setAttribute("font-size", String(labelSize));
        label.setAttribute("class", `dot-label${next ? " next" : ""}`);
        label.setAttribute("text-anchor", "middle");
        label.setAttribute("dominant-baseline", "middle");
        label.setAttribute("pointer-events", "none");
        label.textContent = this.puzzle.labels[i];
        g.appendChild(label);
      }
      dotsG.appendChild(g);
    });
    svg.appendChild(dotsG);

    stage.innerHTML = "";
    stage.appendChild(svg);
  }

  getShareParams() {
    if (!this.picture) return {};
    return {
      pic: this.picture.id,
      diff: this.difficulty,
      labels: this.labelType !== "numbers" ? this.labelType : undefined,
      daily: this.isDaily ? "1" : undefined,
    };
  }

  _syncUrl() {
    const params = this.getShareParams();
    const { game } = parseGameHash();
    // Never clobber another game's deep link during bootstrap or background updates.
    if (game === "dots") setGameHash("dots", params);
    return params;
  }

  getShareUrl() {
    return buildGameUrl("dots", this.getShareParams());
  }

  async _share() {
    const url = this.getShareUrl();
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "Connect the Dots",
          text: `Connect the dots to reveal a ${this.picture?.name || "picture"}!`,
          url,
        });
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

  _openPrintModal() {
    this.els.printModal.hidden = false;
    this.els.printModal.setAttribute("aria-hidden", "false");
  }

  _closePrintModal() {
    this.els.printModal.hidden = true;
    this.els.printModal.setAttribute("aria-hidden", "true");
  }

  createPrintSvg({ puzzle, picture, showSolution, showLabels = true, compact = false }) {
    const vb = 100;
    const pad = compact ? 6 : 8;
    const scale = vb - pad * 2;
    const tx = (x) => pad + x * scale;
    const ty = (y) => pad + y * scale;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${vb} ${vb}`);
    svg.setAttribute("class", "dots-print-svg");

    for (const path of puzzle.guides || []) {
      // Worksheets: dots + numbers only — no picture spoilers unless solution/coloring.
      if (!showSolution) continue;
      if (path.length < 2) continue;
      const guide = document.createElementNS("http://www.w3.org/2000/svg", "path");
      let d = `M ${tx(path[0].x)} ${ty(path[0].y)}`;
      for (let i = 1; i < path.length; i++) d += ` L ${tx(path[i].x)} ${ty(path[i].y)}`;
      guide.setAttribute("d", d);
      guide.setAttribute("fill", "none");
      guide.setAttribute("stroke", "#444");
      guide.setAttribute("stroke-width", "0.7");
      guide.setAttribute("stroke-linecap", "round");
      guide.setAttribute("stroke-linejoin", "round");
      svg.appendChild(guide);
    }

    if (showSolution) {
      const fill = document.createElementNS("http://www.w3.org/2000/svg", "path");
      const d = puzzle.paths
        .map((path) => {
          if (!path.length) return "";
          let s = `M ${tx(path[0].x)} ${ty(path[0].y)}`;
          for (let i = 1; i < path.length; i++) s += ` L ${tx(path[i].x)} ${ty(path[i].y)}`;
          return s + " Z";
        })
        .join(" ");
      fill.setAttribute("d", d);
      fill.setAttribute("fill", "#ddd");
      fill.setAttribute("stroke", "#000");
      fill.setAttribute("stroke-width", "0.6");
      svg.appendChild(fill);

      for (let i = 1; i < puzzle.points.length; i++) {
        const a = puzzle.points[i - 1];
        const b = puzzle.points[i];
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", tx(a.x));
        line.setAttribute("y1", ty(a.y));
        line.setAttribute("x2", tx(b.x));
        line.setAttribute("y2", ty(b.y));
        line.setAttribute("stroke", "#000");
        line.setAttribute("stroke-width", "0.5");
        svg.appendChild(line);
      }
    }

    puzzle.points.forEach((pt, i) => {
      if (!showLabels) return;
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("cx", tx(pt.x));
      c.setAttribute("cy", ty(pt.y));
      c.setAttribute("r", compact ? 1.2 : 1.6);
      c.setAttribute("fill", "#000");
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", tx(pt.x));
      label.setAttribute("y", ty(pt.y) - (compact ? 2.5 : 3.5));
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("font-size", compact ? "3.5" : "4.5");
      label.setAttribute("font-family", "Nunito, sans-serif");
      label.setAttribute("font-weight", "800");
      label.textContent = puzzle.labels[i];
      svg.appendChild(c);
      svg.appendChild(label);
    });

    return svg;
  }

  _doPrint() {
    const withSolution =
      document.querySelector('input[name="dots-print-solution"]:checked')?.value === "yes";
    const layout =
      document.querySelector('input[name="dots-print-layout"]:checked')?.value || "single";
    const coloring = document.getElementById("dots-print-coloring")?.checked;

    const sheet = document.getElementById("print-sheet");
    sheet.innerHTML = "";
    sheet.hidden = false;
    document.body.classList.add("printing");

    if (coloring && this.completed && this.puzzle) {
      const page = document.createElement("section");
      page.className = "print-page";
      const title = document.createElement("h1");
      title.className = "print-title";
      title.textContent = `${this.picture.name} — Coloring Page`;
      page.appendChild(title);
      const svg = this.createPrintSvg({
        puzzle: this.puzzle,
        picture: this.picture,
        showSolution: true,
        showLabels: false,
      });
      page.appendChild(svg);
      const credit = document.createElement("p");
      credit.className = "print-credit";
      credit.textContent = PRINT_CREDIT;
      page.appendChild(credit);
      sheet.appendChild(page);
    } else if (layout === "worksheet4" || layout === "worksheet6") {
      const count = layout === "worksheet4" ? 4 : 6;
      const page = document.createElement("section");
      page.className = "print-page print-page-worksheet";
      const title = document.createElement("h1");
      title.className = "print-title";
      title.textContent = `Connect the Dots — ${count} puzzles · ${this.difficulty}`;
      page.appendChild(title);
      const grid = document.createElement("div");
      grid.className = "print-dots-grid";
      page.appendChild(grid);

      const pool = getPicturesByCategory(this.lib, this.category);
      const cat = this.lib.categories.find((c) => c.id === this.category);
      for (let i = 0; i < count; i++) {
        const pic = pool[i % pool.length];
        const paths = resolvePicturePaths(pic);
        const guides = resolvePictureGuides(pic);
        const puzzle = buildPuzzleFromPaths(paths, this.difficulty, this.labelType, { guides });
        const card = document.createElement("figure");
        card.className = "print-card";
        const cap = document.createElement("figcaption");
        cap.textContent = `${cat?.emoji || ""} ${pic.name} · ${this.difficulty}`;
        const svg = this.createPrintSvg({
          puzzle,
          picture: pic,
          showSolution: withSolution,
          showLabels: !withSolution,
          compact: true,
        });
        card.appendChild(cap);
        card.appendChild(svg);
        grid.appendChild(card);
      }
      const credit = document.createElement("p");
      credit.className = "print-credit";
      credit.textContent = PRINT_CREDIT;
      page.appendChild(credit);
      sheet.appendChild(page);
    } else {
      const page = document.createElement("section");
      page.className = "print-page";
      const title = document.createElement("h1");
      title.className = "print-title";
      const cat = this.lib?.categories?.find((c) => c.id === this.category);
      const catEmoji = cat?.emoji || "🔵";
      title.textContent = `${catEmoji} ${this.picture.name} — ${this.difficulty}`;
      page.appendChild(title);
      const svg = this.createPrintSvg({
        puzzle: this.puzzle,
        picture: this.picture,
        showSolution: withSolution,
        showLabels: !withSolution,
      });
      page.appendChild(svg);
      const credit = document.createElement("p");
      credit.className = "print-credit";
      credit.textContent = PRINT_CREDIT;
      page.appendChild(credit);
      sheet.appendChild(page);
    }

    this._closePrintModal();
    requestAnimationFrame(() => window.print());
  }
}

export { DIFFICULTY_COUNTS };
