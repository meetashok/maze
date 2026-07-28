/**
 * Game Hub — navigation and shared shell.
 *
 * Games are registered in GAMES. Primary nav shows up to PRIMARY_SLOTS
 * buttons (empty slots reserved for future games). Overflow goes behind
 * the hamburger menu.
 *
 * URLs: /maze · /connect · /trace  (legacy #hash links still redirect)
 */

import { MazeApp } from "./ui.js";
import { DotsApp } from "./dots.js";
import { TraceApp } from "./trace.js";
import {
  parseGameRoute,
  setGameRoute,
  initTheme,
} from "./common.js";

/** How many game buttons to show in the primary row before overflow. */
const PRIMARY_SLOTS = 5;

/**
 * @type {Record<string, {
 *   title: string,
 *   short: string,
 *   tagline: string,
 *   description: string,
 *   howto: string
 * }>}
 */
export const GAMES = {
  mazes: {
    title: "Maze Play",
    short: "Mazes",
    tagline: "Help the frog reach the bug",
    description: "Kid-friendly maze puzzles — play, print, and share.",
    howto: "Trace a path so the frog can eat the bug. Drag backward to undo.",
  },
  dots: {
    title: "Connect the Dots",
    short: "Connect Dots",
    tagline: "Tap the numbers in order",
    description: "Connect numbered dots to reveal hidden pictures.",
    howto: "Tap the dots in order to reveal the picture. Use hints if you get stuck!",
  },
  trace: {
    title: "Trace Letters & Numbers",
    short: "Trace ABC",
    tagline: "Follow the dashes — letters & numbers",
    description: "Trace uppercase letters and numbers — practice online or print worksheets.",
    howto: "Start at the glowing green dot and follow each dashed stroke. Print packs for crayon practice!",
  },
};

const GAME_IDS = Object.keys(GAMES);

class GameHub {
  constructor() {
    this.activeGame = "mazes";
    this.mazeApp = null;
    this.dotsApp = null;
    this.traceApp = null;
    this.menuOpen = false;
    this.els = {};
  }

  async init() {
    this._cacheEls();
    this._buildNav();
    initTheme(this.els.themeToggle, () => {
      this.mazeApp?._redraw?.();
      this.dotsApp?._render?.();
      this.traceApp?._render?.();
    });

    let bootRoute = parseGameRoute();
    if (!GAMES[bootRoute.game]) {
      bootRoute = { game: "mazes", params: new URLSearchParams(), legacyHash: false };
    }
    setGameRoute(bootRoute.game, Object.fromEntries(bootRoute.params.entries()), true);
    bootRoute = parseGameRoute();

    this.mazeApp = new MazeApp();
    this.mazeApp.init();

    this.dotsApp = new DotsApp();
    await this.dotsApp.init();

    this.traceApp = new TraceApp();
    await this.traceApp.init();

    this._bindNav();
    this._applyRoute(bootRoute, true);
    const onRoute = () => this._applyRoute(parseGameRoute(), false);
    window.addEventListener("popstate", onRoute);
  }

  _cacheEls() {
    const $ = (id) => document.getElementById(id);
    this.els = {
      brand: $("hub-brand"),
      tagline: $("hub-tagline"),
      themeToggle: $("theme-toggle"),
      nav: $("game-nav"),
      primary: $("game-nav-primary"),
      moreBtn: $("game-nav-more"),
      menu: $("game-nav-menu"),
      panelMazes: $("game-mazes"),
      panelDots: $("game-dots"),
      panelTrace: $("game-trace"),
      footerHowto: $("footer-howto"),
    };
  }

