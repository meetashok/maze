/**
 * Trace Letters & Numbers  -  print-first worksheets + light online practice.
 */

import { celebrate, showCelebrationOverlay, hideCelebrationOverlay } from "./confetti.js";
import { playPop, playBonk } from "./sound.js";
import {
  dailyTraceSeed,
  copyToClipboard,
  buildGameUrl,
  setGameHash,
  parseGameHash,
  mulberry32,
  loadStore,
} from "./common.js";
import { letterPaths, numberPaths } from "./dots-shapes.js";
import { getGlyphTip, encourageTipForGlyph } from "./trace-tips.js";

const PRINT_CREDIT = "myzoyna.com";
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LETTERS_LOWER = "abcdefghijklmnopqrstuvwxyz";
const DIGITS = "0123456789";
const TRACE_THRESHOLD = 0.07;
const STROKE_COMPLETE = 0.82;
const TRACE_PROGRESS_KEY = "trace-practice-progress";

function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function pathLength(path) {
  let len = 0;
  for (let i = 1; i < path.length; i++) len += dist(path[i - 1], path[i]);
  return len;
}

/** Closest point + cumulative progress (0–1) along a polyline. */
function nearestOnPath(path, pt) {
  if (!path.length) return { point: pt, dist: Infinity, progress: 0 };
  if (path.length === 1) {
    return { point: path[0], dist: dist(path[0], pt), progress: 0 };
  }
  const total = pathLength(path) || 1;
  let best = { point: path[0], dist: Infinity, progress: 0 };
  let along = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const seg = dist(a, b) || 1e-9;
    const t = Math.max(0, Math.min(1, ((pt.x - a.x) * (b.x - a.x) + (pt.y - a.y) * (b.y - a.y)) / (seg * seg)));
    const proj = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    const d = dist(proj, pt);
    const progress = (along + seg * t) / total;
    if (d < best.dist) best = { point: proj, dist: d, progress };
    along += seg;
  }
  return best;
}

function pathToD(path, tx, ty) {
  if (!path.length) return "";
  let d = `M ${tx(path[0].x)} ${ty(path[0].y)}`;
  for (let i = 1; i < path.length; i++) d += ` L ${tx(path[i].x)} ${ty(path[i].y)}`;
  return d;
}

function directionArrow(path, tx, ty, at = 0.18) {
  if (path.length < 2) return null;
  const total = pathLength(path) || 1;
  const target = total * at;
  let along = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const seg = dist(a, b);
    if (along + seg >= target || i === path.length - 1) {
      const t = seg > 0 ? Math.min(1, (target - along) / seg) : 0;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      return { x: tx(x), y: ty(y), angle };
    }
    along += seg;
  }
  return null;
}

export function resolveTraceGlyph(kind, glyph, letterCase = "upper") {
  if (kind === "number") {
    const data = numberPaths(glyph);
    if (!data) return null;
    return { kind: "number", glyph: String(glyph), paths: data.paths, color: data.color, id: `number-${glyph}` };
  }
  const wantLower = letterCase === "lower";
  const ch = wantLower ? String(glyph).toLowerCase() : String(glyph).toUpperCase();
  const data = letterPaths(ch);
  if (!data) return null;
  return {
    kind: "letter",
    glyph: ch,
    paths: data.paths,
    color: data.color,
    id: `letter-${ch.toLowerCase()}${wantLower ? "-lower" : ""}`,
    letterCase: wantLower ? "lower" : "upper",
  };
}

export function listTraceGlyphs(kind = "letter", letterCase = "upper") {
  if (kind === "number") {
    return [...DIGITS].map((g) => resolveTraceGlyph("number", g));
  }
  const alphabet = letterCase === "lower" ? LETTERS_LOWER : LETTERS;
  return [...alphabet].map((g) => resolveTraceGlyph("letter", g, letterCase));
}

