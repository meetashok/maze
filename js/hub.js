/**
 * Game Hub  -  landing page, navigation, and shared shell.
 *
 * URLs: / (home) · /maze · /connect · /trace · /memory · /search
 *
 * Flip `offline: true` on a game entry to hide it from the hub while keeping
 * its code, routes, and panel markup for later.
 */

import { MazeApp } from "./ui.js";
import { DotsApp } from "./dots.js";
import { TraceApp } from "./trace.js";
import { MemoryApp } from "./memory.js";
import { SearchApp } from "./search.js";
import {
  parseGameRoute,
  setGameRoute,
  initTheme,
} from "./common.js";
import { bindSoundToggle } from "./sound.js";

/**
 * @type {Record<string, {
 *   title: string,
 *   short: string,
 *   emoji: string,
 *   tagline: string,
 *   description: string,
 *   howto: string,
 *   cardBlurb: string,
 *   offline?: boolean
 * }>}
 */
export const GAMES = {
  mazes: {
    title: "Maze Play",
    short: "Mazes",
    emoji: "🟩",
    tagline: "Help the frog reach the bug",
    description: "Kid-friendly maze puzzles: play, print, and share.",
    howto: "Trace a path so the frog can eat the bug. Drag backward to undo.",
    cardBlurb: "Help the frog escape!",
  },
  dots: {
    title: "Connect the Dots",
    short: "Connect Dots",
    emoji: "🔵",
    tagline: "Tap the numbers in order",
    description: "Connect numbered dots to reveal hidden pictures.",
    howto: "Tap the dots in order to reveal the picture. Use hints if you get stuck!",
    cardBlurb: "Connect dots to reveal pictures!",
    // Temporarily off the site until gameplay feels solid again.
    offline: true,
  },
  trace: {
    title: "Trace Letters & Numbers",
    short: "Trace ABC",
    emoji: "✏️",
    tagline: "Follow the dashes: letters & numbers",
    description: "Trace letters and numbers: practice online or print worksheets.",
    howto: "Start at the glowing green dot and follow each dashed stroke. Print packs for crayon practice!",
    cardBlurb: "Learn to write letters!",
  },
  memory: {
    title: "Memory Match",
    short: "Memory",
    emoji: "🃏",
    tagline: "Flip cards: find the pairs",
    description: "A card-matching memory game for little kids: tap to flip, find the pairs.",
    howto: "Flip two cards. If they match, they stay up. Find every pair!",
    cardBlurb: "Match pairs to train your memory!",
  },
  search: {
    title: "Word Search",
    short: "Word Search",
    emoji: "🔍",
    tagline: "Find the hidden words",
    description: "Kid-friendly word search puzzles: play online or print worksheets.",
    howto: "Drag across letters to find each word in the list.",
    cardBlurb: "Find hidden words in the grid!",
  },
};

const HOME_META = {
  title: "Puzzle Play",
  tagline: "Pick a game and play!",
  description: "Kid-friendly puzzle games: mazes, tracing, memory, and word search!",
  howto: "Choose a game below. Tap the home button any time to come back here.",
};

/** Games shown in nav + landing (excludes offline entries). */
export function visibleGameIds() {
  return Object.keys(GAMES).filter((id) => !GAMES[id].offline);
}

function isPlayableGame(id) {
  return Boolean(GAMES[id] && !GAMES[id].offline);
}

const GAME_IDS = visibleGameIds();

class GameHub {
  constructor() {
    this.activeGame = "home";
    this.mazeApp = null;
    this.dotsApp = null;
    this.traceApp = null;
    this.memoryApp = null;
    this.searchApp = null;
    this.els = {};
  }

  async init() {
    this._cacheEls();
    this._buildNav();
    this._buildLanding();
    bindSoundToggle(this.els.soundToggle);
    initTheme(this.els.themeToggle, () => {
      this.mazeApp?._redraw?.();
      this.dotsApp?._render?.();
      this.traceApp?._render?.();
      this.memoryApp?._render?.();
      this.searchApp?._render?.();
    });

    let bootRoute = parseGameRoute();
    if (bootRoute.game !== "home" && !isPlayableGame(bootRoute.game)) {
      bootRoute = { game: "home", params: new URLSearchParams(), legacyHash: false };
    }
    setGameRoute(bootRoute.game, Object.fromEntries(bootRoute.params.entries()), true);
    bootRoute = parseGameRoute();

    // Show nav/landing immediately; load games without blocking the shell.
    this._bindNav();
    this._applyRoute(bootRoute, true);

    try {
      this.mazeApp = new MazeApp();
      this.mazeApp.init();
    } catch (err) {
      console.error("Maze init failed", err);
    }
    // Keep DotsApp code imported for later; skip boot while offline.
    if (isPlayableGame("dots")) {
      try {
        this.dotsApp = new DotsApp();
        await this.dotsApp.init();
      } catch (err) {
        console.error("Dots init failed", err);
      }
    }
    try {
      this.traceApp = new TraceApp();
      await this.traceApp.init();
    } catch (err) {
      console.error("Trace init failed", err);
    }
    try {
      this.memoryApp = new MemoryApp();
      await this.memoryApp.init();
    } catch (err) {
      console.error("Memory init failed", err);
    }
    try {
      this.searchApp = new SearchApp();
      await this.searchApp.init();
    } catch (err) {
      console.error("Search init failed", err);
    }

    // Re-apply so deep links hydrate after apps are ready.
    this._applyRoute(parseGameRoute(), true);
    window.addEventListener("popstate", () => this._applyRoute(parseGameRoute(), false));
  }

