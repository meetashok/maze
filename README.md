# Puzzle Play

Kid-friendly puzzle games for ages 3–8. **Maze Play**, **Connect the Dots**, and **Trace** (letters & numbers). Pure client-side HTML, CSS, and JavaScript. No backend.

**Live:** enable [GitHub Pages](https://pages.github.com/) on this repo (`Settings → Pages → Deploy from a branch → main → / (root)`).

## Games

### Mazes
1. Trace from the frog (top-left) to the bug (bottom-right).
2. Pick grid size and style (Simple → Expert algorithms).
3. Daily maze, hints, print worksheets, share links, timer + personal bests.

### Connect the Dots
1. Pick a category and difficulty, then tap dots in order.
2. Labels: numbers, letters, or skip counting.
3. Daily puzzle, hints, auto-hint after idle, print worksheets, share links.

### Trace
1. Pick an uppercase letter or digit and follow the dashed strokes (start at the green dot).
2. Easy / medium / hard guides, optional arrows, stroke numbers, and handwriting lines.
3. Print one glyph, 4/6 worksheets, or full A–Z / 0–9 packs for crayon practice.

## Open locally

```bash
npx --yes serve -s .
```

The `-s` flag is required so `/maze`, `/connect`, and `/trace` fall back to the app (SPA mode).

## URL routing

| Path | Game |
|------|------|
| `/maze` | Mazes |
| `/connect` | Connect the Dots |
| `/trace` | Trace letters & numbers |

Query params stay on the path, e.g. `/connect?pic=cat&diff=easy`, `/maze?size=8&seed=123`, `/trace?glyph=A`.

Legacy `#mazes` / `#dots` / `#trace` links still work and upgrade to the path form.

Games are chosen from the **Game** dropdown (registry in `js/hub.js`). Adding another game = registry entry + panel + path mapping in `common.js`.

On GitHub project pages (`username.github.io/maze/…`), paths are prefixed with the repo name automatically (`/maze/connect`, `/maze/trace`).

## Project layout

```
/
├── index.html           # shell + tab navigation
├── css/
│   ├── styles.css       # shared + maze styles
│   ├── dots.css         # connect-the-dots styles
│   └── trace.css        # trace letters/numbers styles
├── js/
│   ├── hub.js           # tab router
│   ├── common.js        # shared PRNG, timer, storage, hash routing
│   ├── ui.js            # maze UI
│   ├── maze.js          # maze generation + BFS
│   ├── dots.js          # connect-the-dots game
│   ├── dots-shapes.js   # algorithmic letters/numbers/shapes
│   ├── dots-library.json
│   ├── trace.js         # trace letters & numbers
│   └── smoke-test.mjs
└── README.md
```

## Feedback

Open source on [GitHub](https://github.com/meetashok/maze). Feedback welcome — [send it here](mailto:ashok.iitb@gmail.com?subject=Puzzle%20Play%20feedback).
