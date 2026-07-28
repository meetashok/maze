/**
 * Maze-specific URL helpers and personal bests.
 * Shared utilities live in common.js.
 */

import {
  mulberry32,
  hashString,
  randomSeed,
  todayDateString,
  dailySeed,
  formatTime,
  copyToClipboard,
  deriveSeed,
  loadStore,
  getStoredBest,
  saveStoredBest,
  buildGameUrl,
} from "./common.js";

export {
  mulberry32,
  hashString,
  randomSeed,
  todayDateString,
  dailySeed,
  formatTime,
  copyToClipboard,
  deriveSeed,
};

export const DAILY_SIZE = 8;
export const DAILY_DETOUR = 2;

export const DEFAULT_START = "🐸";
export const DEFAULT_END = "🐛";

export function difficultyLabel(size) {
  if (size <= 6) return "Easy";
  if (size <= 10) return "Medium";
  if (size <= 14) return "Hard";
  return "Expert";
}

export function detourLabel(detour) {
  const labels = ["Simple", "Branchy", "Tricky", "Expert"];
  const d = Math.max(0, Math.min(3, detour | 0));
  return labels[d];
}

export function parseUrlParams(search = window.location.search) {
  const params = new URLSearchParams(search);
  const sizeRaw = parseInt(params.get("size"), 10);
  const seedRaw = parseInt(params.get("seed"), 10);
  const detourRaw = parseInt(params.get("detour"), 10);
  const start = params.get("start") || DEFAULT_START;
  const end = params.get("end") || DEFAULT_END;
  const daily = params.get("daily") === "1";

  const size =
    Number.isFinite(sizeRaw) && sizeRaw >= 4 && sizeRaw <= 20 ? sizeRaw : null;
  const seed = Number.isFinite(seedRaw) && seedRaw > 0 ? seedRaw >>> 0 : null;
  const detour =
    Number.isFinite(detourRaw) && detourRaw >= 0 && detourRaw <= 3
      ? detourRaw
      : null;

  return { size, seed, detour, start, end, daily };
}

export function buildShareUrl({ size, seed, start, end, daily = false, detour = 1 }) {
  return buildGameUrl("mazes", {
    size: String(size),
    seed: String(seed >>> 0),
    start,
    end,
    detour: detour !== 1 ? String(detour) : undefined,
    daily: daily ? "1" : undefined,
  });
}

const PB_KEY = "maze-personal-bests";

export function loadPersonalBests() {
  return loadStore(PB_KEY);
}

export function getPersonalBest(size) {
  return getStoredBest(PB_KEY, String(size));
}

export function savePersonalBest(size, ms) {
  return saveStoredBest(PB_KEY, String(size), ms);
}
