/**
 * Pattern Play — what comes next in an emoji sequence.
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

const TOTAL_ROUNDS = 5;
const ANSWER_PAUSE_MS = 700;
const COLORS = ["🔴", "🔵", "🟢", "🟡", "🟠", "🟣"];
const SHAPES = ["⭐", "🌙", "☀️", "❤️", "💎", "🔺"];
const ANIMALS = ["🐶", "🐱", "🐻", "🐸", "🦊", "🐼"];
const FRUITS = ["🍎", "🍌", "🍇", "🍊", "🍓", "🍑"];
const ALL = [...COLORS, ...SHAPES, ...ANIMALS, ...FRUITS];

export const PATTERN_DIFFICULTY = {
  easy: { types: ["alternate", "repeat"], length: 4 },
  medium: { types: ["alternate", "repeat", "aba"], length: 5 },
  hard: { types: ["aba", "abab", "grow", "repeat"], length: 5 },
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
function twoDistinct(pool, rand) {
  const a = pick(pool, rand);
  let b = pick(pool, rand);
  while (b === a) b = pick(pool, rand);
  return [a, b];
}
function buildChoices(answer, distractors, rand) {
  const unique = [answer, ...distractors.filter((d) => d !== answer)];
  while (unique.length < 3) {
    const extra = pick(ALL, rand);
    if (!unique.includes(extra)) unique.push(extra);
  }
  const choices = shuffle(unique.slice(0, 3), rand);
  return { choices, correctIndex: choices.indexOf(answer) };
}

function makeAlternate(rand, length) {
  const [a, b] = twoDistinct(COLORS, rand);
  const prompt = Array.from({ length: length - 1 }, (_, i) => (i % 2 === 0 ? a : b));
  const answer = (length - 1) % 2 === 0 ? a : b;
  return { type: "alternate", prompt, answer, ...buildChoices(answer, [b, COLORS[0]], rand) };
}

function makeRepeat(rand, length) {
  const pool = pick([SHAPES, ANIMALS, FRUITS], rand);
  const unitLen = length <= 4 ? 2 : 2 + randInt(rand, 2);
  const unit = [];
  for (let i = 0; i < unitLen; i++) {
    let next = pick(pool, rand);
    while (unit.includes(next)) next = pick(pool, rand);
    unit.push(next);
  }
  const prompt = Array.from({ length: length - 1 }, (_, i) => unit[i % unitLen]);
  const answer = unit[(length - 1) % unitLen];
  return {
    type: "repeat",
    prompt,
    answer,
    ...buildChoices(answer, pool.filter((x) => x !== answer).slice(0, 2), rand),
  };
}

function makeAba(rand, length, abab) {
  const pool = pick([ANIMALS, FRUITS, SHAPES], rand);
  const [a, b] = twoDistinct(pool, rand);
  const cycle = abab ? [a, b] : [a, b, a];
  const prompt = Array.from({ length: length - 1 }, (_, i) => cycle[i % cycle.length]);
  const answer = cycle[(length - 1) % cycle.length];
  return {
    type: abab ? "abab" : "aba",
    prompt,
    answer,
    ...buildChoices(answer, [a, b, pick(pool, rand)], rand),
  };
}

function makeGrow(rand, length) {
  const emoji = pick(SHAPES, rand);
  const prompt = Array.from({ length: length - 1 }, (_, i) => emoji.repeat(1 + i));
  const answer = emoji.repeat(length);
  return {
    type: "grow",
    prompt,
    answer,
    ...buildChoices(answer, [emoji.repeat(length + 1), emoji.repeat(Math.max(1, length - 1))], rand),
  };
}

/** Pure / DOM-free round for smoke tests. */
export function buildPatternRound(seed, difficulty = "easy") {
  const diff = PATTERN_DIFFICULTY[difficulty] || PATTERN_DIFFICULTY.easy;
  const rand = mulberry32(seed >>> 0 || 1);
  const type = pick(diff.types, rand);
  const length = diff.length;
  let round;
  if (type === "alternate") round = makeAlternate(rand, length);
  else if (type === "repeat") round = makeRepeat(rand, length);
  else if (type === "grow") round = makeGrow(rand, length);
  else if (type === "abab") round = makeAba(rand, length, true);
  else round = makeAba(rand, length, false);
  return { seed: seed >>> 0, difficulty, ...round };
}