  _makeGameButton(id, { inMenu = false } = {}) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = inMenu ? "game-nav-menu-item" : "game-nav-btn";
    btn.dataset.game = id;
    btn.textContent = GAMES[id].short;
    btn.setAttribute("aria-pressed", "false");
    btn.title = GAMES[id].title;
    btn.addEventListener("click", () => {
      this._closeMenu();
      this._switchGame(id);
    });
    return btn;
  }

  _buildNav() {
    const { primary, moreBtn, menu } = this.els;
    if (!primary) return;

    primary.innerHTML = "";
    primary.style.setProperty("--game-slots", String(PRIMARY_SLOTS));

    const primaryIds = GAME_IDS.slice(0, PRIMARY_SLOTS);
    const overflowIds = GAME_IDS.slice(PRIMARY_SLOTS);

    for (const id of primaryIds) {
      primary.appendChild(this._makeGameButton(id));
    }
    // Reserve empty slots so 4th/5th games have a clear home later.
    for (let i = primaryIds.length; i < PRIMARY_SLOTS; i++) {
      const slot = document.createElement("span");
      slot.className = "game-nav-slot";
      slot.setAttribute("aria-hidden", "true");
      primary.appendChild(slot);
    }

    if (menu) {
      menu.innerHTML = "";
      for (const id of overflowIds) {
        menu.appendChild(this._makeGameButton(id, { inMenu: true }));
      }
    }

    if (moreBtn) {
      const showMore = overflowIds.length > 0;
      moreBtn.hidden = !showMore;
      moreBtn.setAttribute("aria-expanded", "false");
    }
  }

  _bindNav() {
    this.els.moreBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.menuOpen ? this._closeMenu() : this._openMenu();
    });
    document.addEventListener("click", (e) => {
      if (!this.menuOpen) return;
      if (this.els.nav?.contains(e.target)) return;
      this._closeMenu();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this._closeMenu();
    });
  }

  _openMenu() {
    if (!this.els.menu || this.els.moreBtn?.hidden) return;
    this.menuOpen = true;
    this.els.menu.hidden = false;
    this.els.moreBtn?.setAttribute("aria-expanded", "true");
    this.els.moreBtn?.classList.add("is-open");
  }

  _closeMenu() {
    this.menuOpen = false;
    if (this.els.menu) this.els.menu.hidden = true;
    this.els.moreBtn?.setAttribute("aria-expanded", "false");
    this.els.moreBtn?.classList.remove("is-open");
  }

  _syncNavActive(game) {
    const root = this.els.nav;
    if (!root) return;
    root.querySelectorAll("[data-game]").forEach((btn) => {
      const on = btn.dataset.game === game;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  _panelFor(game) {
    if (game === "dots") return this.els.panelDots;
    if (game === "trace") return this.els.panelTrace;
    return this.els.panelMazes;
  }

  _switchGame(game) {
    if (!GAMES[game] || game === this.activeGame) return;
    let params = {};
    if (game === "dots") params = this.dotsApp?.getShareParams?.() || {};
    if (game === "trace") params = this.traceApp?.getShareParams?.() || {};
    setGameRoute(game, params, false);
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
    }
    this._applyRoute({ game, params: sp }, false);
  }

  _applyRoute({ game, params }, initial) {
    const next = GAMES[game] ? game : "mazes";
    this.activeGame = next;
    this._syncNavActive(next);

    for (const id of GAME_IDS) {
      const panel = this._panelFor(id);
      if (panel) panel.hidden = id !== next;
    }

    const meta = GAMES[next];
    if (this.els.brand) this.els.brand.textContent = meta.title;
    if (this.els.tagline) this.els.tagline.textContent = meta.tagline;
    document.title = `${meta.title} — Puzzle Play`;

    if (this.els.footerHowto) {
      this.els.footerHowto.textContent = meta.howto;
    }

    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.content = meta.description;

    if (next === "dots") this.dotsApp?.onHashChange(params);
    if (next === "trace") this.traceApp?.onHashChange(params);
    if (initial) {
      if (next === "dots") this.dotsApp?._syncUrl?.();
      if (next === "trace") this.traceApp?._syncUrl?.();
      if (next === "mazes") this.mazeApp?._syncUrl?.();
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const hub = new GameHub();
  hub.init();
  window.__gameHub = hub;
});
