/**
 * SVG maze renderer: walls, path, hints, solution, collision feedback.
 */

import { N, E, S, W } from "./maze.js";

const NS = "http://www.w3.org/2000/svg";

function el(name, attrs = {}, parent = null) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    node.setAttribute(k, String(v));
  }
  if (parent) parent.appendChild(node);
  return node;
}

export class MazeRenderer {
  /**
   * @param {HTMLElement} container
   */
  constructor(container) {
    this.container = container;
    this.svg = null;
    this.layers = {};
    this.maze = null;
    this.cellSize = 40;
    this.pad = 12;
    this.startIcon = "🐸";
    this.endIcon = "⭐";
    this._collisionTimer = null;
  }

  setIcons(start, end) {
    this.startIcon = start;
    this.endIcon = end;
    this._updateIcons();
  }

  /**
   * @param {ReturnType<import('./maze.js').generateMaze>} maze
   * @param {{ printMode?: boolean, compact?: boolean }} opts
   */
  render(maze, opts = {}) {
    this.maze = maze;
    this.container.innerHTML = "";
    const n = maze.size;
    const compact = !!opts.compact;
    this.pad = compact ? 6 : 12;
    this.cellSize = compact ? 28 : this._fitCellSize(n);

    const wallStroke = compact ? 2.5 : Math.max(3, Math.min(6, this.cellSize * 0.14));
    const w = this.pad * 2 + n * this.cellSize;
    const h = this.pad * 2 + n * this.cellSize;

    const svg = el("svg", {
      class: opts.printMode ? "maze-svg print-maze" : "maze-svg",
      viewBox: `0 0 ${w} ${h}`,
      width: "100%",
      height: "100%",
      role: "img",
      "aria-label": `${n} by ${n} maze`,
    });

    const bg = el(
      "rect",
      {
        class: "maze-bg",
        x: 0,
        y: 0,
        width: w,
        height: h,
        rx: compact ? 4 : 16,
      },
      svg
    );

    this.layers = {
      floors: el("g", { class: "layer-floors" }, svg),
      solution: el("g", { class: "layer-solution" }, svg),
      hint: el("g", { class: "layer-hint" }, svg),
      path: el("g", { class: "layer-path" }, svg),
      walls: el("g", { class: "layer-walls" }, svg),
      icons: el("g", { class: "layer-icons" }, svg),
      feedback: el("g", { class: "layer-feedback" }, svg),
    };

    // Soft floor tiles
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const { x, y } = this.cellOrigin(r, c);
        el(
          "rect",
          {
            class: "cell-floor",
            x,
            y,
            width: this.cellSize,
            height: this.cellSize,
            "data-r": r,
            "data-c": c,
          },
          this.layers.floors
        );
      }
    }

    this._drawWalls(wallStroke);
    this._updateIcons();

    this.svg = svg;
    this.container.appendChild(svg);
    this.clearOverlays();
    return svg;
  }

  _fitCellSize(n) {
    const rect = this.container.getBoundingClientRect();
    const width = rect.width || parseFloat(this.container.style.width) || 400;
    const height = rect.height || parseFloat(this.container.style.height) || 400;
    const avail = Math.min(
      width,
      height,
      typeof window !== "undefined" ? window.innerWidth - 32 : 400,
      typeof window !== "undefined" ? window.innerHeight * 0.55 : 400
    );
    const size = Math.floor((avail - this.pad * 2) / n);
    return Math.max(18, Math.min(56, size || 32));
  }

  cellOrigin(r, c) {
    return {
      x: this.pad + c * this.cellSize,
      y: this.pad + r * this.cellSize,
    };
  }

  cellCenter(r, c) {
    const { x, y } = this.cellOrigin(r, c);
    return { x: x + this.cellSize / 2, y: y + this.cellSize / 2 };
  }

  /** Map client coordinates to cell, or null. */
  hitTest(clientX, clientY) {
    if (!this.svg || !this.maze) return null;
    const pt = this.svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = this.svg.getScreenCTM();
    if (!ctm) return null;
    const local = pt.matrixTransform(ctm.inverse());
    const c = Math.floor((local.x - this.pad) / this.cellSize);
    const r = Math.floor((local.y - this.pad) / this.cellSize);
    const n = this.maze.size;
    if (r < 0 || c < 0 || r >= n || c >= n) return null;
    return { r, c };
  }

  _drawWalls(strokeWidth) {
    const maze = this.maze;
    const n = maze.size;
    const g = this.layers.walls;
    g.innerHTML = "";

    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const walls = maze.cells[r][c];
        const { x, y } = this.cellOrigin(r, c);
        const x2 = x + this.cellSize;
        const y2 = y + this.cellSize;

        // Draw only N and W walls per cell + outer E/S to avoid doubles
        if (walls & N) this._wall(g, x, y, x2, y, strokeWidth);
        if (walls & W) this._wall(g, x, y, x, y2, strokeWidth);
        if (c === n - 1 && walls & E) this._wall(g, x2, y, x2, y2, strokeWidth);
        if (r === n - 1 && walls & S) this._wall(g, x, y2, x2, y2, strokeWidth);
      }
    }
  }

  _wall(g, x1, y1, x2, y2, strokeWidth) {
    el(
      "line",
      {
        class: "maze-wall",
        x1,
        y1,
        x2,
        y2,
        "stroke-width": strokeWidth,
        "stroke-linecap": "square",
      },
      g
    );
  }

  _updateIcons() {
    if (!this.layers.icons || !this.maze) return;
    this.layers.icons.innerHTML = "";
    const { start, end } = this.maze;
    const fontSize = Math.max(12, this.cellSize * 0.55);

    const place = (cell, emoji, cls) => {
      const { x, y } = this.cellCenter(cell.r, cell.c);
      const t = el(
        "text",
        {
          class: cls,
          x,
          y,
          "text-anchor": "middle",
          "dominant-baseline": "central",
          "font-size": fontSize,
        },
        this.layers.icons
      );
      t.textContent = emoji;
    };

    place(start, this.startIcon, "icon-start");
    place(end, this.endIcon, "icon-end");
  }

  clearOverlays() {
    if (this.layers.path) this.layers.path.innerHTML = "";
    if (this.layers.hint) this.layers.hint.innerHTML = "";
    if (this.layers.solution) this.layers.solution.innerHTML = "";
    if (this.layers.feedback) this.layers.feedback.innerHTML = "";
  }

  drawUserPath(pathCells, { glow = true } = {}) {
    if (!this.layers.path) return;
    this.layers.path.innerHTML = "";
    if (!pathCells || pathCells.length < 1) return;

    const d = this._pathData(pathCells);
    el(
      "path",
      {
        class: glow ? "user-path" : "user-path no-glow",
        d,
        fill: "none",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        "stroke-width": Math.max(4, this.cellSize * 0.28),
      },
      this.layers.path
    );

    // Current position marker
    const last = pathCells[pathCells.length - 1];
    const { x, y } = this.cellCenter(last.r, last.c);
    el(
      "circle",
      {
        class: "path-cursor",
        cx: x,
        cy: y,
        r: Math.max(4, this.cellSize * 0.18),
      },
      this.layers.path
    );
  }

  drawHint(cells) {
    if (!this.layers.hint) return;
    this.layers.hint.innerHTML = "";
    if (!cells || cells.length < 1) return;
    // Include current last path cell if provided as first? caller passes hint steps only
    const d = this._pathData(cells);
    if (cells.length === 1) {
      const { x, y } = this.cellCenter(cells[0].r, cells[0].c);
      el(
        "circle",
        {
          class: "hint-dot",
          cx: x,
          cy: y,
          r: Math.max(3, this.cellSize * 0.12),
        },
        this.layers.hint
      );
      return;
    }
    el(
      "path",
      {
        class: "hint-path",
        d,
        fill: "none",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        "stroke-width": Math.max(3, this.cellSize * 0.18),
        "stroke-dasharray": `${this.cellSize * 0.35} ${this.cellSize * 0.2}`,
      },
      this.layers.hint
    );
  }

  drawSolution(cells) {
    if (!this.layers.solution) return;
    this.layers.solution.innerHTML = "";
    if (!cells || cells.length < 2) return;
    const d = this._pathData(cells);
    el(
      "path",
      {
        class: "solution-path",
        d,
        fill: "none",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        "stroke-width": Math.max(3, this.cellSize * 0.2),
      },
      this.layers.solution
    );
  }

  _pathData(cells) {
    return cells
      .map((p, i) => {
        const { x, y } = this.cellCenter(p.r, p.c);
        return `${i === 0 ? "M" : "L"}${x},${y}`;
      })
      .join(" ");
  }

  flashCollision(cell) {
    if (!this.layers.feedback || !cell) return;
    const { x, y } = this.cellOrigin(cell.r, cell.c);
    const rect = el(
      "rect",
      {
        class: "collision-flash",
        x,
        y,
        width: this.cellSize,
        height: this.cellSize,
      },
      this.layers.feedback
    );
    if (this.svg) {
      this.svg.classList.remove("shake");
      // force reflow
      void this.svg.offsetWidth;
      this.svg.classList.add("shake");
    }
    clearTimeout(this._collisionTimer);
    this._collisionTimer = setTimeout(() => {
      rect.remove();
      this.svg?.classList.remove("shake");
    }, 220);
  }

  /**
   * Create a standalone SVG string/element for print worksheets.
   */
  static createStaticSvg(maze, { startIcon, endIcon, showSolution, solution, compact }) {
    const wrap = document.createElement("div");
    wrap.style.width = compact ? "240px" : "400px";
    wrap.style.height = compact ? "240px" : "400px";
    const r = new MazeRenderer(wrap);
    r.startIcon = startIcon;
    r.endIcon = endIcon;
    r.render(maze, { printMode: true, compact: !!compact });
    if (showSolution && solution) r.drawSolution(solution);
    return wrap.firstElementChild;
  }
}
