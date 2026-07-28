/**
 * App UI: controls, state, print, share, timer, icons.
 */

import { generateMaze, solveBFS, getHintSteps } from "./maze.js";
import { MazeRenderer } from "./renderer.js";
import { PathTracer } from "./interaction.js";
import { celebrate } from "./confetti.js";
import {
  randomSeed,
  dailySeed,
  DAILY_SIZE,
  DEFAULT_START,
  DEFAULT_END,
  difficultyLabel,
  parseUrlParams,
  buildShareUrl,
  copyToClipboard,
  getPersonalBest,
  savePersonalBest,
  formatTime,
  deriveSeed,
} from "./utils.js";

const ICON_OPTIONS = [
  "🐸", "🐛", "🐱", "🐶", "🐰", "🦊", "🐻", "🐼",
  "🦁", "🐷", "🐵", "🦄", "🐝", "🐢", "🐙", "🦋",
  "🐦", "⭐", "🌟", "🌈", "🍎", "🍓", "🥕", "🍦",
  "🍪", "🎈", "🎁", "🚀", "🏡", "⚽", "🌼", "💎",
];

const THEME_KEY = "maze-theme";
const THEME_LIGHT = "light";
const THEME_DARK = "dark";

const HINT_STEPS = 4;

export class MazeApp {
  constructor() {
    this.maze = null;
    this.solution = [];
    this.size = 8;
    this.seed = randomSeed();
    this.startIcon = DEFAULT_START;
    this.endIcon = DEFAULT_END;
    this.isDaily = false;
    this.showSolution = false;
    this.hintCells = [];
    this.timerEnabled = true;
    this.timerMs = 0;
    this.timerRunning = false;
    this._timerStart = 0;
    this._raf = 0;
    this._stopCelebrate = null;

    this.els = {};
    this.renderer = null;
    this.tracer = null;
  }

  init() {
    this._cacheEls();
    this.renderer = new MazeRenderer(this.els.mazeStage);
    this.tracer = new PathTracer({
      renderer: this.renderer,
      getMaze: () => this.maze,
      onPathChange: (path) => this._onPathChange(path),
      onCollision: (cell) => this.renderer.flashCollision(cell),
      onStart: () => this._onTraceStart(),
      onComplete: () => this._onSolved(),
    });
    this.tracer.attach(this.els.mazeStage);

    this._initTheme();
    this._bindControls();
    this._buildIconGrid();
    this._loadFromUrlOrDefault();
    window.addEventListener("resize", () => this._redraw());
  }

  _cacheEls() {
    const $ = (id) => document.getElementById(id);
    this.els = {
      mazeStage: $("maze-stage"),
      sizeRange: $("size-range"),
      sizeValue: $("size-value"),
      difficulty: $("difficulty-label"),
      btnNew: $("btn-new"),
      btnDaily: $("btn-daily"),
      btnClear: $("btn-clear"),
      btnHint: $("btn-hint"),
      btnSolution: $("btn-solution"),
      btnShare: $("btn-share"),
      btnPrint: $("btn-print"),
      btnIcons: $("btn-icons"),
      themeToggle: $("theme-toggle"),
      timerToggle: $("timer-toggle"),
      timerDisplay: $("timer-display"),
      bestDisplay: $("best-display"),
      recordBanner: $("record-banner"),
      toast: $("toast"),
      iconModal: $("icon-modal"),
      iconGrid: $("icon-grid"),
      iconModalClose: $("icon-modal-close"),
      printModal: $("print-modal"),
      printModalClose: $("print-modal-close"),
      printGo: $("print-go"),
      printSheet: $("print-sheet"),
      brandDate: $("brand-date"),
    };
  }

