/* Paint Studio service worker — network-first with an offline fallback cache.
   Bump CACHE when the app shell changes so old entries are dropped. */

const CACHE = "paint-studio-v2";

const SHELL = [
  "./",
  "./index.html",
  "./css/tokens.css",
  "./css/layout.css",
  "./css/components.css",
  "./js/main.js",
  "./js/state.js",
  "./js/doc.js",
  "./js/color.js",
  "./js/history.js",
  "./js/viewport.js",
  "./js/render.js",
  "./js/tools.js",
  "./js/filters.js",
  "./js/actions.js",
  "./js/ui.js",
  "./js/menus.js",
  "./manifest.json",
  "./favicon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== location.origin) {
    return;
  }
  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        return response;
      })
      .catch(() =>
        caches
          .match(request)
          .then(
            (hit) =>
              hit ||
              (request.mode === "navigate" ? caches.match("./index.html") : undefined)
          )
      )
  );
});
