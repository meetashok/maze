/**
 * Seeded PRNG, URL params, daily seed, and localStorage helpers.
 */

export function mulberry32(seed) {
  let t = seed >>> 0;
  return function next() {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function randomSeed() {
  return (Math.floor(Math.random() * 0xffffffff) >>> 0) || 1;
}

export function todayDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Deterministic daily seed from local YYYY-MM-DD. */
export function dailySeed(date = new Date()) {
  return hashString(`daily-maze:${todayDateString(date)}`);
}

export const DAILY_SIZE = 8;

export const DEFAULT_START = "🐸";
export const DEFAULT_END = "⭐";

export function difficultyLabel(size) {
  if (size <= 6) return "Easy";
  if (size <= 10) return "Medium";
  if (size <= 14) return "Hard";
  return "Expert";
}

export function parseUrlParams(search = window.location.search) {
  const params = new URLSearchParams(search);
  const sizeRaw = parseInt(params.get("size"), 10);
  const seedRaw = parseInt(params.get("seed"), 10);
  const start = params.get("start") || DEFAULT_START;
  const end = params.get("end") || DEFAULT_END;
  const daily = params.get("daily") === "1";

  const size =
    Number.isFinite(sizeRaw) && sizeRaw >= 4 && sizeRaw <= 20 ? sizeRaw : null;
  const seed = Number.isFinite(seedRaw) && seedRaw > 0 ? seedRaw >>> 0 : null;

  return { size, seed, start, end, daily };
}

export function buildShareUrl({ size, seed, start, end, daily = false }) {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("size", String(size));
  url.searchParams.set("seed", String(seed >>> 0));
  url.searchParams.set("start", start);
  url.searchParams.set("end", end);
  if (daily) url.searchParams.set("daily", "1");
  return url.toString();
}

export async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}

const PB_KEY = "maze-personal-bests";

export function loadPersonalBests() {
  try {
    const raw = localStorage.getItem(PB_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

export function getPersonalBest(size) {
  const all = loadPersonalBests();
  const v = all[String(size)];
  return typeof v === "number" && v > 0 ? v : null;
}

export function savePersonalBest(size, ms) {
  const all = loadPersonalBests();
  const key = String(size);
  const prev = all[key];
  if (typeof prev === "number" && prev > 0 && ms >= prev) {
    return { best: prev, isNew: false };
  }
  all[key] = ms;
  localStorage.setItem(PB_KEY, JSON.stringify(all));
  return { best: ms, isNew: true };
}

export function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const tenths = Math.floor((ms % 1000) / 100);
  return `${m}:${String(s).padStart(2, "0")}.${tenths}`;
}

export function deriveSeed(baseSeed, index) {
  return (hashString(`${baseSeed >>> 0}:${index}`) >>> 0) || 1;
}
