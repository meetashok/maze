/**
 * Shared utilities for the game hub: PRNG, timer, hash routing, storage.
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

export function dailySeed(date = new Date()) {
  return hashString(`daily-maze:${todayDateString(date)}`);
}

export function dailyDotsSeed(date = new Date()) {
  return hashString(`daily-dots:${todayDateString(date)}`);
}

export function dailyTraceSeed(date = new Date()) {
  return hashString(`daily-trace:${todayDateString(date)}`);
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

/** Path segment for each internal game id (URLs users see). */
export const GAME_PATHS = {
  mazes: "maze",
  dots: "connect",
  trace: "trace",
};

/** Map URL path segments (and legacy names) → internal game id. */
export const PATH_TO_GAME = {
  maze: "mazes",
  mazes: "mazes",
  connect: "dots",
  dots: "dots",
  trace: "trace",
};

/**
 * Resolve site base + active game from the location.
 * Handles GitHub project pages (/&lt;repo&gt;/connect) where the repo may be named "maze".
 */
export function resolveLocation() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  const isGhProject = /\.github\.io$/i.test(window.location.hostname) && parts.length >= 1;

  if (isGhProject) {
    const repo = parts[0];
    const rest = parts.slice(1);
    let gameSeg = null;
    if (rest.length && PATH_TO_GAME[rest[rest.length - 1]]) {
      gameSeg = rest[rest.length - 1];
    }
    return {
      base: `/${repo}/`,
      game: gameSeg ? PATH_TO_GAME[gameSeg] : "mazes",
    };
  }

  let gameSeg = null;
  const copy = [...parts];
  if (copy.length && PATH_TO_GAME[copy[copy.length - 1]]) {
    gameSeg = copy.pop();
  } else if (copy.length && /\.html?$/i.test(copy[copy.length - 1])) {
    copy.pop();
  }
  return {
    base: copy.length ? `/${copy.join("/")}/` : "/",
    game: gameSeg ? PATH_TO_GAME[gameSeg] : "mazes",
  };
}

/** Site base path, e.g. "/" or "/maze/" for project GitHub Pages. */
export function getBasePath() {
  if (typeof window !== "undefined" && window.__PUZZLE_BASE__) {
    return window.__PUZZLE_BASE__;
  }
  return resolveLocation().base;
}

function paramsFromObject(params = {}) {
  const sp = new URLSearchParams();
  if (params instanceof URLSearchParams) {
    for (const [k, v] of params.entries()) {
      if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
    }
    return sp;
  }
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  return sp;
}

/**
 * Read the active game from the path (/maze, /connect, /trace).
 * Legacy hash routes (#mazes, #dots?pic=…) are still recognized.
 * @returns {{ game: string, params: URLSearchParams, legacyHash: boolean }}
 */
export function parseGameRoute() {
  const raw = (window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash
  ).trim();
  if (raw) {
    const q = raw.indexOf("?");
    const seg = (q === -1 ? raw : raw.slice(0, q)).trim();
    if (PATH_TO_GAME[seg]) {
      const merged = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(q === -1 ? "" : raw.slice(q + 1));
      for (const [k, v] of hashParams.entries()) merged.set(k, v);
      return { game: PATH_TO_GAME[seg], params: merged, legacyHash: true };
    }
  }

  const { game } = resolveLocation();
  return {
    game,
    params: new URLSearchParams(window.location.search),
    legacyHash: false,
  };
}

/** @deprecated Use parseGameRoute — kept as an alias for older call sites. */
export function parseGameHash() {
  const { game, params } = parseGameRoute();
  return { game, params };
}

export function buildGameUrl(game, params = {}) {
  const base = getBasePath();
  const seg = GAME_PATHS[game] || "maze";
  const sp = paramsFromObject(params);
  const q = sp.toString();
  const path = `${base}${seg}${q ? `?${q}` : ""}`;
  return new URL(path, window.location.origin).toString();
}

export function setGameRoute(game, params = {}, replace = true) {
  const base = getBasePath();
  const seg = GAME_PATHS[game] || "maze";
  const sp = paramsFromObject(params);
  const q = sp.toString();
  const url = `${base}${seg}${q ? `?${q}` : ""}`;
  if (replace) history.replaceState(null, "", url);
  else history.pushState(null, "", url);
}

/** @deprecated Use setGameRoute — kept as an alias for older call sites. */
export function setGameHash(game, params = {}, replace = true) {
  setGameRoute(game, params, replace);
}

export class GameTimer {
  constructor(onTick) {
    this.ms = 0;
    this.running = false;
    this._start = 0;
    this._raf = 0;
    this.onTick = onTick;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._start = performance.now() - this.ms;
    const tick = () => {
      if (!this.running) return;
      this.ms = performance.now() - this._start;
      this.onTick?.(this.ms);
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  stop(keepDisplay = true) {
    this.running = false;
    cancelAnimationFrame(this._raf);
    if (!keepDisplay) this.ms = 0;
    this.onTick?.(this.ms);
  }

  reset() {
    this.stop(false);
    this.ms = 0;
    this.onTick?.(0);
  }
}

export function loadStore(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

export function getStoredBest(key, field) {
  const all = loadStore(key);
  const v = all[field];
  return typeof v === "number" && v > 0 ? v : null;
}

export function saveStoredBest(key, field, ms) {
  const all = loadStore(key);
  const prev = all[field];
  if (typeof prev === "number" && prev > 0 && ms >= prev) {
    return { best: prev, isNew: false };
  }
  all[field] = ms;
  localStorage.setItem(key, JSON.stringify(all));
  return { best: ms, isNew: true };
}

export const THEME_KEY = "maze-theme";
export const THEME_LIGHT = "light";
export const THEME_DARK = "dark";

export function initTheme(toggleEl, onThemeChange) {
  const saved = localStorage.getItem(THEME_KEY);
  const theme = saved === THEME_DARK ? THEME_DARK : THEME_LIGHT;
  applyTheme(theme, onThemeChange);
  if (!toggleEl) return;
  toggleEl.checked = theme === THEME_LIGHT;
  const onToggle = () => {
    const next = toggleEl.checked ? THEME_LIGHT : THEME_DARK;
    applyTheme(next, onThemeChange);
    localStorage.setItem(THEME_KEY, next);
  };
  toggleEl.addEventListener("change", onToggle);
  toggleEl.closest(".theme-swap")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleEl.checked = !toggleEl.checked;
      onToggle();
    }
  });
}

export function applyTheme(theme, onThemeChange) {
  document.documentElement.setAttribute("data-theme", theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === THEME_DARK ? "#0f1c24" : "#2a9d8f";
  onThemeChange?.(theme);
}
