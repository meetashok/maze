/**
 * Touch/mouse path tracing on the maze.
 */

import { canMove } from "./maze.js";

export class PathTracer {
  /**
   * @param {object} opts
   * @param {import('./renderer.js').MazeRenderer} opts.renderer
   * @param {() => object} opts.getMaze
   * @param {(path: {r:number,c:number}[]) => void} opts.onPathChange
   * @param {(cell: {r:number,c:number}) => void} [opts.onCollision]
   * @param {() => void} [opts.onStart]
   * @param {(path: {r:number,c:number}[]) => void} [opts.onComplete]
   */
  constructor(opts) {
    this.renderer = opts.renderer;
    this.getMaze = opts.getMaze;
    this.onPathChange = opts.onPathChange;
    this.onCollision = opts.onCollision || (() => {});
    this.onStart = opts.onStart || (() => {});
    this.onComplete = opts.onComplete || (() => {});

    this.path = [];
    this.drawing = false;
    this.completed = false;
    this.started = false;
    this._lastCollision = 0;

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
  }

  attach(el) {
    this.el = el;
    el.addEventListener("pointerdown", this._onPointerDown);
    el.addEventListener("pointermove", this._onPointerMove);
    el.addEventListener("pointerup", this._onPointerUp);
    el.addEventListener("pointercancel", this._onPointerUp);
    el.addEventListener("pointerleave", this._onPointerUp);
  }

  detach() {
    if (!this.el) return;
    this.el.removeEventListener("pointerdown", this._onPointerDown);
    this.el.removeEventListener("pointermove", this._onPointerMove);
    this.el.removeEventListener("pointerup", this._onPointerUp);
    this.el.removeEventListener("pointercancel", this._onPointerUp);
    this.el.removeEventListener("pointerleave", this._onPointerUp);
  }

  reset() {
    this.path = [];
    this.drawing = false;
    this.completed = false;
    this.started = false;
    this.onPathChange(this.path);
  }

  setPath(path) {
    this.path = path.slice();
    this.onPathChange(this.path);
  }

  get currentCell() {
    if (!this.path.length) {
      const maze = this.getMaze();
      return maze ? { ...maze.start } : null;
    }
    return this.path[this.path.length - 1];
  }

  _onPointerDown(e) {
    if (this.completed) return;
    const maze = this.getMaze();
    if (!maze) return;

    const cell = this.renderer.hitTest(e.clientX, e.clientY);
    if (!cell) return;

    e.preventDefault();
    this.el.setPointerCapture?.(e.pointerId);
    this.drawing = true;

    if (!this.path.length) {
      // Must start at entrance (or near it)
      if (cell.r === maze.start.r && cell.c === maze.start.c) {
        this.path = [{ r: cell.r, c: cell.c }];
        this._maybeStart();
        this.onPathChange(this.path);
      } else if (this._isAdjacentOpen(maze.start, cell) || this._same(maze.start, cell)) {
        this.path = [{ r: maze.start.r, c: maze.start.c }];
        if (!this._same(maze.start, cell)) {
          this._tryStep(cell);
        } else {
          this._maybeStart();
          this.onPathChange(this.path);
        }
      }
      return;
    }

    this._handleCell(cell);
  }

  _onPointerMove(e) {
    if (!this.drawing || this.completed) return;
    e.preventDefault();
    const cell = this.renderer.hitTest(e.clientX, e.clientY);
    if (!cell) return;
    this._handleCell(cell);
  }

  _onPointerUp(e) {
    if (!this.drawing) return;
    this.drawing = false;
    try {
      this.el.releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  _handleCell(cell) {
    const maze = this.getMaze();
    if (!maze || !this.path.length) return;

    const last = this.path[this.path.length - 1];
    if (this._same(last, cell)) return;

    // Undo: drag back to previous cell
    if (this.path.length >= 2) {
      const prev = this.path[this.path.length - 2];
      if (this._same(prev, cell)) {
        this.path.pop();
        this.onPathChange(this.path);
        return;
      }
      // Undo further if touching an earlier cell on the path (retrace)
      for (let i = this.path.length - 2; i >= 0; i--) {
        if (this._same(this.path[i], cell)) {
          this.path = this.path.slice(0, i + 1);
          this.onPathChange(this.path);
          return;
        }
      }
    }

    this._tryStep(cell);
  }

  _tryStep(cell) {
    const maze = this.getMaze();
    const last = this.path[this.path.length - 1];

    // Only allow single-step adjacent moves (also bridge through intermediate if finger skips)
    if (Math.abs(cell.r - last.r) + Math.abs(cell.c - last.c) === 1) {
      if (canMove(maze.cells, last.r, last.c, cell.r, cell.c)) {
        this.path.push({ r: cell.r, c: cell.c });
        this._maybeStart();
        this.onPathChange(this.path);
        this._checkComplete(maze);
      } else {
        this._collide(last);
      }
      return;
    }

    // Finger jumped multiple cells: walk Bresenham-like along open corridor if possible
    const bridge = this._walkBridge(maze, last, cell);
    if (bridge && bridge.length) {
      for (const step of bridge) {
        this.path.push(step);
      }
      this._maybeStart();
      this.onPathChange(this.path);
      this._checkComplete(maze);
    } else if (Math.abs(cell.r - last.r) + Math.abs(cell.c - last.c) === 1) {
      this._collide(last);
    }
  }

  _walkBridge(maze, from, to) {
    // Greedy: only if same row or column and all steps open
    if (from.r !== to.r && from.c !== to.c) return null;
    const steps = [];
    let r = from.r;
    let c = from.c;
    const dr = Math.sign(to.r - from.r);
    const dc = Math.sign(to.c - from.c);
    while (r !== to.r || c !== to.c) {
      const nr = r + dr;
      const nc = c + dc;
      if (!canMove(maze.cells, r, c, nr, nc)) {
        this._collide({ r, c });
        return steps.length ? steps : null;
      }
      r = nr;
      c = nc;
      steps.push({ r, c });
    }
    return steps;
  }

  _collide(cell) {
    const now = performance.now();
    if (now - this._lastCollision < 180) return;
    this._lastCollision = now;
    this.onCollision(cell);
  }

  _checkComplete(maze) {
    const last = this.path[this.path.length - 1];
    if (last.r === maze.end.r && last.c === maze.end.c) {
      this.completed = true;
      this.drawing = false;
      this.onComplete(this.path);
    }
  }

  _maybeStart() {
    if (!this.started && this.path.length >= 1) {
      this.started = true;
      this.onStart();
    }
  }

  _same(a, b) {
    return a.r === b.r && a.c === b.c;
  }

  _isAdjacentOpen(a, b) {
    const maze = this.getMaze();
    return canMove(maze.cells, a.r, a.c, b.r, b.c);
  }
}
