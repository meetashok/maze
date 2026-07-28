/**
 * Game Hub — tab navigation and shared shell.
 */

import { MazeApp } from "./ui.js";
import { DotsApp } from "./dots.js";
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
};

class GameHub {
  constructor() {
    this.activeGame = "mazes";
    this.mazeApp = null;
    this.dotsApp = null;
    this.els = {};
  }

  async init() {
    this._cacheEls();
    initTheme(this.els.themeToggle, () => {
      this.mazeApp?._redraw?.();
      this.dotsApp?._render?.();
    });

    if (!window.location.hash) setGameHash("mazes", {}, true);

    this.mazeApp = new MazeApp();
    this.mazeApp.init();

    this.dotsApp = new DotsApp();
    await this.dotsApp.init();

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
      panelMazes: $("game-mazes"),
      panelDots: $("game-dots"),
      footerHowto: $("footer-howto"),
    };
  }

  _bindTabs() {
    this.els.tabMazes?.addEventListener("click", () => this._switchGame("mazes"));
    this.els.tabDots?.addEventListener("click", () => this._switchGame("dots"));
  }

  _switchGame(game) {
    if (game === this.activeGame) return;
    const params =
      game === "dots" ? this.dotsApp?._syncUrl?.() || {} : {};
    setGameHash(game, params, false);
    this._applyRoute({ game, params: new URLSearchParams() }, false);
    if (game === "dots") {
      const { params: p } = parseGameHash();
      this.dotsApp?.onHashChange(p);
    }
  }

  _applyRoute({ game, params }, initial) {
    const next = GAMES[game] ? game : "mazes";
    this.activeGame = next;

    this.els.tabMazes?.classList.toggle("is-active", next === "mazes");
    this.els.tabDots?.classList.toggle("is-active", next === "dots");
    this.els.tabMazes?.setAttribute("aria-selected", next === "mazes" ? "true" : "false");
    this.els.tabDots?.setAttribute("aria-selected", next === "dots" ? "true" : "false");

    this.els.panelMazes.hidden = next !== "mazes";
    this.els.panelDots.hidden = next !== "dots";

    const meta = GAMES[next];
    if (this.els.brand) this.els.brand.textContent = meta.title;
    if (this.els.tagline) this.els.tagline.textContent = meta.tagline;
    document.title = `${meta.title} — Puzzle Play`;

    if (this.els.footerHowto) {
      this.els.footerHowto.textContent =
        next === "dots"
          ? "Tap the dots in order to reveal the picture. Use hints if you get stuck!"
          : "Trace a path so the frog can eat the bug. Drag backward to undo.";
    }

    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.content = meta.description;

    if (next === "dots" && !initial) {
      this.dotsApp?.onHashChange(params);
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const hub = new GameHub();
  hub.init();
  window.__gameHub = hub;
});
