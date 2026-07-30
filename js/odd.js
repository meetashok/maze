/**
 * Odd One Out — tap the emoji that doesn't belong.
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

const EASY_SETS = [
  { match: ["🐶", "🐕", "🐩"], odd: ["🐱", "🐈", "🦁"] },
  { match: ["🍎", "🍏", "🍐"], odd: ["🚗", "🚕", "🚙"] },
  { match: ["⭐", "🌟", "✨"], odd: ["🐟", "🐠", "🐡"] },
  { match: ["🚗", "🚕", "🚙"], odd: ["🐶", "🐱", "🐻"] },
  { match: ["🏀", "⚽", "🏈"], odd: ["🌹", "🌷", "🌻"] },
  { match: ["🍕", "🍔", "🌭"], odd: ["✈️", "🚀", "🛸"] },
];

const MEDIUM_SETS = [
  { match: ["🐶", "🐕", "🦮"], odd: ["🐱", "🐈", "🦁"] },
  { match: ["🍎", "🍏", "🍒"], odd: ["🍌", "🍋", "🌽"] },
  { match: ["🌹", "🌷", "🌺"], odd: ["🌳", "🌲", "🌴"] },
  { match: ["🐟", "🐠", "🐡"], odd: ["🐦", "🐤", "🐔"] },
  { match: ["⚽", "🏀", "🏐"], odd: ["🎸", "🎹", "🥁"] },
  { match: ["🚗", "🚕", "🏎️"], odd: ["🚲", "🛴", "🛹"] },
];

const HARD_SETS = [
  { match: ["🔴", "🔴", "🔴"], odd: ["🟠", "🟡", "🟣"] },
  { match: ["🔵", "🔵", "🔵"], odd: ["🟢", "🩵", "🟣"] },
  { match: ["🐶", "🐶", "🐶"], odd: ["🐕", "🐩", "🐺"] },
  { match: ["🍎", "🍎", "🍎"], odd: ["🍏", "🍒", "🍓"] },
  { match: ["⭐", "⭐", "⭐"], odd: ["🌟", "✨", "💫"] },
  { match: ["😀", "😀", "😀"], odd: ["😎", "🤓", "🧐"] },
  { match: ["❤️", "❤️", "❤️"], odd: ["🧡", "💛", "💙"] },
  { match: ["🐱", "🐱", "🐱"], odd: ["🐈", "🦁", "🐯"] },
];

export const ODD_DIFFICULTY = { easy: EASY_SETS, medium: MEDIUM_SETS, hard: HARD_SETS };

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

/** Pure / DOM-free round for smoke tests. */
export function buildOddRound(seed, difficulty = "easy") {
  const sets = ODD_DIFFICULTY[difficulty] || ODD_DIFFICULTY.easy;
  const rand = mulberry32(seed >>> 0 || 1);
  const set = pick(sets, rand);
  const matchEmojis = shuffle(set.match, rand).slice(0, 3);
  while (matchEmojis.length < 3) matchEmojis.push(set.match[0]);
  const tiles = shuffle(
    [
      { emoji: matchEmojis[0], isOdd: false },
      { emoji: matchEmojis[1], isOdd: false },
      { emoji: matchEmojis[2], isOdd: false },
      { emoji: pick(set.odd, rand), isOdd: true },
    ],
    rand
  );
  return {
    seed: seed >>> 0,
    difficulty,
    tiles,
    oddIndex: tiles.findIndex((t) => t.isOdd),
  };
}

export class OddApp {
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
    if (game === "odd") this.onHashChange(params);
    else this._newGame({ sync: false });
  }

  _cacheEls() {
    const $ = (id) => document.getElementById(id);
    this.els = {
      stage: $("odd-stage"),
      status: $("odd-status"),
      btnNew: $("odd-btn-new"),
      btnReset: $("odd-btn-reset"),
      difficulty: $("odd-difficulty"),
      celebrate: $("odd-celebrate"),
      score: $("odd-score"),
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
    if (diff && ODD_DIFFICULTY[diff]) this.difficulty = diff;
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
    this.round = buildOddRound(deriveSeed(this.sessionSeed, this.roundIndex), this.difficulty);
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
      ? "You spotted them all!"
      : `Round ${this.roundIndex + 1} of ${TOTAL_ROUNDS} — Tap the odd one out!`;
  }

  _render() {
    const stage = this.els.stage;
    if (!stage || !this.round) return;
    stage.innerHTML = "";
    stage.setAttribute("role", "group");
    stage.setAttribute("aria-label", "Odd one out tiles");
    this.round.tiles.forEach((tile, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "odd-tile";
      btn.dataset.index = String(index);
      btn.textContent = tile.emoji;
      btn.setAttribute("aria-label", `Tile ${index + 1}`);
      btn.addEventListener("click", () => this._choose(index));
      stage.appendChild(btn);
    });
  }

  _choose(index) {
    if (this.lock || this.completed || !this.round) return;
    this.lock = true;
    const correct = this.round.tiles[index]?.isOdd;
    this.els.stage?.querySelectorAll(".odd-tile").forEach((btn, i) => {
      btn.disabled = true;
      if (this.round.tiles[i].isOdd) btn.classList.add("is-correct");
      if (i === index) btn.classList.add("is-selected");
      if (i === index && !correct) btn.classList.add("is-wrong");
    });
    if (correct) {
      this.score += 1;
      playPop();
      this._updateScore();
      this._updateStatus("You found it!");
    } else {
      playBonk();
      this._updateStatus("Not that one — look again next round!");
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
      emoji: "👀",
      message: "Sharp eyes!",
      detail: `Score: ${this.score}/${TOTAL_ROUNDS} · ${this.difficulty}`,
      againLabel: "Play Again",
      newLabel: "New Game",
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
    if (game === "odd") setGameHash("odd", params);
    return params;
  }

  async _share() {
    const url = buildGameUrl("odd", this.getShareParams());
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "Odd One Out", text: "Find the odd one!", url });
        return;
      }
      await copyToClipboard(url);
    } catch (err) {
      if (err?.name === "AbortError") return;
    }
  }
}
