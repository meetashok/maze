/* Puzzle Play service worker — network-first so new games show up after deploys. */
const CACHE = "puzzle-play-v5";
const ASSETS = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./css/dots.css",
  "./css/trace.css",
  "./css/memory.css",
  "./css/search.css",
  "./js/hub.js",
  "./js/common.js",
  "./js/confetti.js",
  "./js/sound.js",
  "./js/ui.js",
  "./js/maze.js",
  "./js/renderer.js",
  "./js/interaction.js",
  "./js/utils.js",
  "./js/dots.js",
  "./js/dots-shapes.js",
  "./js/dots-library.json",
  "./js/trace.js",
  "./js/trace-tips.js",
  "./js/memory.js",
  "./js/memory-themes.json",
  "./js/search.js",
  "./js/search-words.json",
  "./manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Network-first for HTML/JS/JSON so hub updates (new games) aren't stuck behind cache.
  const networkFirst =
    req.mode === "navigate" ||
    url.pathname.endsWith(".html") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".json") ||
    url.pathname.endsWith("/");

  if (networkFirst) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
    )
  );
});
