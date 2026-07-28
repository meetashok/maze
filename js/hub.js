/**
 * Game Hub — tab navigation and shared shell.
 */

import { MazeApp } from "./ui.js";
import { DotsApp } from "./dots.js";
import { TraceApp } from "./trace.js";
import {
  parseGameHash,
  setGameHash,
  initTheme,
} from "./common.js";

const GAMES = {
  mazes: {
    title: "Maze Play",
    tagline: "Help the frog reach the bug",
    description: "Kid-friendly maze puzzles — trace, print, and share.",
  },
  dots: {
    title: "Connect the Dots",
    tagline: "Tap the numbers in order",
    description: "Connect numbered dots to reveal hidden pictures.",
  },
  trace: {
    title: "Trace",
    tagline: "Follow the dashes — letters & numbers",
    description: "Trace uppercase letters and numbers — practice online or print worksheets.",
  },
};

const HOWTO = {
  mazes: "Trace a path so the frog can eat the bug. Drag backward to undo.",
  dots: "Tap the dots in order to reveal the picture. Use hints if you get stuck!",
  trace: "Start at the glowing green dot and follow each dashed stroke. Print packs for crayon practice!",
};

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
    initTheme(this.els.themeToggle, () => {
      this.mazeApp?._redraw?.();
      this.dotsApp?._render?.();
      this.traceApp?._render?.();
    });

    if (!window.location.hash) setGameHash("mazes", {}, true);

    this.mazeApp = new MazeApp();
    this.mazeApp.init();

    this.dotsApp = new DotsApp();
    await this.dotsApp.init();

    this.traceApp = new TraceApp();
    await this.traceApp.init();

    this._bindTabs();
    this._applyRoute(parseGameHash(), true);
    window.addEventListener("hashchange", () => {
      this._applyRoute(parseGameHash(), false);
    });
  }

  _cacheEls() {
    const $ = (id) => document.getElementById(id);
    this.els = {
      brand: $("hub-brand"),
      tagline: $("hub-tagline"),
      themeToggle: $("theme-toggle"),
      tabMazes: $("tab-mazes"),
      tabDots: $("tab-dots"),
      tabTrace: $("tab-trace"),
      panelMazes: $("game-mazes"),
      panelDots: $("game-dots"),
      panelTrace: $("game-trace"),
      footerHowto: $("footer-howto"),
    };
  }

  _bindTabs() {
    this.els.tabMazes?.addEventListener("click", () => this._switchGame("mazes"));
    this.els.tabDots?.addEventListener("click", () => this._switchGame("dots"));
    this.els.tabTrace?.addEventListener("click", () => this._switchGame("trace"));
  }

  _paramsForGame(game) {
    if (game === "dots") return this.dotsApp?._syncUrl?.() || {};
    if (game === "trace") return this.traceApp?._syncUrl?.() || {};
    return {};
  }

  _switchGame(game) {
    if (game === this.activeGame) return;
    const params = this._paramsForGame(game);
    setGameHash(game, params, false);
    this._applyRoute({ game, params: new URLSearchParams() }, false);
    if (game === "dots") {
      const { params: p } = parseGameHash();
      this.dotsApp?.onHashChange(p);
    } else if (game === "trace") {
      const { params: p } = parseGameHash();
      this.traceApp?.onHashChange(p);
    }
  }

  _applyRoute({ game, params }, initial) {
    const next = GAMES[game] ? game : "mazes";
    this.activeGame = next;

    this.els.tabMazes?.classList.toggle("is-active", next === "mazes");
    this.els.tabDots?.classList.toggle("is-active", next === "dots");
    this.els.tabTrace?.classList.toggle("is-active", next === "trace");
    this.els.tabMazes?.setAttribute("aria-selected", next === "mazes" ? "true" : "false");
    this.els.tabDots?.setAttribute("aria-selected", next === "dots" ? "true" : "false");
    this.els.tabTrace?.setAttribute("aria-selected", next === "trace" ? "true" : "false");

    this.els.panelMazes.hidden = next !== "mazes";
    this.els.panelDots.hidden = next !== "dots";
    this.els.panelTrace.hidden = next !== "trace";

    const meta = GAMES[next];
    if (this.els.brand) this.els.brand.textContent = meta.title;
    if (this.els.tagline) this.els.tagline.textContent = meta.tagline;
    document.title = `${meta.title} — Puzzle Play`;

    if (this.els.footerHowto) {
      this.els.footerHowto.textContent = HOWTO[next] || HOWTO.mazes;
    }

    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.content = meta.description;

    if (!initial) {
      if (next === "dots") this.dotsApp?.onHashChange(params);
      if (next === "trace") this.traceApp?.onHashChange(params);
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const hub = new GameHub();
  hub.init();
  window.__gameHub = hub;
});
