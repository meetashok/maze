/**
 * Odd One Out — find the item that does not belong.
 * Easy: clear category · Medium: closer categories · Hard: same family, one attribute differs
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
const ANSWER_PAUSE_MS = 1000;
const DEAL_MS = 480;

/** Category mode: three from match, one from odd. */
const EASY_SETS = [
  { id: "cars-dog", match: ["🚗", "🚕", "🚙"], odd: ["🐶"], reason: "Dog is not a car" },
  { id: "dogs-car", match: ["🐶", "🐕", "🦮"], odd: ["🚗"], reason: "Car is not a dog" },
  { id: "fruit-plane", match: ["🍎", "🍌", "🍇"], odd: ["✈️"], reason: "Plane is not fruit" },
  { id: "balls-flower", match: ["⚽", "🏀", "🏈"], odd: ["🌹"], reason: "Flower is not a ball" },
  { id: "food-rocket", match: ["🍕", "🍔", "🌭"], odd: ["🚀"], reason: "Rocket is not food" },
  { id: "fish-bike", match: ["🐟", "🐠", "🐡"], odd: ["🚲"], reason: "Bike is not a fish" },
  { id: "birds-truck", match: ["🐦", "🐤", "🐔"], odd: ["🚚"], reason: "Truck is not a bird" },
  { id: "stars-apple", match: ["⭐", "🌟", "✨"], odd: ["🍎"], reason: "Apple is not a star" },
  { id: "trees-cat", match: ["🌳", "🌲", "🌴"], odd: ["🐱"], reason: "Cat is not a tree" },
  { id: "faces-ball", match: ["😀", "😄", "😁"], odd: ["⚽"], reason: "Ball is not a face" },
  { id: "hearts-frog", match: ["❤️", "🧡", "💛"], odd: ["🐸"], reason: "Frog is not a heart" },
  { id: "flowers-car", match: ["🌹", "🌷", "🌻"], odd: ["🚕"], reason: "Car is not a flower" },
];

const MEDIUM_SETS = [
  { id: "fruit-veg", match: ["🍎", "🍌", "🍇"], odd: ["🥕"], reason: "Carrot is a veggie, not a fruit" },
  { id: "veg-fruit", match: ["🥕", "🌽", "🥦"], odd: ["🍓"], reason: "Strawberry is a fruit" },
  { id: "land-water", match: ["🐶", "🐱", "🐻"], odd: ["🐟"], reason: "Fish lives in water" },
  { id: "water-land", match: ["🐟", "🐠", "🐡"], odd: ["🦊"], reason: "Fox is a land animal" },
  { id: "fly-drive", match: ["✈️", "🚁", "🛸"], odd: ["🚗"], reason: "Car drives on the ground" },
  { id: "drive-fly", match: ["🚗", "🚕", "🚌"], odd: ["✈️"], reason: "Plane flies in the sky" },
  { id: "flowers-trees", match: ["🌹", "🌷", "🌺"], odd: ["🌳"], reason: "Tree is not a flower" },
  { id: "balls-instruments", match: ["⚽", "🏀", "🏐"], odd: ["🎸"], reason: "Guitar is an instrument" },
  { id: "sweet-savory", match: ["🍪", "🍩", "🧁"], odd: ["🍕"], reason: "Pizza is not a sweet treat" },
  { id: "cats-dogs", match: ["🐱", "🐈", "🦁"], odd: ["🐶"], reason: "Dog is not a cat-family animal" },
  { id: "dogs-cats", match: ["🐶", "🐕", "🦮"], odd: ["🐱"], reason: "Cat is not a dog" },
  { id: "day-night", match: ["☀️", "🌤️", "🌈"], odd: ["🌙"], reason: "Moon is for night" },
  { id: "cold-hot", match: ["❄️", "⛄", "🧊"], odd: ["🔥"], reason: "Fire is hot, not cold" },
  { id: "books-toys", match: ["📕", "📗", "📘"], odd: ["🧸"], reason: "Teddy is a toy, not a book" },
];

