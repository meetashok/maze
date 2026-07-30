/**
 * Pattern Play — what comes next, using real preschool pattern cores.
 * Easy: AB · Medium: AAB / ABB / ABC · Hard: AABB / grow
 * Always shows at least two full units before the blank.
 */

import { celebrate, showCelebrationOverlay, hideCelebrationOverlay } from "./confetti.js";
import { playPop, playBonk } from "./sound.js";
import {
  mulberry32,
  deriveSeed,
  buildGameUrl,
  setGameHash,
  parseGameHash,
  copyToClipboard,
} from "./common.js";

const MILESTONE_EVERY = 5;
const MILESTONE_MS = 1800;
const AVOID_RECENT = 12;
const ANSWER_PAUSE_MS = 900;
const REVEAL_PAUSE_MS = 1400;
const DEAL_MS = 480;
const MAX_WRONG_TRIES = 3;

/** High-contrast colors and shapes only — no animals (easier to misread). */
const COLORS = [
  { emoji: "🔴", name: "red" },
  { emoji: "🔵", name: "blue" },
  { emoji: "🟢", name: "green" },
  { emoji: "🟡", name: "yellow" },
  { emoji: "🟠", name: "orange" },
  { emoji: "🟣", name: "purple" },
];
const SHAPES = [
  { emoji: "⭐", name: "star" },
  { emoji: "❤️", name: "heart" },
  { emoji: "🔺", name: "triangle" },
  { emoji: "🟦", name: "blue square" },
  { emoji: "⬛", name: "black square" },
  { emoji: "💎", name: "gem" },
];

/** @type {Record<string, { types: string[], unitsShown: number }>} */
export const PATTERN_DIFFICULTY = {
  easy: { types: ["AB"], unitsShown: 2 },
  medium: { types: ["AAB", "ABB", "ABC"], unitsShown: 2 },
  hard: { types: ["AABB", "ABC", "grow"], unitsShown: 2 },
};

