/**
 * Connect the Dots game logic and UI.
 */

import { celebrate } from "./confetti.js";
import {
  GameTimer,
  dailyDotsSeed,
  formatTime,
  copyToClipboard,
  buildGameUrl,
  setGameHash,
  getStoredBest,
  saveStoredBest,
  mulberry32,
  deriveSeed,
} from "./common.js";
import { listGeneratedPictures, resolveGeneratedPicture } from "./dots-shapes.js";

const DOTS_PB_KEY = "dots-personal-bests";
const DIFFICULTY_COUNTS = { easy: 12, medium: 25, hard: 50 };
const INACTIVITY_HINT_MS = 5000;
const PRINT_CREDIT = "generated via bit.ly/mazeit";

function dist(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.hypot(dx, dy);
}

/** Evenly sample `count` points along polyline paths. */
export function samplePaths(paths, count) {
  const norm = paths.map((path) =>
    path.map((pt) => (Array.isArray(pt) ? { x: pt[0], y: pt[1] } : pt))
  );
  const segments = [];
  let total = 0;
  for (const path of norm) {
    for (let i = 1; i < path.length; i++) {
      const len = dist(path[i - 1], path[i]);
      segments.push({ a: path[i - 1], b: path[i], len });
      total += len;
    }
  }
  if (!segments.length || total === 0) return norm[0]?.slice(0, count) || [];

  const step = total / Math.max(1, count - 1);
  const result = [];
  let segIdx = 0;
  let along = 0;

  for (let i = 0; i < count; i++) {
    const target = i === count - 1 ? total - 1e-6 : i * step;
    while (segIdx < segments.length - 1 && along + segments[segIdx].len < target) {
      along += segments[segIdx].len;
      segIdx++;
    }
    const seg = segments[segIdx];
    const t = seg.len > 0 ? (target - along) / seg.len : 0;
    result.push({
      x: seg.a.x + (seg.b.x - seg.a.x) * t,
      y: seg.a.y + (seg.b.y - seg.a.y) * t,
    });
  }
  return result;
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
  return rawPaths.map((path) =>
    path.map((pt) => (Array.isArray(pt) ? { x: pt[0], y: pt[1] } : pt))
  );
}

