/* Paint Studio service worker — network-first with an offline fallback cache.
   Bump CACHE when the app shell changes so old entries are dropped.

   - Pages are stored and looked up by origin + pathname only, so tracking
     parameters (?fbclid=, ?utm_*) and the editor's ?task=…&lang=… never add
     cache entries, and every offline lookup of a page ignores its query.
   - A navigation waits for the network at most NAV_TIMEOUT when a cached copy
     exists; a slow connection then gets the cached page.
   - Offline, a page that was never cached redirects to one that was (the
     language's landing page, else the editor) — never another page's HTML at
     this URL, whose relative ../js/ links would resolve to the wrong place. */

const CACHE = "paint-studio-v4";
const NAV_TIMEOUT = 4000;

const SHELL = [
  "./",
  "./cs/",
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
      // straight from the network: the HTTP cache may still hold the old shell
      .then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
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

/** Cache key: the URL without its query string or hash. */
const keyOf = (url) => url.origin + url.pathname;

/**
 * Fetch from the network and store a copy under `key`. The copy is cloned
 * before the page can consume the body, and the worker is kept alive until it
 * is stored — even when a cached response was already served.
 */
function fetchAndStore(event, key) {
  const fetched = fetch(event.request).then((response) => {
    if (!response.ok || response.type !== "basic") return [response, null];
    const copy = response.clone();
    return [response, caches.open(CACHE).then((cache) => cache.put(key, copy))];
  });
  event.waitUntil(fetched.then(([, stored]) => stored).catch(() => {}));
  return fetched.then(([response]) => response);
}

/** A page that was never cached, offline: send the browser to one that was. */
async function offlineRedirect(url) {
  const scope = new URL(self.registration.scope);
  const rel = url.pathname.startsWith(scope.pathname) ? url.pathname.slice(scope.pathname.length) : "";
  const editor = new URL("editor/", scope);
  if (rel.startsWith("editor/")) {
    editor.search = url.search; // keep ?task=…&lang=…
  } else {
    // a landing page: its language's home page, else the editor in that language
    const lang = rel.match(/^([a-z]{2})\//)?.[1];
    const home = new URL(lang ? `${lang}/` : "./", scope);
    if (await caches.match(home.href)) return Response.redirect(home.href, 302);
    if (lang) editor.searchParams.set("lang", lang);
  }
  if (await caches.match(keyOf(editor))) return Response.redirect(editor.href, 302);
  return Response.error();
}

async function navigate(event, url) {
  const network = fetchAndStore(event, keyOf(url));
  network.catch(() => {}); // a failure is handled below, once the cache has answered
  const cached = await caches.match(keyOf(url));
  if (!cached) return network.catch(() => offlineRedirect(url));
  let timer;
  const slow = new Promise((resolve) => {
    timer = setTimeout(() => resolve(cached), NAV_TIMEOUT);
  });
  return Promise.race([network.catch(() => cached), slow]).finally(() => clearTimeout(timer));
}

async function asset(event, url) {
  try {
    return await fetchAndStore(event, keyOf(url));
  } catch (err) {
    const cached = await caches.match(keyOf(url));
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== location.origin) return;
  event.respondWith(request.mode === "navigate" ? navigate(event, url) : asset(event, url));
});
