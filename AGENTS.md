# AGENTS.md

## Cursor Cloud specific instructions

Puzzle Play is a pure client-side static site (HTML/CSS/vanilla JS ES modules) — no backend, no build step, no package manager, and no dependencies to install.

- Run (dev): `npx --yes serve . -l 3000` then open `http://localhost:3000`. Serving over HTTP is required (not `file://`) because `js/` uses ES modules and `fetch` for `js/dots-library.json`.
- Test: `node js/smoke-test.mjs` — headless logic tests for maze generation/solvability and connect-the-dots; does not need a running server.
- Lint/Build: none configured.
- URL routing for manual testing is documented in `README.md` (e.g. `#mazes`, `?size=8&seed=123#mazes`, `#dots?pic=cat&diff=easy`).
