/**
 * Game Hub — tab navigation and shared shell.
 *
 * Games are registered in GAMES; the switcher UI is built from that list
 * so adding a 4th–6th game is one registry entry + a panel in HTML.
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

/** @type {Record<string, { title: string, short: string, tagline: string, description: string, howto: string }>} */
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
    short: "Dots",
    tagline: "Tap the numbers in order",
    description: "Connect numbered dots to reveal hidden pictures.",
    howto: "Tap the dots in order to reveal the picture. Use hints if you get stuck!",
  },
  trace: {
    title: "Trace Letters & Numbers",
    short: "Trace",
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
    this.els = {};
  }

  async init() {
    this._cacheEls();
    this._buildSwitcher();
    initTheme(this.els.themeToggle, () => {
      this.mazeApp?._redraw?.();
      this.dotsApp?._render?.();
      this.traceApp?._render?.();
    });

    let bootRoute = parseGameRoute();
    if (!GAMES[bootRoute.game]) {
      bootRoute = { game: "mazes", params: new URLSearchParams(), legacyHash: false };
    }
    // Normalize to /maze · /connect · /trace (and migrate legacy #hash links).
    setGameRoute(bootRoute.game, Object.fromEntries(bootRoute.params.entries()), true);
    bootRoute = parseGameRoute();

    this.mazeApp = new MazeApp();
    this.mazeApp.init();

    this.dotsApp = new DotsApp();
    await this.dotsApp.init();

    this.traceApp = new TraceApp();
    await this.traceApp.init();

    this._bindSwitcher();
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
      switcher: $("game-switcher"),
      panelMazes: $("game-mazes"),
      panelDots: $("game-dots"),
      panelTrace: $("game-trace"),
      footerHowto: $("footer-howto"),
    };
  }

  _buildSwitcher() {
    const sel = this.els.switcher;
    if (!sel) return;
    sel.innerHTML = "";
    for (const id of GAME_IDS) {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = GAMES[id].short;
      sel.appendChild(opt);
    }
  }

  _bindSwitcher() {
    this.els.switcher?.addEventListener("change", () => {
      const game = this.els.switcher.value;
      if (GAMES[game]) this._switchGame(game);
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

    if (this.els.switcher && this.els.switcher.value !== next) {
      this.els.switcher.value = next;
    }

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
