/**
 * Odd One Out — find the item that does not belong.
 * One mixed bank: clear category mismatches, closer categories, and spot-the-difference.
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
  getLifetimeCount,
  bumpLifetimeCount,
  LIFETIME_ODD_KEY,
} from "./common.js";

const MILESTONE_EVERY = 5;
const MILESTONE_MS = 1600;
const AVOID_RECENT = 12;
const ANSWER_PAUSE_MS = 480;
const REVEAL_PAUSE_MS = 1100;
const DEAL_MS = 480;
const MAX_WRONG_TRIES = 3;

/** All puzzle faces in one pool (formerly easy / medium / hard). */
export const ODD_SETS = [
  // Clear category mismatches
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
  { id: "hats-fish", match: ["🎩", "🧢", "👒"], odd: ["🐟"], reason: "Fish is not a hat" },
  { id: "shoes-banana", match: ["👟", "👠", "🥾"], odd: ["🍌"], reason: "Banana is not a shoe" },
  { id: "bugs-boat", match: ["🦋", "🐝", "🐞"], odd: ["⛵"], reason: "Boat is not a bug" },
  { id: "instruments-apple", match: ["🎸", "🎺", "🥁"], odd: ["🍎"], reason: "Apple is not an instrument" },
  { id: "weather-dog", match: ["☀️", "🌧️", "❄️"], odd: ["🐶"], reason: "Dog is not weather" },
  { id: "toys-tree", match: ["🧸", "🪀", "🎮"], odd: ["🌳"], reason: "Tree is not a toy" },
  { id: "sea-car", match: ["🐙", "🦀", "🐬"], odd: ["🚗"], reason: "Car is not a sea creature" },
  { id: "veggies-star", match: ["🥕", "🌽", "🥦"], odd: ["⭐"], reason: "Star is not a veggie" },
  { id: "clocks-frog", match: ["⏰", "🕰️", "⌚"], odd: ["🐸"], reason: "Frog is not a clock" },
  { id: "moons-pizza", match: ["🌙", "🌛", "🌜"], odd: ["🍕"], reason: "Pizza is not a moon" },
  // Closer category contrasts
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
  { id: "insects-birds", match: ["🐝", "🐞", "🦋"], odd: ["🐦"], reason: "Bird is not an insect" },
  { id: "birds-insects", match: ["🐦", "🐤", "🦉"], odd: ["🐝"], reason: "Bee is an insect, not a bird" },
  { id: "drink-food", match: ["🥛", "🧃", "☕"], odd: ["🍕"], reason: "Pizza is food, not a drink" },
  { id: "food-drink", match: ["🍕", "🍔", "🌮"], odd: ["🥛"], reason: "Milk is a drink" },
  { id: "winter-summer", match: ["🧤", "🧣", "🧥"], odd: ["🩳"], reason: "Shorts are for warm weather" },
  { id: "summer-winter", match: ["🩳", "🕶️", "🩴"], odd: ["🧤"], reason: "Gloves are for cold weather" },
  { id: "circle-shapes", match: ["⚪", "🔴", "🟡"], odd: ["🔺"], reason: "Triangle is not a circle" },
  { id: "tools-toys", match: ["🔨", "🔧", "🪚"], odd: ["🧸"], reason: "Teddy is a toy, not a tool" },
  { id: "space-earth", match: ["🚀", "🛸", "🛰️"], odd: ["🌳"], reason: "Tree is on Earth, not in space" },
  { id: "music-sports", match: ["🎵", "🎶", "🎼"], odd: ["⚽"], reason: "Ball is sports, not music" },
  // Spot-the-difference (same item, one attribute)
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
  { id: "fish-vs-blowfish", match: ["🐟", "🐟", "🐟"], odd: ["🐡"], reason: "That fish looks different" },
  { id: "tree-vs-palm", match: ["🌳", "🌳", "🌳"], odd: ["🌴"], reason: "Palm tree looks different" },
  { id: "book-vs-open", match: ["📕", "📕", "📕"], odd: ["📖"], reason: "That book is open" },
  { id: "ball-vs-other", match: ["⚽", "⚽", "⚽"], odd: ["🏀"], reason: "Basketball is a different ball" },
  { id: "cloud-vs-rain", match: ["☁️", "☁️", "☁️"], odd: ["🌧️"], reason: "That cloud is raining" },
  { id: "phone-vs-old", match: ["📱", "📱", "📱"], odd: ["☎️"], reason: "That phone looks different" },
  { id: "cookie-vs-donut", match: ["🍪", "🍪", "🍪"], odd: ["🍩"], reason: "Donut is not a cookie" },
  { id: "hand-vs-point", match: ["✋", "✋", "✋"], odd: ["👉"], reason: "That hand is pointing" },
];

/** @deprecated Use ODD_SETS — kept so older imports keep working. */
export const ODD_DIFFICULTY = { all: ODD_SETS };

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
 * Pure round builder. Optional `avoidIds` skips recently used faces.
 * Second arg used to be a difficulty string; it is ignored (mixed bank).
 * @param {number} seed
 * @param {string | { avoidIds?: string[] }} [difficultyOrOpts]
 * @param {{ avoidIds?: string[] }} [opts]
 */
export function buildOddRound(seed, difficultyOrOpts = {}, opts = {}) {
  const options =
    difficultyOrOpts && typeof difficultyOrOpts === "object" && !Array.isArray(difficultyOrOpts)
      ? difficultyOrOpts
      : opts;
  const sets = ODD_SETS;
  const rand = mulberry32(seed >>> 0 || 1);
  const avoid = new Set(options.avoidIds || []);
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
    id: set.id,
    reason: set.reason,
    tiles,
    oddIndex: tiles.findIndex((t) => t.isOdd),
  };
}