export function pickDailyTraceGlyph(date = new Date()) {
  const seed = dailyTraceSeed(date);
  const pool = [...listTraceGlyphs("letter"), ...listTraceGlyphs("number")];
  return pool[seed % pool.length];
}

export function guideStyleForDifficulty(difficulty) {
  if (difficulty === "easy") {
    return { dash: "2.2 2.4", opacity: 0.7, showArrows: true, showStrokeNumbers: true, showLines: true };
  }
  if (difficulty === "hard") {
    return { dash: "1.4 2.8", opacity: 0.35, showArrows: false, showStrokeNumbers: false, showLines: false };
  }
  return { dash: "1.8 2.6", opacity: 0.55, showArrows: true, showStrokeNumbers: true, showLines: false };
}

export class TraceApp {
  constructor() {
    this.kind = "letter";
    this.glyph = "A";
    this.letterCase = "upper";
    this.item = null;
    this.difficulty = "easy";
    this.showArrows = true;
    this.showStrokeNumbers = true;
    this.showLines = true;
    this.isDaily = false;
    this.strokeIndex = 0;
    this.completed = false;
    this.maxProgress = 0;
    this.drawing = false;
    this.ink = [];
    this.inkStrokes = [];
    this._stopCelebrate = null;
    this._pointerId = null;
    this.els = {};
  }

  async init() {
    this._cacheEls();
    this._bindControls();
    this._buildPicker();
    this._syncGuideTogglesFromDifficulty();
    const { game, params } = parseGameHash();
    if (game === "trace") {
      this.onHashChange(params);
    } else {
      this._setGlyph("letter", "A", { sync: false });
    }
    window.addEventListener("resize", () => this._render());
  }

  _cacheEls() {
    const $ = (id) => document.getElementById(id);
    this.els = {
      stage: $("trace-stage"),
      status: $("trace-status"),
      progress: $("trace-progress"),
      completeBanner: $("trace-complete-banner"),
      celebrate: $("trace-celebrate"),
      picker: $("trace-picker"),
      pickerToggle: $("trace-picker-toggle"),
      kindButtons: $("trace-kind"),
      caseButtons: $("trace-case"),
      caseBlock: $("trace-case-block"),
      difficulty: $("trace-difficulty"),
      btnNew: $("trace-btn-new"),
      btnReset: $("trace-btn-reset"),
      btnDaily: $("trace-btn-daily"),
      btnPrev: $("trace-btn-prev"),
      btnNext: $("trace-btn-next"),
      btnShare: $("trace-btn-share"),
      btnPrint: $("trace-btn-print"),
      chkArrows: $("trace-show-arrows"),
      chkNumbers: $("trace-show-numbers"),
      chkLines: $("trace-show-lines"),
      dailyChip: $("trace-daily-chip"),
      parentGlyphLabel: $("trace-parent-glyph-label"),
      parentSteps: $("trace-parent-steps"),
      parentCoach: $("trace-parent-coach"),
      parentEncourage: $("trace-parent-encourage"),
      printModal: $("trace-print-modal"),
      printClose: $("trace-print-modal-close"),
      printGo: $("trace-print-go"),
      toast: $("toast"),
    };
  }

