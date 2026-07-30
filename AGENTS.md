# AGENTS.md

## Cursor Cloud specific instructions

Puzzle Play is a pure client-side static site (HTML/CSS/vanilla JS ES modules) — no backend, no build step, and no required package install for the app itself.

- Run (dev): `npx --yes serve -s . -l 3000` then open `http://localhost:3000`. The `-s` SPA fallback is required so paths like `/maze` and `/pattern` resolve. Serving over HTTP is required (not `file://`) because `js/` uses ES modules and `fetch` for JSON data files.
- Test: `node js/smoke-test.mjs` — headless logic tests (maze, dots, memory, search, pattern, odd, etc.); does not need a running server.
- Lint/Build: none configured.
- URL routing for manual testing is documented in `README.md` (path-based: `/maze`, `/connect`, `/trace`, `/memory`, `/search`, `/pattern`, `/odd`). Legacy hash links still upgrade to paths.