function randInt(rand, n) {
  return Math.floor(rand() * n);
}
function pick(arr, rand) {
  return arr[randInt(rand, arr.length)];
}
function shuffle(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(rand, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function pickDistinct(pool, n, rand) {
  const shuffled = shuffle(pool, rand);
  return shuffled.slice(0, n);
}
function prefersReducedMotion() {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function buildChoices(answer, distractors, rand) {
  const unique = [];
  for (const d of [answer, ...distractors]) {
    if (d && !unique.includes(d)) unique.push(d);
  }
  const pool = [...COLORS, ...SHAPES].map((x) => x.emoji);
  while (unique.length < 3) {
    const extra = pick(pool, rand);
    if (!unique.includes(extra)) unique.push(extra);
  }
  const choices = shuffle(unique.slice(0, 3), rand);
  return { choices, correctIndex: choices.indexOf(answer) };
}

function makeFromUnit(type, unitItems, unitsShown, rand) {
  const unit = unitItems.map((x) => x.emoji);
  const names = unitItems.map((x) => x.name);
  const prompt = [];
  for (let i = 0; i < unitsShown; i++) prompt.push(...unit);
  const answer = unit[0];
  const ruleSpoken = `${names.join(", ")}, ${names.join(", ")}…`;
  const distractors = unit.filter((e) => e !== answer);
  while (distractors.length < 2) {
    const extra = pick([...COLORS, ...SHAPES], rand).emoji;
    if (!unit.includes(extra) && !distractors.includes(extra)) distractors.push(extra);
  }
  return {
    type,
    unit,
    unitLen: unit.length,
    prompt,
    answer,
    ruleLabel: type,
    hint: `Listen: ${ruleSpoken}`,
    ...buildChoices(answer, distractors, rand),
  };
}

function makeAB(rand, unitsShown) {
  const pool = pick([COLORS, SHAPES], rand);
  const [a, b] = pickDistinct(pool, 2, rand);
  return makeFromUnit("AB", [a, b], unitsShown, rand);
}

function makeAAB(rand, unitsShown) {
  const pool = pick([COLORS, SHAPES], rand);
  const [a, b] = pickDistinct(pool, 2, rand);
  return makeFromUnit("AAB", [a, a, b], unitsShown, rand);
}

function makeABB(rand, unitsShown) {
  const pool = pick([COLORS, SHAPES], rand);
  const [a, b] = pickDistinct(pool, 2, rand);
  return makeFromUnit("ABB", [a, b, b], unitsShown, rand);
}

function makeABC(rand, unitsShown) {
  const pool = pick([COLORS, SHAPES], rand);
  const [a, b, c] = pickDistinct(pool, 3, rand);
  return makeFromUnit("ABC", [a, b, c], unitsShown, rand);
}

function makeAABB(rand, unitsShown) {
  const pool = pick([COLORS, SHAPES], rand);
  const [a, b] = pickDistinct(pool, 2, rand);
  return makeFromUnit("AABB", [a, a, b, b], unitsShown, rand);
}

/**
 * Growing nest: A | A B | A B C — next is A (start of the next, longer group).
 * Separators between groups make the growth obvious.
 */
function makeGrow(rand) {
  const pool = pick([COLORS, SHAPES], rand);
  const [a, b, c] = pickDistinct(pool, 3, rand);
  const prompt = [a.emoji, a.emoji, b.emoji, a.emoji, b.emoji, c.emoji];
  const answer = a.emoji;
  return {
    type: "grow",
    unit: [a.emoji, b.emoji, c.emoji],
    unitLen: 0,
    groupSizes: [1, 2, 3],
    prompt,
    answer,
    ruleLabel: "grow",
    hint: `It grows: ${a.name}, then ${a.name} ${b.name}, then ${a.name} ${b.name} ${c.name}…`,
    ...buildChoices(answer, [b.emoji, c.emoji], rand),
  };
}

function makeByType(type, unitsShown, rand) {
  if (type === "AB") return makeAB(rand, unitsShown);
  if (type === "AAB") return makeAAB(rand, unitsShown);
  if (type === "ABB") return makeABB(rand, unitsShown);
  if (type === "ABC") return makeABC(rand, unitsShown);
  if (type === "AABB") return makeAABB(rand, unitsShown);
  return makeGrow(rand);
}

/**
 * Pure round builder. Optional `avoidKeys` skips recently used type+unit signatures.
 * @param {number} seed
 * @param {string} difficulty
 * @param {{ avoidKeys?: string[] }} [opts]
 */
export function buildPatternRound(seed, difficulty = "easy", opts = {}) {
  const diff = PATTERN_DIFFICULTY[difficulty] || PATTERN_DIFFICULTY.easy;
  const rand = mulberry32(seed >>> 0 || 1);
  const avoid = new Set(opts.avoidKeys || []);
  let round = null;
  let key = "";
  for (let attempt = 0; attempt < 24; attempt++) {
    const type = pick(diff.types, rand);
    round = makeByType(type, diff.unitsShown, rand);
    key = `${round.type}:${round.unit.join("")}`;
    if (!avoid.has(key) || avoid.size >= 12) break;
  }
  return { seed: seed >>> 0, difficulty, key, ...round };
}

export class PatternApp {
  constructor() {
    this.difficulty = "easy";
    this.sessionSeed = 1;
    this.roundIndex = 0;
    this.solvedCount = 0;
    this.round = null;
    this.lock = false;
    this.wrongTries = 0;
    this.usedKeys = [];
    this._stopCelebrate = null;
    this._answerTimer = 0;
    this._dealTimer = 0;
    this.els = {};
  }

  async init() {
    this._cacheEls();
    this._bindControls();
    this._syncDifficulty();
    const { game, params } = parseGameHash();
    if (game === "pattern") this.onHashChange(params);
    else this._newGame({ sync: false });
  }

  _cacheEls() {
    const $ = (id) => document.getElementById(id);
    this.els = {
      stage: $("pattern-stage"),
      status: $("pattern-status"),
      choices: $("pattern-choices"),
      btnNew: $("pattern-btn-new"),
      btnReset: $("pattern-btn-reset"),
      difficulty: $("pattern-difficulty"),
      celebrate: $("pattern-celebrate"),
      score: $("pattern-score"),
    };
  }

  _bindControls() {
    this.els.difficulty?.querySelectorAll(".diff-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.dataset.diff === this.difficulty) return;
        this.difficulty = btn.dataset.diff;
        this._syncDifficulty();
        this._newGame();
      });
    });
    this.els.btnNew?.addEventListener("click", () => this._newGame());
    this.els.btnReset?.addEventListener("click", () => this._restart());
  }

  _syncDifficulty() {
    this.els.difficulty?.querySelectorAll(".diff-btn").forEach((btn) => {
      const on = btn.dataset.diff === this.difficulty;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  onHashChange(params) {
    if (!(params instanceof URLSearchParams)) params = new URLSearchParams(params || "");
    const diff = params.get("diff");
    if (diff && PATTERN_DIFFICULTY[diff]) this.difficulty = diff;
    this._syncDifficulty();
    const seedRaw = parseInt(params.get("seed"), 10);
    const seed =
      Number.isFinite(seedRaw) && seedRaw > 0 ? seedRaw >>> 0 : (Math.random() * 0xffffffff) >>> 0;
    this._setupSession(seed);
  }

  _newGame({ sync = true } = {}) {
    this._setupSession((Math.random() * 0xffffffff) >>> 0, { sync });
  }

  _restart() {
    this._setupSession(this.sessionSeed);
  }

  _setupSession(seed, { sync = true } = {}) {
    this._stopCelebrate?.();
    this._stopCelebrate = null;
    hideCelebrationOverlay(this.els.celebrate);
    clearTimeout(this._answerTimer);
    clearTimeout(this._dealTimer);
    this.sessionSeed = seed >>> 0 || 1;
    this.roundIndex = 0;
    this.solvedCount = 0;
    this.lock = false;
    this.wrongTries = 0;
    this.usedKeys = [];
    this._loadRound({ sync });
  }

  _loadRound({ sync = true } = {}) {
    this.round = buildPatternRound(deriveSeed(this.sessionSeed, this.roundIndex), this.difficulty, {
      avoidKeys: this.usedKeys,
    });
    if (this.round.key) {
      this.usedKeys.push(this.round.key);
      if (this.usedKeys.length > AVOID_RECENT) this.usedKeys.shift();
    }
    this.lock = false;
    this.wrongTries = 0;
    this._updateProgress();
    this._updateStatus();
    this._render();
    this._playDeal();
    if (sync) this._syncUrl();
  }

  _updateProgress() {
    if (this.els.score) {
      this.els.score.textContent = `Puzzle ${this.roundIndex + 1}`;
    }
  }

  _updateStatus(msg) {
    if (!this.els.status) return;
    if (msg) {
      this.els.status.textContent = msg;
      return;
    }
    this.els.status.textContent = "What comes next in the pattern?";
  }

  _playDeal() {
    const stage = this.els.stage;
    const choices = this.els.choices;
    if (!stage) return;
    if (prefersReducedMotion()) return;
    stage.classList.remove("is-dealing");
    choices?.classList.remove("is-dealing");
    void stage.offsetWidth;
    stage.classList.add("is-dealing");
    choices?.classList.add("is-dealing");
    clearTimeout(this._dealTimer);
    this._dealTimer = setTimeout(() => {
      stage.classList.remove("is-dealing");
      choices?.classList.remove("is-dealing");
    }, DEAL_MS);
  }

  _render() {
    const stage = this.els.stage;
    const choicesHost = this.els.choices;
    if (!stage || !choicesHost || !this.round) return;
    stage.innerHTML = "";
    stage.setAttribute("role", "list");
    stage.setAttribute("aria-label", "Pattern sequence");

    const appendSep = (extraClass = "") => {
      const sep = document.createElement("span");
      sep.className = `pattern-unit-sep${extraClass ? ` ${extraClass}` : ""}`;
      sep.setAttribute("aria-hidden", "true");
      stage.appendChild(sep);
    };

    const appendCell = (text, className = "pattern-item") => {
      const cell = document.createElement("span");
      cell.className = className;
      cell.setAttribute("role", "listitem");
      cell.textContent = text;
      stage.appendChild(cell);
      return cell;
    };

    const groupSizes = this.round.groupSizes;
    if (groupSizes) {
      let idx = 0;
      groupSizes.forEach((size, gi) => {
        if (gi > 0) appendSep();
        for (let i = 0; i < size; i += 1) {
          appendCell(this.round.prompt[idx]);
          idx += 1;
        }
      });
    } else {
      const unitLen = this.round.unitLen || this.round.unit?.length || 2;
      this.round.prompt.forEach((item, i) => {
        if (i > 0 && i % unitLen === 0) appendSep();
        appendCell(item);
      });
    }

    appendSep("pattern-ask-sep");
    const blank = appendCell("?", "pattern-item pattern-item--blank");
    blank.setAttribute("aria-label", "Blank: what comes next?");

    choicesHost.innerHTML = "";
    choicesHost.setAttribute("role", "group");
    choicesHost.setAttribute("aria-label", "Answer choices");
    this.round.choices.forEach((choice, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pattern-choice";
      btn.dataset.index = String(index);
      btn.textContent = choice;
      btn.setAttribute("aria-label", `Choice ${index + 1}`);
      btn.addEventListener("click", () => this._choose(index));
      choicesHost.appendChild(btn);
    });
  }

  _choose(index) {
    if (this.lock || !this.round) return;
    const btn = this.els.choices?.querySelector(`.pattern-choice[data-index="${index}"]`);
    if (!btn || btn.disabled) return;

    const correct = index === this.round.correctIndex;

    if (correct) {
      this.lock = true;
      this._markResolved(index, true);
      playPop();
      this._updateStatus(`Yes! ${this.round.hint || "That's the pattern."}`);
      clearTimeout(this._answerTimer);
      this._answerTimer = setTimeout(() => this._nextAfterAnswer(), ANSWER_PAUSE_MS);
      return;
    }

    this.wrongTries += 1;
    playBonk();
    btn.disabled = true;
    btn.classList.add("is-wrong", "is-shake");
    setTimeout(() => btn.classList.remove("is-shake"), 320);

    if (this.wrongTries >= MAX_WRONG_TRIES) {
      this.lock = true;
      this._markResolved(this.round.correctIndex, false);
      this._updateStatus(`This one! ${this.round.hint || ""}`.trim());
      clearTimeout(this._answerTimer);
      this._answerTimer = setTimeout(() => this._nextAfterAnswer(), REVEAL_PAUSE_MS);
      return;
    }

    const left = MAX_WRONG_TRIES - this.wrongTries;
    this._updateStatus(
      left === 1 ? "Not that one — one more try!" : "Not that one — try another!"
    );
  }

  _markResolved(selectedIndex, wasCorrect) {
    this.els.choices?.querySelectorAll(".pattern-choice").forEach((btn, i) => {
      btn.disabled = true;
      if (i === this.round.correctIndex) btn.classList.add("is-correct");
      if (i === selectedIndex) btn.classList.add("is-selected");
      if (i !== this.round.correctIndex) btn.classList.add("is-dim");
    });
    const blank = this.els.stage?.querySelector(".pattern-item--blank");
    if (blank) {
      blank.textContent = this.round.answer;
      blank.classList.add(wasCorrect ? "is-correct" : "is-reveal");
    }
  }

  _nextAfterAnswer() {
    this.solvedCount += 1;
    this.roundIndex += 1;
    if (this.solvedCount % MILESTONE_EVERY === 0) {
      this._showMilestone(this.solvedCount);
      return;
    }
    this._loadRound();
  }

  _showMilestone(count) {
    this._updateStatus(`Nice — ${count} puzzles done!`);
    this._stopCelebrate?.();
    this._stopCelebrate = celebrate(document.body, 2400);
    showCelebrationOverlay(this.els.celebrate, {
      emoji: "🔁",
      message: count === MILESTONE_EVERY ? "Pattern pro!" : "Keep going!",
      detail: `${count} puzzles done!`,
      hideActions: true,
      autoMs: MILESTONE_MS,
      onAuto: () => {
        this._stopCelebrate?.();
        this._stopCelebrate = null;
        this._loadRound();
      },
    });
  }

  getShareParams() {
    return {
      diff: this.difficulty !== "easy" ? this.difficulty : undefined,
      seed: String(this.sessionSeed),
    };
  }

  _syncUrl() {
    const params = this.getShareParams();
    const { game } = parseGameHash();
    if (game === "pattern") setGameHash("pattern", params);
    return params;
  }

  async _share() {
    const url = buildGameUrl("pattern", this.getShareParams());
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "Pattern Play", text: "What comes next?", url });
        return;
      }
      await copyToClipboard(url);
    } catch (err) {
      if (err?.name === "AbortError") return;
    }
  }
}