/** Hard: three identical (or near-identical), one differs by one attribute. */
const HARD_SETS = [
  { id: "red-vs-blue", match: ["🔴", "🔴", "🔴"], odd: ["🔵"], reason: "Blue is a different color" },
  { id: "green-vs-yellow", match: ["🟢", "🟢", "🟢"], odd: ["🟡"], reason: "Yellow is a different color" },
  { id: "purple-vs-orange", match: ["🟣", "🟣", "🟣"], odd: ["🟠"], reason: "Orange is a different color" },
  { id: "heart-red-vs-blue", match: ["❤️", "❤️", "❤️"], odd: ["💙"], reason: "Blue heart is a different color" },
  { id: "star-vs-sparkle", match: ["⭐", "⭐", "⭐"], odd: ["✨"], reason: "Sparkles are not the same star" },
  { id: "dog-vs-standing", match: ["🐶", "🐶", "🐶"], odd: ["🐕"], reason: "That dog looks different" },
  { id: "cat-vs-other", match: ["🐱", "🐱", "🐱"], odd: ["🐈"], reason: "That cat looks different" },
  { id: "apple-red-vs-green", match: ["🍎", "🍎", "🍎"], odd: ["🍏"], reason: "Green apple is a different color" },
  { id: "smile-vs-cool", match: ["😀", "😀", "😀"], odd: ["😎"], reason: "Cool face has sunglasses" },
  { id: "circle-vs-square", match: ["⚪", "⚪", "⚪"], odd: ["⬜"], reason: "Square is a different shape" },
  { id: "moon-vs-sun", match: ["🌙", "🌙", "🌙"], odd: ["☀️"], reason: "Sun is not the moon" },
  { id: "bear-vs-panda", match: ["🐻", "🐻", "🐻"], odd: ["🐼"], reason: "Panda is a different bear" },
  { id: "car-vs-taxi", match: ["🚗", "🚗", "🚗"], odd: ["🚕"], reason: "Taxi is a different car" },
  { id: "flower-vs-other", match: ["🌹", "🌹", "🌹"], odd: ["🌻"], reason: "Sunflower looks different" },
];

export const ODD_DIFFICULTY = {
  easy: EASY_SETS,
  medium: MEDIUM_SETS,
  hard: HARD_SETS,
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
function prefersReducedMotion() {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * @param {number} seed
 * @param {string} difficulty
 * @param {{ avoidIds?: string[] }} [opts]
 */
export function buildOddRound(seed, difficulty = "easy", opts = {}) {
  const sets = ODD_DIFFICULTY[difficulty] || ODD_DIFFICULTY.easy;
  const rand = mulberry32(seed >>> 0 || 1);
  const avoid = new Set(opts.avoidIds || []);
  const pool = sets.filter((s) => !avoid.has(s.id));
  const set = pick(pool.length ? pool : sets, rand);
  const matchEmojis = shuffle(set.match, rand).slice(0, 3);
  while (matchEmojis.length < 3) matchEmojis.push(set.match[0]);
  const oddEmoji = pick(set.odd, rand);
  const tiles = shuffle(
    [
      { emoji: matchEmojis[0], isOdd: false },
      { emoji: matchEmojis[1], isOdd: false },
      { emoji: matchEmojis[2], isOdd: false },
      { emoji: oddEmoji, isOdd: true },
    ],
    rand
  );
  return {
    seed: seed >>> 0,
    difficulty,
    id: set.id,
    reason: set.reason,
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
    this.usedIds = [];
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
    clearTimeout(this._dealTimer);
    this.sessionSeed = seed >>> 0 || 1;
    this.roundIndex = 0;
    this.score = 0;
    this.lock = false;
    this.completed = false;
    this.usedIds = [];
    this._loadRound({ sync });
  }

  _loadRound({ sync = true } = {}) {
    this.round = buildOddRound(deriveSeed(this.sessionSeed, this.roundIndex), this.difficulty, {
      avoidIds: this.usedIds,
    });
    if (this.round.id) this.usedIds.push(this.round.id);
    this.lock = false;
    this._updateScore();
    this._updateStatus();
    this._render();
    this._playDeal();
    if (sync) this._syncUrl();
  }

  _updateScore() {
    if (this.els.score) {
      this.els.score.textContent = `Round ${Math.min(this.roundIndex + 1, TOTAL_ROUNDS)} of ${TOTAL_ROUNDS} · Score ${this.score}`;
    }
  }

  _updateStatus(msg) {
    if (!this.els.status) return;
    if (msg) {
      this.els.status.textContent = msg;
      return;
    }
    this.els.status.textContent = this.completed
      ? "You spotted them all!"
      : "Tap the one that does not belong";
  }

  _playDeal() {
    const stage = this.els.stage;
    if (!stage) return;
    if (prefersReducedMotion()) return;
    stage.classList.remove("is-dealing");
    void stage.offsetWidth;
    stage.classList.add("is-dealing");
    clearTimeout(this._dealTimer);
    this._dealTimer = setTimeout(() => stage.classList.remove("is-dealing"), DEAL_MS);
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
      btn.style.setProperty("--deal-delay", `${index * 40}ms`);
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
    const why = this.round.reason || "";
    if (correct) {
      this.score += 1;
      playPop();
      this._updateScore();
      this._updateStatus(why ? `You found it! ${why}.` : "You found it!");
    } else {
      playBonk();
      this._updateStatus(why ? `Not that one. ${why}.` : "Not that one — next round!");
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
      emoji: "🎯",
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