  _cacheEls() {
    const $ = (id) => document.getElementById(id);
    this.els = {
      brand: $("hub-brand"),
      tagline: $("hub-tagline"),
      themeToggle: $("theme-toggle"),
      soundToggle: $("sound-toggle"),
      homeBtn: $("nav-home"),
      brandHome: $("brand-home"),
      nav: $("game-nav"),
      primary: $("game-nav-primary"),
      landing: $("game-home"),
      landingCards: $("landing-cards"),
      panelMazes: $("game-mazes"),
      panelDots: $("game-dots"),
      panelTrace: $("game-trace"),
      panelMemory: $("game-memory"),
      panelSearch: $("game-search"),
      footerHowto: $("footer-howto"),
    };
  }

  _makeGameButton(id) {
    const meta = GAMES[id];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "game-nav-btn";
    btn.dataset.game = id;
    btn.innerHTML = `<span class="game-nav-emoji" aria-hidden="true">${meta.emoji}</span><span class="game-nav-label">${meta.short}</span>`;
    btn.setAttribute("aria-pressed", "false");
    btn.setAttribute("aria-label", meta.title);
    btn.title = meta.title;
    btn.addEventListener("click", () => this._switchGame(id));
    return btn;
  }

  _buildNav() {
    const { primary } = this.els;
    if (!primary) return;
    primary.innerHTML = "";
    primary.style.setProperty("--game-slots", String(GAME_IDS.length));
    for (const id of GAME_IDS) {
      primary.appendChild(this._makeGameButton(id));
    }
  }

  _buildLanding() {
    const host = this.els.landingCards;
    if (!host) return;
    host.innerHTML = "";
    for (const id of GAME_IDS) {
      const meta = GAMES[id];
      const card = document.createElement("button");
      card.type = "button";
      card.className = "landing-card";
      card.dataset.game = id;
      card.setAttribute("aria-label", `${meta.title}. ${meta.cardBlurb}`);
      card.innerHTML = `
        <span class="landing-card-art" aria-hidden="true">${meta.emoji}</span>
        <span class="landing-card-body">
          <span class="landing-card-title">${meta.title}</span>
          <span class="landing-card-blurb">${meta.cardBlurb}</span>
        </span>
      `;
      card.addEventListener("click", () => this._switchGame(id));
      host.appendChild(card);
    }
  }

  _bindNav() {
    this.els.homeBtn?.addEventListener("click", () => this._switchGame("home"));
    this.els.brandHome?.addEventListener("click", () => this._switchGame("home"));
  }

  _syncNavActive(game) {
    const root = this.els.nav;
    if (!root) return;
    root.querySelectorAll("[data-game]").forEach((btn) => {
      const on = btn.dataset.game === game;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    this.els.homeBtn?.classList.toggle("is-active", game === "home");
  }

  _panelFor(game) {
    if (game === "home") return this.els.landing;
    if (game === "dots") return this.els.panelDots;
    if (game === "trace") return this.els.panelTrace;
    if (game === "memory") return this.els.panelMemory;
    if (game === "search") return this.els.panelSearch;
    return this.els.panelMazes;
  }

  _switchGame(game) {
    if (game !== "home" && !isPlayableGame(game)) return;
    if (game === this.activeGame) return;
    let params = {};
    if (game === "dots") params = this.dotsApp?.getShareParams?.() || {};
    if (game === "trace") params = this.traceApp?.getShareParams?.() || {};
    if (game === "memory") params = this.memoryApp?.getShareParams?.() || {};
    if (game === "search") params = this.searchApp?.getShareParams?.() || {};
    setGameRoute(game, params, false);
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
    }
    this._applyRoute({ game, params: sp }, false);
  }

  _applyRoute({ game, params }, initial) {
    const next = game === "home" || isPlayableGame(game) ? game : "home";
    this.activeGame = next;
    this._syncNavActive(next);

    const panels = [
      this.els.landing,
      this.els.panelMazes,
      this.els.panelDots,
      this.els.panelTrace,
      this.els.panelMemory,
      this.els.panelSearch,
    ];
    for (const panel of panels) {
      if (panel) panel.hidden = panel !== this._panelFor(next);
    }

    if (next === "home") {
      if (this.els.brand) this.els.brand.textContent = HOME_META.title;
      if (this.els.tagline) this.els.tagline.textContent = HOME_META.tagline;
      document.title = `${HOME_META.title}: Kid Puzzles`;
      if (this.els.footerHowto) this.els.footerHowto.textContent = HOME_META.howto;
      const desc = document.querySelector('meta[name="description"]');
      if (desc) desc.content = HOME_META.description;
      return;
    }

    const meta = GAMES[next];
    if (this.els.brand) this.els.brand.textContent = meta.title;
    if (this.els.tagline) this.els.tagline.textContent = meta.tagline;
    document.title = `${meta.title} · Puzzle Play`;

    if (this.els.footerHowto) {
      this.els.footerHowto.textContent = meta.howto;
    }

    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.content = meta.description;

    if (next === "dots") this.dotsApp?.onHashChange(params);
    if (next === "trace") this.traceApp?.onHashChange(params);
    if (next === "memory") this.memoryApp?.onHashChange(params);
    if (next === "search") this.searchApp?.onHashChange(params);
    if (initial) {
      if (next === "dots") this.dotsApp?._syncUrl?.();
      if (next === "trace") this.traceApp?._syncUrl?.();
      if (next === "mazes") this.mazeApp?._syncUrl?.();
      if (next === "memory") this.memoryApp?._syncUrl?.();
      if (next === "search") this.searchApp?._syncUrl?.();
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const hub = new GameHub();
  hub.init();
  window.__gameHub = hub;
});