  _bindControls() {
    this.els.btnNew?.addEventListener("click", () => {
      this.isDaily = false;
      this._pickRandom();
    });
    this.els.btnReset?.addEventListener("click", () => this._resetPractice());
    this.els.btnDaily?.addEventListener("click", () => this._loadDaily());
    this.els.btnShare?.addEventListener("click", () => this._share());
    this.els.btnPrint?.addEventListener("click", () => this._openPrintModal());
    this.els.printClose?.addEventListener("click", () => this._closePrintModal());
    this.els.printGo?.addEventListener("click", () => this._doPrint());
    this.els.printModal?.addEventListener("click", (e) => {
      if (e.target === this.els.printModal) this._closePrintModal();
    });
    this.els.btnPrev?.addEventListener("click", () => this._stepGlyph(-1));
    this.els.btnNext?.addEventListener("click", () => this._stepGlyph(1));
    this.els.pickerToggle?.addEventListener("click", () => this._togglePicker());

    this.els.kindButtons?.querySelectorAll("[data-kind]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.kind = btn.dataset.kind;
        this._syncKindButtons();
        this._syncCaseVisibility();
        this._buildPicker();
        const first = this.kind === "number" ? "0" : this.letterCase === "lower" ? "a" : "A";
        this._setGlyph(this.kind, first);
      });
    });

    this.els.caseButtons?.querySelectorAll("[data-case]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.letterCase = btn.dataset.case === "lower" ? "lower" : "upper";
        this._syncCaseButtons();
        this._buildPicker();
        const ch = this.letterCase === "lower" ? this.glyph.toLowerCase() : this.glyph.toUpperCase();
        this._setGlyph("letter", ch);
      });
    });

    this.els.difficulty?.querySelectorAll("[data-diff]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.difficulty = btn.dataset.diff;
        this._syncDifficultyButtons();
        this._syncGuideTogglesFromDifficulty();
        this._render();
        this._syncUrl();
      });
    });

    this.els.chkArrows?.addEventListener("change", () => {
      this.showArrows = this.els.chkArrows.checked;
      this._render();
    });
    this.els.chkNumbers?.addEventListener("change", () => {
      this.showStrokeNumbers = this.els.chkNumbers.checked;
      this._render();
    });
    this.els.chkLines?.addEventListener("change", () => {
      this.showLines = this.els.chkLines.checked;
      this._render();
    });
  }

  _togglePicker() {
    const picker = this.els.picker;
    const toggle = this.els.pickerToggle;
    if (!picker || !toggle) return;
    const open = picker.hidden;
    picker.hidden = !open;
    picker.classList.toggle("is-collapsed", !open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.textContent = open
      ? this.kind === "number"
        ? "Hide number picker"
        : "Hide letter picker"
      : this.kind === "number"
        ? "Pick a number"
        : "Pick a letter";
  }

  _syncCaseVisibility() {
    if (this.els.caseBlock) this.els.caseBlock.hidden = this.kind !== "letter";
  }

  _syncCaseButtons() {
    this.els.caseButtons?.querySelectorAll("[data-case]").forEach((btn) => {
      const on = btn.dataset.case === this.letterCase;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  _syncGuideTogglesFromDifficulty() {
    const style = guideStyleForDifficulty(this.difficulty);
    this.showArrows = style.showArrows;
    this.showStrokeNumbers = style.showStrokeNumbers;
    this.showLines = style.showLines;
    if (this.els.chkArrows) this.els.chkArrows.checked = this.showArrows;
    if (this.els.chkNumbers) this.els.chkNumbers.checked = this.showStrokeNumbers;
    if (this.els.chkLines) this.els.chkLines.checked = this.showLines;
  }

  _syncKindButtons() {
    this.els.kindButtons?.querySelectorAll("[data-kind]").forEach((btn) => {
      const on = btn.dataset.kind === this.kind;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  _syncDifficultyButtons() {
    this.els.difficulty?.querySelectorAll("[data-diff]").forEach((btn) => {
      const on = btn.dataset.diff === this.difficulty;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  _buildPicker() {
    const root = this.els.picker;
    if (!root) return;
    root.innerHTML = "";
    const practiced = loadStore(TRACE_PROGRESS_KEY);
    const glyphs =
      this.kind === "number"
        ? DIGITS
        : this.letterCase === "lower"
          ? LETTERS_LOWER
          : LETTERS;
    for (const g of glyphs) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "trace-glyph-btn";
      const key = this._progressKey(this.kind, g);
      const stars = practiced[key]?.stars || 0;
      btn.textContent = stars ? `${g} ★` : g;
      btn.dataset.glyph = g;
      btn.setAttribute("aria-label", `Trace ${g}${stars ? `, practiced` : ""}`);
      if (g === this.glyph) btn.classList.add("is-active");
      if (stars) btn.classList.add("is-practiced");
      btn.addEventListener("click", () => {
        this.isDaily = false;
        this._setGlyph(this.kind, g);
      });
      root.appendChild(btn);
    }
    this._syncCaseVisibility();
    this._syncCaseButtons();
  }

  _progressKey(kind, glyph) {
    return `${kind}:${glyph}`;
  }

  _stepGlyph(dir) {
    const glyphs =
      this.kind === "number"
        ? [...DIGITS]
        : this.letterCase === "lower"
          ? [...LETTERS_LOWER]
          : [...LETTERS];
    let idx = glyphs.indexOf(this.glyph);
    if (idx < 0) idx = 0;
    idx = (idx + dir + glyphs.length) % glyphs.length;
    this.isDaily = false;
    this._setGlyph(this.kind, glyphs[idx]);
  }

  _syncPickerActive() {
    this.els.picker?.querySelectorAll(".trace-glyph-btn").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.glyph === this.glyph);
    });
  }

  _setGlyph(kind, glyph, { sync = true } = {}) {
    const item = resolveTraceGlyph(kind, glyph, kind === "letter" ? this.letterCase : "upper");
    if (!item) return;
    this.kind = item.kind;
    this.glyph = item.glyph;
    if (item.letterCase) this.letterCase = item.letterCase;
    this.item = item;
    this._resetPractice(false);
    this._syncKindButtons();
    this._syncCaseButtons();
    this._syncCaseVisibility();
    this._syncPickerActive();
    this._updateDailyChip();
    this._updateProgressLabel();
    this._render();
    if (sync) this._syncUrl();
  }

  _pickRandom() {
    const pool = listTraceGlyphs(this.kind, this.letterCase);
    const rand = mulberry32((Math.random() * 0xffffffff) >>> 0);
    const item = pool[Math.floor(rand() * pool.length)];
    if (item.letterCase) this.letterCase = item.letterCase;
    this._setGlyph(item.kind, item.glyph);
  }

  _loadDaily() {
    const item = pickDailyTraceGlyph();
    this.isDaily = true;
    this.difficulty = "easy";
    this.letterCase = item.letterCase || "upper";
    this._syncDifficultyButtons();
    this._syncGuideTogglesFromDifficulty();
    this.kind = item.kind;
    this._buildPicker();
    this._setGlyph(item.kind, item.glyph);
  }

  _resetPractice(render = true) {
    this._stopCelebrate?.();
    this._stopCelebrate = null;
    hideCelebrationOverlay(this.els.celebrate);
    this.strokeIndex = 0;
    this.completed = false;
    this.maxProgress = 0;
    this.drawing = false;
    this.ink = [];
    this.inkStrokes = [];
    this._pointerId = null;
    if (this.els.completeBanner) this.els.completeBanner.hidden = true;
    this._updateStatus();
    this._updateProgressLabel();
    if (render) this._render();
  }

  _updateProgressLabel() {
    if (!this.els.progress) return;
    const store = loadStore(TRACE_PROGRESS_KEY);
    const practiced = Object.keys(store).filter((k) => k.startsWith("letter:") || k.startsWith("number:")).length;
    const key = this._progressKey(this.kind, this.glyph);
    const stars = store[key]?.stars || 0;
    this.els.progress.textContent = stars
      ? `Practiced ${this.glyph}: ${"★".repeat(stars)}${"☆".repeat(3 - stars)} · ${practiced} glyphs total`
      : practiced
        ? `${practiced} glyphs practiced: keep going!`
        : "Trace to earn stars";
  }

  _recordPractice() {
    try {
      const store = loadStore(TRACE_PROGRESS_KEY);
      const key = this._progressKey(this.kind, this.glyph);
      const prev = store[key] || { count: 0, stars: 0 };
      const count = (prev.count || 0) + 1;
      const stars = Math.min(3, Math.max(prev.stars || 0, count >= 3 ? 3 : count));
      store[key] = { count, stars, at: Date.now() };
      localStorage.setItem(TRACE_PROGRESS_KEY, JSON.stringify(store));
    } catch {
      /* ignore */
    }
    this._buildPicker();
    this._updateProgressLabel();
  }

  _updateStatus() {
    if (!this.els.status || !this.item) return;
    if (this.completed) {
      this.els.status.textContent = `Nice! You traced ${this.glyph}`;
    } else {
      const n = this.item.paths.length;
      this.els.status.textContent =
        n <= 1
          ? `Trace the ${this.kind === "number" ? "number" : "letter"} ${this.glyph}`
          : `Stroke ${this.strokeIndex + 1} of ${n}: start at the glowing dot`;
    }
    this._updateParentTips();
  }

  _updateParentTips() {
    const tip = getGlyphTip(this.kind, this.glyph);
    const { parentGlyphLabel, parentSteps, parentCoach, parentEncourage } = this.els;
    if (!parentSteps) return;

    if (parentGlyphLabel) {
      parentGlyphLabel.textContent = tip
        ? `Tracing ${this.glyph}`
        : `Tracing ${this.glyph}`;
    }

    parentSteps.innerHTML = "";
    if (tip?.steps?.length) {
      for (const step of tip.steps) {
        const li = document.createElement("li");
        li.textContent = step;
        parentSteps.appendChild(li);
      }
    }

    if (parentCoach) {
      parentCoach.textContent = tip?.coach ? `Say with them: ${tip.coach}` : "";
      parentCoach.hidden = !tip?.coach;
    }
    if (parentEncourage) {
      parentEncourage.textContent = `Tip: ${encourageTipForGlyph(this.glyph)}`;
    }
  }

  _updateDailyChip() {
    if (!this.els.dailyChip) return;
    this.els.dailyChip.hidden = !this.isDaily;
  }

  onHashChange(params) {
    if (!(params instanceof URLSearchParams)) {
      params = new URLSearchParams(params || "");
    }
    if (params.get("daily") === "1") {
      this._loadDaily();
      return;
    }
    const kind = params.get("kind") === "number" ? "number" : "letter";
    const letterCase = params.get("case") === "lower" ? "lower" : "upper";
    this.letterCase = letterCase;
    const glyph =
      params.get("glyph") ||
      (kind === "number" ? "0" : letterCase === "lower" ? "a" : "A");
    const diff = params.get("diff");
    if (diff === "easy" || diff === "medium" || diff === "hard") {
      this.difficulty = diff;
      this._syncDifficultyButtons();
      this._syncGuideTogglesFromDifficulty();
    }
    this.isDaily = false;
    this.kind = kind;
    this._buildPicker();
    this._setGlyph(kind, glyph);
  }

  _guideOptions() {
    const base = guideStyleForDifficulty(this.difficulty);
    return {
      ...base,
      showArrows: this.showArrows,
      showStrokeNumbers: this.showStrokeNumbers,
      showLines: this.showLines,
    };
  }

  _coords(svg, clientX, clientY) {
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const local = pt.matrixTransform(ctm.inverse());
    const pad = 10;
    const scale = 80;
    return {
      x: (local.x - pad) / scale,
      y: (local.y - pad) / scale,
    };
  }

  _bindStagePointer(svg) {
    const stage = this.els.stage;
    const endTraceMode = () => {
      this.drawing = false;
      this._pointerId = null;
      stage?.classList.remove("is-tracing");
    };

    const onDown = (e) => {
      if (this.completed || !this.item) return;
      if (e.button != null && e.button !== 0) return;
      const pt = this._coords(svg, e.clientX, e.clientY);
      if (!pt) return;
      const stroke = this.item.paths[this.strokeIndex];
      if (!stroke?.length) return;
      const near = nearestOnPath(stroke, pt);
      // Missed the start dot  -  don't capture the pointer so the page can scroll.
      if (near.dist > TRACE_THRESHOLD * 1.4 || near.progress > 0.25) {
        return;
      }
      this.drawing = true;
      this._pointerId = e.pointerId;
      this.maxProgress = near.progress;
      this.ink = [pt];
      stage?.classList.add("is-tracing");
      playPop();
      try {
        svg.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      e.preventDefault();
    };

    const onMove = (e) => {
      if (!this.drawing || e.pointerId !== this._pointerId) return;
      const pt = this._coords(svg, e.clientX, e.clientY);
      if (!pt) return;
      const stroke = this.item.paths[this.strokeIndex];
      const near = nearestOnPath(stroke, pt);
      if (near.dist > TRACE_THRESHOLD * 1.6) {
        endTraceMode();
        this.ink = [];
        this._render();
        this._toast("Stay on the dashed line");
        playBonk();
        return;
      }
      this.maxProgress = Math.max(this.maxProgress, near.progress);
      this.ink.push(pt);
      this._updateInkPath(svg);
      e.preventDefault();
    };

    const onUp = (e) => {
      if (!this.drawing || e.pointerId !== this._pointerId) return;
      const finishedStroke = this.maxProgress >= STROKE_COMPLETE;
      if (finishedStroke) {
        this.inkStrokes.push([...this.ink]);
        this.ink = [];
        this.maxProgress = 0;
        this.strokeIndex += 1;
        playPop();
        endTraceMode();
        if (this.strokeIndex >= this.item.paths.length) {
          this._complete();
        } else {
          this._updateStatus();
          this._render();
        }
      } else {
        this.ink = [];
        this.maxProgress = 0;
        endTraceMode();
        this._render();
        this._toast("Keep going along the line");
        playBonk();
      }
      e.preventDefault();
    };

    svg.addEventListener("pointerdown", onDown);
    svg.addEventListener("pointermove", onMove);
    svg.addEventListener("pointerup", onUp);
    svg.addEventListener("pointercancel", onUp);
  }

  _updateInkPath(svg) {
    let ink = svg.querySelector(".trace-ink-live");
    if (!ink) {
      ink = document.createElementNS("http://www.w3.org/2000/svg", "path");
      ink.setAttribute("class", "trace-ink-live");
      svg.querySelector(".trace-ink-layer")?.appendChild(ink);
    }
    const pad = 10;
    const scale = 80;
    const tx = (x) => pad + x * scale;
    const ty = (y) => pad + y * scale;
    ink.setAttribute("d", pathToD(this.ink, tx, ty));
  }

  _complete() {
    this.completed = true;
    this._recordPractice();
    this._updateStatus();
    if (this.els.completeBanner) {
      this.els.completeBanner.hidden = false;
      this.els.completeBanner.textContent = `You wrote ${this.glyph}! 🎉`;
    }
    this._render();
    this._stopCelebrate = celebrate(document.body, 3200);
    showCelebrationOverlay(this.els.celebrate, {
      emoji: "✏️",
      detail: `You wrote the ${this.kind === "number" ? "number" : "letter"} ${this.glyph}!`,
      againLabel: "Try Again",
      newLabel: this.kind === "number" ? "Next Number" : "Next Letter",
      onAgain: () => this._resetPractice(),
      onNew: () => this._stepGlyph(1),
    });
  }

  _renderGlyphSvg({ item, options, interactive = false, compact = false, showInk = true }) {
    const vb = 100;
    const pad = compact ? 8 : 10;
    const scale = vb - pad * 2;
    const tx = (x) => pad + x * scale;
    const ty = (y) => pad + y * scale;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${vb} ${vb}`);
    svg.setAttribute("class", interactive ? "trace-svg" : "trace-print-svg");
    if (interactive) {
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", `Trace ${item.glyph}`);
      svg.style.touchAction = "none";
    }

    if (options.showLines) {
      const lines = document.createElementNS("http://www.w3.org/2000/svg", "g");
      lines.setAttribute("class", "trace-ruled-lines");
      for (const y of [0.12, 0.5, 0.88]) {
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", tx(0.08));
        line.setAttribute("y1", ty(y));
        line.setAttribute("x2", tx(0.92));
        line.setAttribute("y2", ty(y));
        line.setAttribute("class", y === 0.5 ? "trace-rule mid" : "trace-rule");
        lines.appendChild(line);
      }
      svg.appendChild(lines);
    }

    const guides = document.createElementNS("http://www.w3.org/2000/svg", "g");
    guides.setAttribute("class", "trace-guides");
    item.paths.forEach((path, i) => {
      const done = interactive && i < this.strokeIndex;
      const active = interactive && i === this.strokeIndex && !this.completed;
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", pathToD(path, tx, ty));
      p.setAttribute(
        "class",
        `trace-guide${done ? " done" : ""}${active ? " active" : ""}${this.completed ? " complete" : ""}`
      );
      p.setAttribute("stroke-dasharray", options.dash);
      p.style.opacity = String(done || this.completed ? 0.25 : options.opacity);
      guides.appendChild(p);

      if (options.showStrokeNumbers && path[0]) {
        const num = document.createElementNS("http://www.w3.org/2000/svg", "text");
        num.setAttribute("x", tx(path[0].x) - 3.5);
        num.setAttribute("y", ty(path[0].y) - 3.5);
        num.setAttribute("class", "trace-stroke-num");
        num.textContent = String(i + 1);
        guides.appendChild(num);
      }

      if (options.showArrows) {
        const arrow = directionArrow(path, tx, ty);
        if (arrow) {
          const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
          g.setAttribute("transform", `translate(${arrow.x} ${arrow.y}) rotate(${arrow.angle})`);
          const tri = document.createElementNS("http://www.w3.org/2000/svg", "path");
          tri.setAttribute("d", "M 0 0 L -3.2 -2.2 L -3.2 2.2 Z");
          tri.setAttribute("class", "trace-arrow");
          g.appendChild(tri);
          guides.appendChild(g);
        }
      }
    });
    svg.appendChild(guides);

    if (showInk) {
      const inkLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
      inkLayer.setAttribute("class", "trace-ink-layer");
      for (const stroke of this.inkStrokes) {
        const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
        p.setAttribute("d", pathToD(stroke, tx, ty));
        p.setAttribute("class", "trace-ink");
        inkLayer.appendChild(p);
      }
      if (this.ink.length) {
        const live = document.createElementNS("http://www.w3.org/2000/svg", "path");
        live.setAttribute("d", pathToD(this.ink, tx, ty));
        live.setAttribute("class", "trace-ink-live");
        inkLayer.appendChild(live);
      }
      svg.appendChild(inkLayer);
    }

    const starts = document.createElementNS("http://www.w3.org/2000/svg", "g");
    starts.setAttribute("class", "trace-starts");
    item.paths.forEach((path, i) => {
      if (!path[0]) return;
      if (interactive && (i < this.strokeIndex || this.completed)) return;
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("cx", tx(path[0].x));
      c.setAttribute("cy", ty(path[0].y));
      c.setAttribute("r", interactive && i === this.strokeIndex ? 2.4 : 1.8);
      c.setAttribute(
        "class",
        `trace-start${interactive && i === this.strokeIndex ? " current" : ""}`
      );
      starts.appendChild(c);
    });
    svg.appendChild(starts);

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", vb / 2);
    label.setAttribute("y", compact ? 7 : 6);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("class", "trace-glyph-label");
    label.textContent = item.glyph;
    svg.appendChild(label);

    return svg;
  }

  _render() {
    const { stage } = this.els;
    if (!stage || !this.item) return;
    const options = this._guideOptions();
    const svg = this._renderGlyphSvg({
      item: this.item,
      options,
      interactive: true,
      showInk: true,
    });
    this._bindStagePointer(svg);
    stage.innerHTML = "";
    stage.appendChild(svg);
    this._updateStatus();
  }

  _syncUrl() {
    const params = this.getShareParams();
    const { game } = parseGameHash();
    if (game === "trace") setGameHash("trace", params);
    return params;
  }

  getShareParams() {
    return {
      glyph: this.glyph,
      kind: this.kind !== "letter" ? this.kind : undefined,
      case: this.kind === "letter" && this.letterCase === "lower" ? "lower" : undefined,
      diff: this.difficulty !== "easy" ? this.difficulty : undefined,
      daily: this.isDaily ? "1" : undefined,
    };
  }

  getShareUrl() {
    return buildGameUrl("trace", this.getShareParams());
  }

  async _share() {
    const url = this.getShareUrl();
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "Trace Letters & Numbers",
          text: `Practice tracing ${this.glyph}!`,
          url,
        });
        return;
      } catch {
        /* fall through */
      }
    }
    await copyToClipboard(url);
    this._toast("Link copied!");
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
    }, 1800);
  }

  _openPrintModal() {
    this.els.printModal.hidden = false;
    this.els.printModal.setAttribute("aria-hidden", "false");
  }

  _closePrintModal() {
    this.els.printModal.hidden = true;
    this.els.printModal.setAttribute("aria-hidden", "true");
  }

  _doPrint() {
    const layout =
      document.querySelector('input[name="trace-print-layout"]:checked')?.value || "single";
    const sheet = document.getElementById("print-sheet");
    sheet.innerHTML = "";
    sheet.hidden = false;
    document.body.classList.add("printing");

    const options = this._guideOptions();

    const makePage = (title, items, gridClass) => {
      const page = document.createElement("section");
      page.className = "print-page";
      const h = document.createElement("h1");
      h.className = "print-title";
      h.textContent = title;
      page.appendChild(h);
      if (gridClass) {
        const grid = document.createElement("div");
        grid.className = gridClass;
        for (const item of items) {
          const card = document.createElement("figure");
          card.className = "print-card";
          const cap = document.createElement("figcaption");
          cap.textContent = item.glyph;
          card.appendChild(cap);
          card.appendChild(
            this._renderGlyphSvg({ item, options, interactive: false, compact: true, showInk: false })
          );
          grid.appendChild(card);
        }
        page.appendChild(grid);
      } else {
        page.appendChild(
          this._renderGlyphSvg({
            item: items[0],
            options,
            interactive: false,
            compact: false,
            showInk: false,
          })
        );
      }
      const credit = document.createElement("p");
      credit.className = "print-credit";
      credit.textContent = PRINT_CREDIT;
      page.appendChild(credit);
      return page;
    };

    if (layout === "pack-letters") {
      const all = listTraceGlyphs("letter");
      for (let i = 0; i < all.length; i += 4) {
        const chunk = all.slice(i, i + 4);
        sheet.appendChild(
          makePage(`Trace Letters: ${chunk[0].glyph}–${chunk[chunk.length - 1].glyph}`, chunk, "print-trace-grid")
        );
      }
    } else if (layout === "pack-numbers") {
      const all = listTraceGlyphs("number");
      sheet.appendChild(makePage("Trace Numbers: 0-9", all, "print-trace-grid-numbers"));
    } else if (layout === "worksheet4" || layout === "worksheet6") {
      const count = layout === "worksheet4" ? 4 : 6;
      const pool = listTraceGlyphs(this.kind);
      const idx = pool.findIndex((p) => p.glyph === this.glyph);
      const items = [];
      for (let i = 0; i < count; i++) items.push(pool[(Math.max(0, idx) + i) % pool.length]);
      sheet.appendChild(
        makePage(`Trace Practice: ${count} glyphs`, items, "print-trace-grid")
      );
    } else {
      sheet.appendChild(makePage(`Trace ${this.glyph}`, [this.item], null));
    }

    this._closePrintModal();
    requestAnimationFrame(() => {
      window.print();
      setTimeout(() => {
        document.body.classList.remove("printing");
        sheet.hidden = true;
        sheet.innerHTML = "";
      }, 500);
    });
  }
}
