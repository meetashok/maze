# Puzzle Play

Kid-friendly puzzle games for ages 3–8. **Maze Play** — help the frog reach the bug. **Connect the Dots** — tap numbered dots to reveal pictures. Pure client-side HTML, CSS, and JavaScript. No backend.

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

## Open locally

```bash
npx --yes serve .
```

## URL routing

| Hash / param | Meaning |
|--------------|---------|
| `#mazes` | Maze game tab |
| `?size=8&seed=123` | Maze config (query string) |
| `#dots?pic=cat&diff=medium` | Dots game with picture and difficulty |
| `#dots?daily=1` | Daily connect-the-dots puzzle |

Maze example: `?size=8&seed=12345#mazes`  
Dots example: `#dots?pic=cat&diff=easy&labels=letters`

## Project layout

```
/
├── index.html           # shell + tab navigation
├── css/
│   ├── styles.css       # shared + maze styles
│   └── dots.css         # connect-the-dots styles
├── js/
│   ├── hub.js           # tab router
│   ├── common.js        # shared PRNG, timer, storage, hash routing
│   ├── ui.js            # maze UI
│   ├── maze.js          # maze generation + BFS
│   ├── dots.js          # connect-the-dots game
│   ├── dots-shapes.js   # algorithmic letters/numbers/shapes
│   ├── dots-library.json
│   └── smoke-test.mjs
└── README.md
```

## Feedback

Open source on [GitHub](https://github.com/meetashok/maze). Feedback welcome — [send it here](mailto:ashok.iitb@gmail.com?subject=Puzzle%20Play%20feedback).