export class PatternApp {
  constructor() {
    this.difficulty = "easy";
    this.sessionSeed = 1;
    this.roundIndex = 0;
    this.score = 0;
    this.round = null;
    this.lock = false;
    this.completed = false;
    this._stopCelebrate = null;
    this._answerTimer = 0;
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
    this.sessionSeed = seed >>> 0 || 1;
    this.roundIndex = 0;
    this.score = 0;
    this.lock = false;
    this.completed = false;
    this._loadRound({ sync });
  }

  _loadRound({ sync = true } = {}) {
    this.round = buildPatternRound(deriveSeed(this.sessionSeed, this.roundIndex), this.difficulty);
    this.lock = false;
    this._updateScore();
    this._updateStatus();
    this._render();
    if (sync) this._syncUrl();
  }

  _updateScore() {
    if (this.els.score) this.els.score.textContent = `Score: ${this.score}/${TOTAL_ROUNDS}`;
  }

  _updateStatus(msg) {
    if (!this.els.status) return;
    if (msg) {
      this.els.status.textContent = msg;
      return;
    }
    this.els.status.textContent = this.completed
      ? "You finished all the patterns!"
      : `Round ${this.roundIndex + 1} of ${TOTAL_ROUNDS} — What comes next?`;
  }

  _render() {
    const stage = this.els.stage;
    const choicesHost = this.els.choices;
    if (!stage || !choicesHost || !this.round) return;
    stage.innerHTML = "";
    stage.setAttribute("role", "list");
    stage.setAttribute("aria-label", "Pattern sequence");
    for (const item of this.round.prompt) {
      const cell = document.createElement("span");
      cell.className = "pattern-item";
      cell.setAttribute("role", "listitem");
      cell.textContent = item;
      stage.appendChild(cell);
    }
    const blank = document.createElement("span");
    blank.className = "pattern-item pattern-item--blank";
    blank.setAttribute("role", "listitem");
    blank.setAttribute("aria-label", "Blank: what comes next?");
    blank.textContent = "?";
    stage.appendChild(blank);

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
    if (this.lock || this.completed || !this.round) return;
    this.lock = true;
    const correct = index === this.round.correctIndex;
    this.els.choices?.querySelectorAll(".pattern-choice").forEach((btn, i) => {
      btn.disabled = true;
      if (i === this.round.correctIndex) btn.classList.add("is-correct");
      if (i === index && !correct) btn.classList.add("is-wrong");
      if (i === index) btn.classList.add("is-selected");
    });
    const blank = this.els.stage?.querySelector(".pattern-item--blank");
    if (blank) {
      blank.textContent = this.round.answer;
      blank.classList.add(correct ? "is-correct" : "is-reveal");
    }
    if (correct) {
      this.score += 1;
      playPop();
      this._updateScore();
      this._updateStatus("Nice! That's right!");
    } else {
      playBonk();
      this._updateStatus("Oops — try the next one!");
    }
    clearTimeout(this._answerTimer);
    this._answerTimer = setTimeout(() => this._nextAfterAnswer(), ANSWER_PAUSE_MS);
  }

  _nextAfterAnswer() {
    if (this.roundIndex + 1 >= TOTAL_ROUNDS) {
      this._onComplete();
      return;
    }
    this.roundIndex += 1;
    this._loadRound();
  }

  _onComplete() {
    this.completed = true;
    this._updateStatus();
    this._stopCelebrate = celebrate(document.body, 3200);
    showCelebrationOverlay(this.els.celebrate, {
      emoji: "🧩",
      message: "Pattern master!",
      detail: `Score: ${this.score}/${TOTAL_ROUNDS} · ${this.difficulty}`,
      againLabel: "Play Again",
      newLabel: "New Patterns",
      onAgain: () => this._restart(),
      onNew: () => this._newGame(),
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