export function buildPuzzleFromPaths(paths, difficulty, labelType = "numbers") {
  const count = DIFFICULTY_COUNTS[difficulty] || DIFFICULTY_COUNTS.medium;
  const norm = normalizePaths(paths);
  const points = samplePaths(norm, count);
  return {
    points,
    labels: buildLabels(points.length, labelType),
    paths: norm,
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
    this._loadFromHash();
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

    els.stage?.addEventListener("click", (e) => this._onStageClick(e));
    els.stage?.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches.length !== 1) return;
        const t = e.touches[0];
        const el = document.elementFromPoint(t.clientX, t.clientY);
        if (el?.classList?.contains("dot-hit")) {
          e.preventDefault();
          this._tapDot(Number(el.dataset.index));
        }
      },
      { passive: false }
    );
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

  _setupPuzzle() {
    this._stopCelebrate?.();
    this._stopCelebrate = null;
    this.timer.reset();
    this.connected = 0;
    this.completed = false;
    this.hintPulse = false;
    clearTimeout(this._inactivityTimer);
    this.els.completeBanner.hidden = true;

    const paths = resolvePicturePaths(this.picture);
    this.puzzle = buildPuzzleFromPaths(paths, this.difficulty, this.labelType);
    this.puzzle.color = resolvePictureColor(this.picture);

    this._updateBestDisplay();
    this._updateDailyChip();
    this._render();
    this._syncUrl();
    this._armInactivityHint();
  }

  _resetProgress() {
    this._stopCelebrate?.();
    this._stopCelebrate = null;
    this.timer.reset();
    this.connected = 0;
    this.completed = false;
    this.hintPulse = false;
    this.els.completeBanner.hidden = true;
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
    const hit = e.target.closest?.(".dot-hit");
    if (!hit) return;
    this._tapDot(Number(hit.dataset.index));
  }

  _tapDot(index) {
    if (this.completed || !this.puzzle) return;
    clearTimeout(this._inactivityTimer);

    if (index === this.connected) {
      if (this.connected === 0 && this.timerEnabled) this.timer.start();
      this.connected++;
      this.hintPulse = false;
      if (this.connected >= this.puzzle.points.length) this._onComplete();
      else this._armInactivityHint();
    } else {
      this._shakeDot(index);
      this._armInactivityHint();
      return;
    }
    this._render();
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

    this.els.completeBanner.hidden = false;
    this.els.completeTime.textContent = this.timerEnabled
      ? `Time: ${formatTime(ms)}${isNew ? " — New record!" : ""}`
      : "Picture complete!";
    const best = getStoredBest(DOTS_PB_KEY, `${this.difficulty}:${this.labelType}`);
    this.els.completeBest.textContent = best ? `Your best (${this.difficulty}): ${formatTime(best)}` : "";

    this._stopCelebrate = celebrate(document.body, 3200);
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

  _render() {
    const { stage } = this.els;
    if (!stage || !this.puzzle) return;

    const vb = 100;
    const pad = 8;
    const scale = (vb - pad * 2);
    const tx = (x) => pad + x * scale;
    const ty = (y) => pad + y * scale;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${vb} ${vb}`);
    svg.setAttribute("class", "dots-svg");
    svg.setAttribute("aria-label", this.picture?.name || "Connect the dots");

    if (this.completed) {
      const fill = document.createElementNS("http://www.w3.org/2000/svg", "path");
      const d = this.puzzle.paths
        .map((path) => {
          if (!path.length) return "";
          let s = `M ${tx(path[0].x)} ${ty(path[0].y)}`;
          for (let i = 1; i < path.length; i++) s += ` L ${tx(path[i].x)} ${ty(path[i].y)}`;
          return s + " Z";
        })
        .join(" ");
      fill.setAttribute("d", d);
      fill.setAttribute("class", "dots-fill");
      fill.setAttribute("fill", this.puzzle.color);
      svg.appendChild(fill);
    }

    const lines = document.createElementNS("http://www.w3.org/2000/svg", "g");
    lines.setAttribute("class", "dots-lines");
    for (let i = 1; i < this.connected; i++) {
      const a = this.puzzle.points[i - 1];
      const b = this.puzzle.points[i];
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", tx(a.x));
      line.setAttribute("y1", ty(a.y));
      line.setAttribute("x2", tx(b.x));
      line.setAttribute("y2", ty(b.y));
      line.setAttribute("class", "dots-line");
      lines.appendChild(line);
    }
    svg.appendChild(lines);

    const dotsG = document.createElementNS("http://www.w3.org/2000/svg", "g");
    dotsG.setAttribute("class", "dots-points");
    this.puzzle.points.forEach((pt, i) => {
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class", "dot-group");
      g.dataset.index = String(i);

      const done = i < this.connected;
      const next = i === this.connected && !this.completed;
      const pulse = next && this.hintPulse;

      const hit = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      hit.setAttribute("cx", tx(pt.x));
      hit.setAttribute("cy", ty(pt.y));
      hit.setAttribute("r", 5.5);
      hit.setAttribute("class", `dot-hit${done ? " done" : ""}${next ? " next" : ""}${pulse ? " pulse" : ""}`);
      hit.dataset.index = String(i);

      const visible = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      visible.setAttribute("cx", tx(pt.x));
      visible.setAttribute("cy", ty(pt.y));
      visible.setAttribute("r", done ? 2.2 : 3.2);
      visible.setAttribute("class", `dot${done ? " done" : ""}${next ? " next" : ""}${pulse ? " pulse" : ""}`);
      visible.setAttribute("pointer-events", "none");

      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", tx(pt.x));
      label.setAttribute("y", ty(pt.y) - 5.5);
      label.setAttribute("class", `dot-label${done ? " done" : ""}`);
      label.setAttribute("text-anchor", "middle");
      label.textContent = this.completed ? "" : this.puzzle.labels[i];

      g.appendChild(hit);
      g.appendChild(visible);
      if (!this.completed) g.appendChild(label);
      dotsG.appendChild(g);
    });
    svg.appendChild(dotsG);

    stage.innerHTML = "";
    stage.appendChild(svg);
  }

  _syncUrl() {
    if (!this.picture) return {};
    const params = {
      pic: this.picture.id,
      diff: this.difficulty,
      labels: this.labelType !== "numbers" ? this.labelType : undefined,
      daily: this.isDaily ? "1" : undefined,
    };
    setGameHash("dots", params);
    return params;
  }

  getShareUrl() {
    const p = this._syncUrl();
    return buildGameUrl("dots", p);
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
      title.textContent = `Connect the Dots — ${count} puzzles (${this.difficulty})`;
      page.appendChild(title);
      const grid = document.createElement("div");
      grid.className = "print-dots-grid";
      page.appendChild(grid);

      const pool = getPicturesByCategory(this.lib, this.category);
      for (let i = 0; i < count; i++) {
        const pic = pool[i % pool.length];
        const paths = resolvePicturePaths(pic);
        const puzzle = buildPuzzleFromPaths(paths, this.difficulty, this.labelType);
        const card = document.createElement("figure");
        card.className = "print-card";
        const cap = document.createElement("figcaption");
        cap.textContent = `#${i + 1} ${pic.name}`;
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
      title.textContent = `Connect the Dots — ${this.picture.name} (${this.difficulty})`;
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
