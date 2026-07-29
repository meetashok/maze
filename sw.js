/* Minimal offline cache for Puzzle Play */
const CACHE = "puzzle-play-v2";
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
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((res) => {
          if (res && res.ok && new URL(req.url).origin === self.location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
