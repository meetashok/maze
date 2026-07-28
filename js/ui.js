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
const SHARE_SHORT_URL = "https://bit.ly/mazeit";
const PRINT_CREDIT = "generated via bit.ly/mazeit";

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
      printPanelQuick: $("print-panel-quick"),
      printPanelBulk: $("print-panel-bulk"),
      bulkRows: $("bulk-rows"),
      bulkAddRow: $("bulk-add-row"),
      bulkTotal: $("bulk-total"),
      shareShortlink: $("share-shortlink"),
      brandDate: $("brand-date"),
    };
    this.printMode = "quick";
    this.bulkEntries = [{ size: 8, count: 1 }];
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

    els.btnPrint.addEventListener("click", () => {
      this.printMode = this.printMode || "quick";
      if (!this.bulkEntries?.length) {
        this.bulkEntries = [{ size: this.size || 8, count: 1 }];
      } else {
        this.bulkEntries[0].size = this.bulkEntries[0].size || this.size || 8;
      }
      this._syncPrintModeUI();
      this._renderBulkRows();
      this._openModal(els.printModal);
    });
    els.printModalClose.addEventListener("click", () => this._closeModal(els.printModal));
    els.printModal.addEventListener("click", (e) => {
      if (e.target === els.printModal) this._closeModal(els.printModal);
    });
    els.printGo.addEventListener("click", () => this._doPrint());

    els.printModal.querySelectorAll(".print-mode-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        this.printMode = tab.dataset.printMode === "bulk" ? "bulk" : "quick";
        this._syncPrintModeUI();
      });
    });

    els.bulkAddRow?.addEventListener("click", () => {
      const nextSize = Math.min(20, (this.bulkEntries.at(-1)?.size || 8) + 1);
      this.bulkEntries.push({ size: nextSize, count: 1 });
      this._renderBulkRows();
    });

    els.shareShortlink?.addEventListener("click", (e) => {
      e.preventDefault();
      this._shareToolLink();
    });

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

  async _shareToolLink() {
    const url = SHARE_SHORT_URL;
    const shareData = {
      title: "Maze Play",
      text: "Help the frog reach the bug — try Maze Play!",
      url,
    };
    try {
      if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
        await navigator.share(shareData);
        return;
      }
    } catch (err) {
      if (err?.name === "AbortError") return;
    }
    try {
      await copyToClipboard(url);
      this._toast("Link copied: bit.ly/mazeit");
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
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

  _syncPrintModeUI() {
    const isBulk = this.printMode === "bulk";
    this.els.printModal.querySelectorAll(".print-mode-tab").forEach((tab) => {
      const active = tab.dataset.printMode === this.printMode;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });
    if (this.els.printPanelQuick) this.els.printPanelQuick.hidden = isBulk;
    if (this.els.printPanelBulk) this.els.printPanelBulk.hidden = !isBulk;
  }

  _renderBulkRows() {
    const host = this.els.bulkRows;
    if (!host) return;
    if (!this.bulkEntries.length) {
      this.bulkEntries = [{ size: this.size || 8, count: 1 }];
    }
    host.innerHTML = "";
    this.bulkEntries.forEach((entry, index) => {
      const row = document.createElement("div");
      row.className = "bulk-row";

      const sizeLabel = document.createElement("label");
      sizeLabel.className = "bulk-field";
      sizeLabel.innerHTML = `<span>Size</span>`;
      const sizeSelect = document.createElement("select");
      sizeSelect.className = "bulk-select";
      sizeSelect.setAttribute("aria-label", `Grid size for row ${index + 1}`);
      for (let s = 4; s <= 20; s++) {
        const opt = document.createElement("option");
        opt.value = String(s);
        opt.textContent = `${s}×${s} (${difficultyLabel(s)})`;
        if (s === entry.size) opt.selected = true;
        sizeSelect.appendChild(opt);
      }
      sizeSelect.addEventListener("change", () => {
        this.bulkEntries[index].size = Number(sizeSelect.value);
        this._updateBulkTotal();
      });
      sizeLabel.appendChild(sizeSelect);

      const countLabel = document.createElement("label");
      countLabel.className = "bulk-field";
      countLabel.innerHTML = `<span>Copies</span>`;
      const countInput = document.createElement("input");
      countInput.type = "number";
      countInput.className = "bulk-count";
      countInput.min = "1";
      countInput.max = "50";
      countInput.value = String(entry.count);
      countInput.setAttribute("aria-label", `Number of mazes for row ${index + 1}`);
      countInput.addEventListener("change", () => {
        const n = Math.max(1, Math.min(50, parseInt(countInput.value, 10) || 1));
        countInput.value = String(n);
        this.bulkEntries[index].count = n;
        this._updateBulkTotal();
      });
      countLabel.appendChild(countInput);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "btn btn-ghost bulk-remove";
      removeBtn.textContent = "Remove";
      removeBtn.disabled = this.bulkEntries.length <= 1;
      removeBtn.addEventListener("click", () => {
        if (this.bulkEntries.length <= 1) return;
        this.bulkEntries.splice(index, 1);
        this._renderBulkRows();
      });

      row.appendChild(sizeLabel);
      row.appendChild(countLabel);
      row.appendChild(removeBtn);
      host.appendChild(row);
    });
    this._updateBulkTotal();
  }

  _updateBulkTotal() {
    const total = this.bulkEntries.reduce((sum, e) => sum + (e.count || 0), 0);
    if (this.els.bulkTotal) {
      this.els.bulkTotal.textContent = `Total pages: ${total}`;
    }
  }

  _appendPrintCredit(parent) {
    const credit = document.createElement("p");
    credit.className = "print-credit";
    credit.textContent = PRINT_CREDIT;
    parent.appendChild(credit);
  }

  _makePrintPage({ size, seed, withSolution, pageLabel }) {
    const page = document.createElement("section");
    page.className = "print-page";

    const title = document.createElement("h1");
    title.className = "print-title";
    title.textContent = pageLabel || `Maze Puzzle — ${size}×${size}`;
    page.appendChild(title);

    const maze = generateMaze(size, seed);
    const solution = solveBFS(maze);
    const card = document.createElement("figure");
    card.className = "print-card";
    const caption = document.createElement("figcaption");
    caption.textContent = `${this.startIcon} → ${this.endIcon}`;
    const svg = MazeRenderer.createStaticSvg(maze, {
      startIcon: this.startIcon,
      endIcon: this.endIcon,
      showSolution: withSolution,
      solution,
      compact: false,
    });
    card.appendChild(caption);
    card.appendChild(svg);
    page.appendChild(card);
    this._appendPrintCredit(page);
    return page;
  }

  _doPrint() {
    const withSolution = document.querySelector(
      'input[name="print-solution"]:checked'
    )?.value === "yes";

    const sheet = this.els.printSheet;
    sheet.innerHTML = "";
    sheet.hidden = false;
    document.body.classList.add("printing");

    if (this.printMode === "bulk") {
      sheet.dataset.layout = "bulk";
      let pageIndex = 0;
      for (const entry of this.bulkEntries) {
        const size = Math.max(4, Math.min(20, entry.size | 0));
        const count = Math.max(1, Math.min(50, entry.count | 0));
        for (let i = 0; i < count; i++) {
          const seed = deriveSeed(this.seed, pageIndex);
          pageIndex += 1;
          sheet.appendChild(
            this._makePrintPage({
              size,
              seed,
              withSolution,
              pageLabel: `Maze Puzzle — ${size}×${size}  (#${pageIndex})`,
            })
          );
        }
      }
      if (!pageIndex) {
        this._toast("Add at least one maze to print");
        sheet.innerHTML = "";
        sheet.hidden = true;
        document.body.classList.remove("printing");
        return;
      }
    } else {
      const layout = document.querySelector(
        'input[name="print-layout"]:checked'
      )?.value || "single";
      const count = layout === "single" ? 1 : layout === "4" ? 4 : 6;
      sheet.dataset.layout = layout === "single" ? "single" : layout === "4" ? "grid4" : "grid6";

      if (count === 1) {
        sheet.appendChild(
          this._makePrintPage({
            size: this.size,
            seed: this.seed,
            withSolution,
            pageLabel: `Maze Puzzle — ${this.size}×${this.size}`,
          })
        );
      } else {
        const page = document.createElement("section");
        page.className = "print-page print-page-worksheet";
        const title = document.createElement("h1");
        title.className = "print-title";
        title.textContent = `Maze Worksheets — ${count} puzzles`;
        page.appendChild(title);

        const grid = document.createElement("div");
        grid.className = "print-maze-grid";
        page.appendChild(grid);

        for (let i = 0; i < count; i++) {
          const seed = deriveSeed(this.seed, i);
          const size = Math.min(this.size, 10);
          const maze = generateMaze(size, seed);
          const solution = solveBFS(maze);
          const card = document.createElement("figure");
          card.className = "print-card";
          const caption = document.createElement("figcaption");
          caption.textContent = `#${i + 1}  ${this.startIcon} → ${this.endIcon}`;
          const svg = MazeRenderer.createStaticSvg(maze, {
            startIcon: this.startIcon,
            endIcon: this.endIcon,
            showSolution: withSolution,
            solution,
            compact: true,
          });
          card.appendChild(caption);
          card.appendChild(svg);
          grid.appendChild(card);
        }
        this._appendPrintCredit(page);
        sheet.appendChild(page);
      }
    }

    this._closeModal(this.els.printModal);
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