  _initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const theme = saved === THEME_DARK ? THEME_DARK : THEME_LIGHT;
    this._applyTheme(theme);
    if (this.els.themeToggle) {
      this.els.themeToggle.checked = theme === THEME_LIGHT;
      this.els.themeToggle.addEventListener("change", () => {
        const next = this.els.themeToggle.checked ? THEME_LIGHT : THEME_DARK;
        this._applyTheme(next);
        localStorage.setItem(THEME_KEY, next);
      });
    }
  }

  _applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === THEME_DARK ? "#0f1c24" : "#2a9d8f";
  }

  _bindControls() {
    const { els } = this;

    els.sizeRange.addEventListener("input", () => {
      this.size = Number(els.sizeRange.value);
      this._updateSizeLabel();
    });
    els.sizeRange.addEventListener("change", () => {
      this.size = Number(els.sizeRange.value);
      this.isDaily = false;
      this.seed = randomSeed();
      this._loadMaze(true);
    });

    els.btnNew.addEventListener("click", () => {
      this.isDaily = false;
      this.seed = randomSeed();
      this.size = Number(els.sizeRange.value);
      this._loadMaze(true);
    });

    els.btnDaily.addEventListener("click", () => {
      this.isDaily = true;
      this.size = DAILY_SIZE;
      this.seed = dailySeed();
      els.sizeRange.value = String(DAILY_SIZE);
      this._updateSizeLabel();
      this._loadMaze(true);
    });

    els.btnClear.addEventListener("click", () => this._clearPath());

    els.btnHint.addEventListener("click", () => this._showHint());

    els.btnSolution.addEventListener("click", () => {
      this.showSolution = !this.showSolution;
      this.hintCells = [];
      this._syncSolutionButton();
      this._paintOverlays();
    });

    els.btnShare.addEventListener("click", () => this._share());

    els.btnIcons.addEventListener("click", () => this._openModal(els.iconModal));
    els.iconModalClose.addEventListener("click", () => this._closeModal(els.iconModal));
    els.iconModal.addEventListener("click", (e) => {
      if (e.target === els.iconModal) this._closeModal(els.iconModal);
    });

    els.btnPrint.addEventListener("click", () => this._openModal(els.printModal));
    els.printModalClose.addEventListener("click", () => this._closeModal(els.printModal));
    els.printModal.addEventListener("click", (e) => {
      if (e.target === els.printModal) this._closeModal(els.printModal);
    });
    els.printGo.addEventListener("click", () => this._doPrint());

    els.timerToggle.addEventListener("change", () => {
      this.timerEnabled = els.timerToggle.checked;
      els.timerDisplay.hidden = !this.timerEnabled;
      els.bestDisplay.hidden = !this.timerEnabled;
      if (!this.timerEnabled) this._stopTimer(false);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this._closeModal(els.iconModal);
        this._closeModal(els.printModal);
      }
    });

    window.addEventListener("beforeprint", () => {
      /* print sheet already prepared */
    });
    window.addEventListener("afterprint", () => {
      els.printSheet.innerHTML = "";
      els.printSheet.hidden = true;
      document.body.classList.remove("printing");
    });
  }

  _loadFromUrlOrDefault() {
    const p = parseUrlParams();
    if (p.daily) {
      this.isDaily = true;
      this.size = DAILY_SIZE;
      this.seed = dailySeed();
    } else {
      this.size = p.size ?? 8;
      this.seed = p.seed ?? randomSeed();
      this.isDaily = false;
    }
    this.startIcon = p.start || DEFAULT_START;
    this.endIcon = p.end || DEFAULT_END;
    this.els.sizeRange.value = String(this.size);
    this._updateSizeLabel();
    this._loadMaze(true);
  }

  _loadMaze(updateUrl) {
    this._stopCelebrate?.();
    this._stopCelebrate = null;
    this._stopTimer(false);
    this.timerMs = 0;
    this._updateTimerDisplay();
    this.showSolution = false;
    this.hintCells = [];
    this._syncSolutionButton();
    this.els.recordBanner.hidden = true;

    this.maze = generateMaze(this.size, this.seed);
    this.solution = solveBFS(this.maze);
    this.renderer.setIcons(this.startIcon, this.endIcon);
    this.renderer.render(this.maze);
    this.tracer.reset();
    this._updateBestDisplay();
    this._updateDailyBadge();

    if (updateUrl) this._syncUrl();
  }

  _redraw() {
    if (!this.maze) return;
    const path = this.tracer.path.slice();
    this.renderer.setIcons(this.startIcon, this.endIcon);
    this.renderer.render(this.maze);
    this.tracer.setPath(path);
    this._paintOverlays();
  }

  _clearPath() {
    this._stopCelebrate?.();
    this._stopCelebrate = null;
    this._stopTimer(false);
    this.timerMs = 0;
    this._updateTimerDisplay();
    this.hintCells = [];
    this.els.recordBanner.hidden = true;
    this.tracer.reset();
    this._paintOverlays();
  }

  _onPathChange(path) {
    this.renderer.drawUserPath(path);
    // Clear hint after movement
    if (this.hintCells.length) {
      this.hintCells = [];
      this.renderer.drawHint([]);
    }
  }

  _onTraceStart() {
    if (this.timerEnabled) this._startTimer();
  }

  _onSolved() {
    this._stopTimer(true);
    const ms = this.timerMs;
    if (this.timerEnabled && ms > 0) {
      const { isNew } = savePersonalBest(this.size, ms);
      this._updateBestDisplay();
      if (isNew) {
        this.els.recordBanner.hidden = false;
        setTimeout(() => {
          this.els.recordBanner.hidden = true;
        }, 3500);
      }
    }
    this._stopCelebrate = celebrate(document.body, 3200);
  }

  _showHint() {
    const current = this.tracer.currentCell || this.maze.start;
    // Include current cell so the dashed path connects visually
    const steps = getHintSteps(this.maze, this.solution, current, HINT_STEPS);
    this.hintCells = steps.length ? [current, ...steps] : [];
    this.showSolution = false;
    this._syncSolutionButton();
    this._paintOverlays();
  }

  _paintOverlays() {
    if (this.showSolution) {
      this.renderer.drawSolution(this.solution);
      this.renderer.drawHint([]);
    } else {
      this.renderer.drawSolution([]);
      this.renderer.drawHint(this.hintCells);
    }
    this.renderer.drawUserPath(this.tracer.path);
  }

  _syncSolutionButton() {
    this.els.btnSolution.textContent = this.showSolution
      ? "Hide Solution"
      : "Show Solution";
    this.els.btnSolution.setAttribute(
      "aria-pressed",
      this.showSolution ? "true" : "false"
    );
  }

  _updateSizeLabel() {
    const size = Number(this.els.sizeRange.value);
    this.els.sizeValue.textContent = `${size}×${size}`;
    this.els.difficulty.textContent = difficultyLabel(size);
    this.els.difficulty.dataset.level = difficultyLabel(size).toLowerCase();
  }

  _updateDailyBadge() {
    if (this.els.brandDate) {
      this.els.brandDate.hidden = !this.isDaily;
      if (this.isDaily) {
        const d = new Date();
        this.els.brandDate.textContent = d.toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
        });
      }
    }
    this.els.btnDaily.classList.toggle("is-active", this.isDaily);
  }

  _syncUrl() {
    const url = buildShareUrl({
      size: this.size,
      seed: this.seed,
      start: this.startIcon,
      end: this.endIcon,
      daily: this.isDaily,
    });
    history.replaceState(null, "", url);
  }

  async _share() {
    const url = buildShareUrl({
      size: this.size,
      seed: this.seed,
      start: this.startIcon,
      end: this.endIcon,
      daily: this.isDaily,
    });
    try {
      await copyToClipboard(url);
      this._toast("Link copied!");
    } catch {
      this._toast("Could not copy link");
    }
  }

  _toast(msg) {
    const t = this.els.toast;
    t.textContent = msg;
    t.hidden = false;
    t.classList.add("show");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      t.classList.remove("show");
      t.hidden = true;
    }, 2000);
  }

  _startTimer() {
    if (this.timerRunning) return;
    this.timerRunning = true;
    this._timerStart = performance.now() - this.timerMs;
    const tick = () => {
      if (!this.timerRunning) return;
      this.timerMs = performance.now() - this._timerStart;
      this._updateTimerDisplay();
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  _stopTimer(keepDisplay) {
    this.timerRunning = false;
    cancelAnimationFrame(this._raf);
    if (!keepDisplay) {
      /* timerMs left as-is for solve, or reset by caller */
    }
    this._updateTimerDisplay();
  }

  _updateTimerDisplay() {
    this.els.timerDisplay.textContent = formatTime(this.timerMs);
  }

  _updateBestDisplay() {
    const best = getPersonalBest(this.size);
    this.els.bestDisplay.textContent = best
      ? `Best: ${formatTime(best)}`
      : "Best: —";
  }

  _buildIconGrid() {
    const grid = this.els.iconGrid;
    grid.innerHTML = "";

    const makeSection = (title, key) => {
      const h = document.createElement("h3");
      h.textContent = title;
      grid.appendChild(h);
      const row = document.createElement("div");
      row.className = "emoji-row";
      row.dataset.role = key;
      ICON_OPTIONS.forEach((emoji) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "emoji-btn";
        btn.textContent = emoji;
        btn.setAttribute("aria-label", `Choose ${emoji}`);
        btn.addEventListener("click", () => {
          if (key === "start") this.startIcon = emoji;
          else this.endIcon = emoji;
          this.renderer.setIcons(this.startIcon, this.endIcon);
          this._highlightIconSelection();
          this._syncUrl();
        });
        row.appendChild(btn);
      });
      grid.appendChild(row);
    };

    makeSection("Start icon", "start");
    makeSection("End icon", "end");
    this._highlightIconSelection();
  }

  _highlightIconSelection() {
    this.els.iconGrid.querySelectorAll(".emoji-row").forEach((row) => {
      const role = row.dataset.role;
      const selected = role === "start" ? this.startIcon : this.endIcon;
      row.querySelectorAll(".emoji-btn").forEach((btn) => {
        btn.classList.toggle("selected", btn.textContent === selected);
      });
    });
  }

  _openModal(modal) {
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    if (modal === this.els.iconModal) this._highlightIconSelection();
  }

  _closeModal(modal) {
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
  }

  _doPrint() {
    const withSolution = document.querySelector(
      'input[name="print-solution"]:checked'
    )?.value === "yes";
    const layout = document.querySelector(
      'input[name="print-layout"]:checked'
    )?.value || "single";

    const sheet = this.els.printSheet;
    sheet.innerHTML = "";
    sheet.hidden = false;
    document.body.classList.add("printing");

    const count = layout === "single" ? 1 : layout === "4" ? 4 : 6;
    sheet.dataset.layout = layout === "single" ? "single" : layout === "4" ? "grid4" : "grid6";

    const title = document.createElement("h1");
    title.className = "print-title";
    title.textContent =
      count === 1
        ? `Maze Puzzle — ${this.size}×${this.size}`
        : `Maze Worksheets — ${count} puzzles`;
    sheet.appendChild(title);

    const grid = document.createElement("div");
    grid.className = "print-maze-grid";
    sheet.appendChild(grid);

    for (let i = 0; i < count; i++) {
      const seed = count === 1 ? this.seed : deriveSeed(this.seed, i);
      const size = count === 1 ? this.size : Math.min(this.size, 10);
      const maze = generateMaze(size, seed);
      const solution = solveBFS(maze);
      const card = document.createElement("figure");
      card.className = "print-card";
      const caption = document.createElement("figcaption");
      caption.textContent =
        count === 1
          ? `${this.startIcon} → ${this.endIcon}`
          : `#${i + 1}  ${this.startIcon} → ${this.endIcon}`;
      const svg = MazeRenderer.createStaticSvg(maze, {
        startIcon: this.startIcon,
        endIcon: this.endIcon,
        showSolution: withSolution,
        solution,
        compact: count > 1,
      });
      card.appendChild(caption);
      card.appendChild(svg);
      grid.appendChild(card);
    }

    this._closeModal(this.els.printModal);
    // Allow layout to paint before print
    requestAnimationFrame(() => {
      window.print();
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const app = new MazeApp();
  app.init();
  window.__mazeApp = app;
});
