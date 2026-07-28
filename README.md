# Maze Play

Kid-friendly maze puzzle generator. Trace a path with your finger or mouse, print worksheets, share a maze link, and race the daily puzzle. Pure client-side — HTML, CSS, and JavaScript. No backend.

**Live:** enable [GitHub Pages](https://pages.github.com/) on this repo (`Settings → Pages → Deploy from a branch → main → / (root)`). The site will be at `https://<user>.github.io/maze/`.

## How to play

1. Start at the top-left icon and drag through open corridors to the bottom-right.
2. Drag backward along your path to undo. **Clear Path** resets the trail without changing the maze.
3. **New Maze** builds a fresh random maze. **Daily Maze** is the same 8×8 puzzle for everyone today.
4. **Show Hint** reveals the next few steps. **Show Solution** draws the full shortest path.
5. Beat your personal best with the optional timer (saved in your browser).

## Open locally

No build step. Either open `index.html` in a modern browser, or serve the folder:

```bash
npx --yes serve .
```

Then visit the URL printed in the terminal (ES modules need a local server in some browsers).

## Shareable links

Configuration is stored in the query string:

| Param   | Meaning                                      |
|---------|----------------------------------------------|
| `size`  | Grid size 4–20                               |
| `seed`  | Unsigned integer seed for generation         |
| `start` | Start emoji (URL-encoded)                    |
| `end`   | End emoji (URL-encoded)                      |
| `daily` | `1` marks the daily maze                     |

Example: `?size=8&seed=12345&start=%F0%9F%90%B8&end=%E2%AD%90`

## Features (v1)

- Recursive-backtracking mazes (always solvable) with seeded PRNG
- Difficulty bands: Easy 4–6, Medium 7–10, Hard 11–14, Expert 15–20
- Touch + mouse path tracing, wall collision feedback, celebration
- Icon picker, share link, timer + personal bests (`localStorage`)
- Print: single maze or 4/6 worksheet layouts, with or without solution

## Project layout

```
/
├── index.html
├── css/styles.css
├── js/
│   ├── maze.js          # generation + BFS solve
│   ├── renderer.js      # SVG drawing
│   ├── interaction.js   # path tracing
│   ├── ui.js            # controls & print
│   ├── utils.js         # PRNG, URL, storage
│   └── confetti.js      # win celebration
└── README.md
```

## Phase 2 (not in this release)

Shaped mazes, visual themes, and progressive “how far can you go?” mode.
