/* Paint Studio service worker — network-first with an offline fallback cache.
   Bump CACHE when the app shell changes so old entries are dropped. */

const CACHE = "paint-studio-v3";

const SHELL = [
  "./",
  "./editor/",
  "./css/tokens.css",
  "./css/layout.css",
  "./css/components.css",
  "./css/site.css",
  "./js/main.js",
  "./js/i18n.js",
  "./js/lang/cs.js",
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
  "./js/tone.js",
  "./js/tasks.js",
  "./js/store.js",
  "./js/autosave.js",
  "./js/track.js",
  "./js/psd.js",
  "./js/heic.js",
  "./js/site.js",
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
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() =>
        // query strings (?task=…, ?lang=…) must not stop the shell loading offline
        caches.match(request, { ignoreSearch: request.mode === "navigate" }).then(
          (hit) =>
            hit ||
            (request.mode === "navigate"
              ? caches.match(new URL("./editor/", self.registration.scope).href)
              : undefined)
        )
      )
  );
});
