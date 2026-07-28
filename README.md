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
npx --yes serve .
```

## URL routing

| Hash / param | Meaning |
|--------------|---------|
| `#mazes` | Maze game |
| `?size=8&seed=123` | Maze config (query string) |
| `#dots?pic=cat&diff=medium` | Dots game with picture and difficulty |
| `#dots?daily=1` | Daily connect-the-dots puzzle |
| `#trace?glyph=A` | Trace letter A |
| `#trace?kind=number&glyph=5` | Trace number 5 |
| `#trace?daily=1` | Daily trace glyph |

Games are chosen from the **Game** dropdown (built from a registry in `js/hub.js`). Adding another game = one registry entry + a panel in `index.html`.

Maze example: `?size=8&seed=12345#mazes`  
Dots example: `#dots?pic=cat&diff=easy&labels=letters`

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