export class OddApp {
  constructor() {
    this.sessionSeed = 1;
    this.roundIndex = 0;
    this.lifetimeCount = 0;
    this.wrongTries = 0;
    this.round = null;
    this.lock = false;
    this.usedIds = [];
    this._stopCelebrate = null;
    this._answerTimer = 0;
    this._dealTimer = 0;
    this.els = {};
  }

  async init() {
    this._cacheEls();
    this.lifetimeCount = getLifetimeCount(LIFETIME_ODD_KEY);
    const { game, params } = parseGameHash();
    if (game === "odd") this.onHashChange(params);
    else this._start({ sync: false });
  }

  _cacheEls() {
    const $ = (id) => document.getElementById(id);
    this.els = {
      stage: $("odd-stage"),
      status: $("odd-status"),
      celebrate: $("odd-celebrate"),
      score: $("odd-score"),
    };
  }

  onHashChange(params) {
    if (!(params instanceof URLSearchParams)) params = new URLSearchParams(params || "");
    const seedRaw = parseInt(params.get("seed"), 10);
    const seed =
      Number.isFinite(seedRaw) && seedRaw > 0 ? seedRaw >>> 0 : (Math.random() * 0xffffffff) >>> 0;
    this._setupSession(seed);
  }

  _start({ sync = true } = {}) {
    this._setupSession((Math.random() * 0xffffffff) >>> 0, { sync });
  }

  _setupSession(seed, { sync = true } = {}) {
    this._stopCelebrate?.();
    this._stopCelebrate = null;
    hideCelebrationOverlay(this.els.celebrate);
    clearTimeout(this._answerTimer);
    clearTimeout(this._dealTimer);
    this.sessionSeed = seed >>> 0 || 1;
    this.roundIndex = 0;
    this.wrongTries = 0;
    this.lock = false;
    this.usedIds = [];
    this.lifetimeCount = getLifetimeCount(LIFETIME_ODD_KEY);
    this._loadRound({ sync });
  }

  _loadRound({ sync = true } = {}) {
    this.round = buildOddRound(deriveSeed(this.sessionSeed, this.roundIndex), {
      avoidIds: this.usedIds,
    });
    if (this.round.id) {
      this.usedIds.push(this.round.id);
      if (this.usedIds.length > AVOID_RECENT) this.usedIds.shift();
    }
    this.wrongTries = 0;
    this.lock = false;
    this._updateProgress();
    this._updateStatus();
    this._render();
    this._playDeal();
    if (sync) this._syncUrl();
  }

  _updateProgress() {
    if (!this.els.score) return;
    const n = this.lifetimeCount;
    this.els.score.textContent = n === 1 ? "1 puzzle done" : `${n} puzzles done`;
  }

  _updateStatus(msg) {
    if (!this.els.status) return;
    if (msg) {
      this.els.status.textContent = msg;
      return;
    }
    this.els.status.textContent = "Tap the one that does not belong";
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
    if (this.lock || !this.round) return;
    const btn = this.els.stage?.querySelector(`.odd-tile[data-index="${index}"]`);
    if (!btn || btn.disabled) return;

    const correct = this.round.tiles[index]?.isOdd;
    const why = this.round.reason || "";

    if (correct) {
      this.lock = true;
      this._markResolved(index, { celebrate: true });
      playPop();
      this._updateStatus(why ? `You found it! ${why}.` : "You found it!");
      clearTimeout(this._answerTimer);
      this._answerTimer = setTimeout(() => this._nextAfterAnswer(), ANSWER_PAUSE_MS);
      return;
    }

    // Wrong: soft feedback, keep trying (disable only this tile).
    this.wrongTries += 1;
    playBonk();
    btn.disabled = true;
    btn.classList.add("is-wrong", "is-shake");
    setTimeout(() => btn.classList.remove("is-shake"), 320);

    if (this.wrongTries >= MAX_WRONG_TRIES) {
      this.lock = true;
      this._markResolved(this.round.oddIndex, { celebrate: true });
      this._updateStatus(why ? `This one! ${why}.` : "This is the odd one!");
      clearTimeout(this._answerTimer);
      this._answerTimer = setTimeout(() => this._nextAfterAnswer(), REVEAL_PAUSE_MS);
      return;
    }

    const left = MAX_WRONG_TRIES - this.wrongTries;
    this._updateStatus(
      left === 1 ? "Not that one — one more try!" : "Not that one — try another!"
    );
  }

  _markResolved(selectedIndex, { celebrate: doCelebrate = false } = {}) {
    this.els.stage?.querySelectorAll(".odd-tile").forEach((btn, i) => {
      btn.disabled = true;
      if (this.round.tiles[i].isOdd) {
        btn.classList.add("is-correct");
        if (doCelebrate) btn.classList.add("is-pop");
      } else {
        btn.classList.add("is-dim");
      }
      if (i === selectedIndex) btn.classList.add("is-selected");
    });
  }

  _nextAfterAnswer() {
    this.roundIndex += 1;
    this.lifetimeCount = bumpLifetimeCount(LIFETIME_ODD_KEY);
    this._updateProgress();
    if (this.lifetimeCount % MILESTONE_EVERY === 0) {
      this._showMilestone(this.lifetimeCount);
      return;
    }
    this._loadRound();
  }

  _showMilestone(count) {
    this._updateStatus(`Nice — ${count} puzzles done!`);
    this._stopCelebrate?.();
    this._stopCelebrate = celebrate(document.body, 2000);
    showCelebrationOverlay(this.els.celebrate, {
      emoji: "🎯",
      message: count === MILESTONE_EVERY ? "Great start!" : "Keep going!",
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
