/* Paint Studio service worker — network-first with an offline fallback cache.
   Bump CACHE when the app shell changes so old entries are dropped.

   - Pages are stored and looked up by origin + pathname only, so tracking
     parameters (?fbclid=, ?utm_*) and the editor's ?task=…&lang=… never add
     cache entries, and every offline lookup of a page ignores its query.
   - The network is asked with cache: "no-cache": the browser revalidates its
     HTTP copy (a cheap 304) instead of serving it unchecked — GitHub Pages
     lets it keep a file for 10 minutes, long after a deploy. What the page
     gets is marked no-cache too, so its memory cache cannot skip this worker.
   - A navigation waits for the network at most NAV_TIMEOUT when a cached copy
     exists; a slow connection then gets the cached page. Such a page also
     gets its scripts, styles and images from the cache (refreshed behind it
     for the next visit), so it never runs with files from a newer deploy.
   - Offline, a page that was never cached redirects to one that was (the
     language's landing page, else the editor) — never another page's HTML at
     this URL, whose relative ../js/ links would resolve to the wrong place.
   - A shell that cannot be cached completely fails the install: the worker
     before keeps running with its complete cache, and the next visit retries. */

const CACHE = "paint-studio-v7";
/**
 * Every version of CACHE starts with this. Cache Storage belongs to the
 * origin, and robertlib.github.io is shared by all of the account's project
 * sites: only this app's own old caches may ever be deleted.
 */
const CACHE_PREFIX = "paint-studio-";
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
      // only now: a failed precache rejects, and activating anyway would
      // delete the old, complete cache
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE).map((k) => caches.delete(k)))
      )
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
  // (a navigation request turns into a same-origin one here, as it should)
  const fetched = fetch(new Request(event.request, { cache: "no-cache" })).then((response) => {
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

/**
 * Pages (client ids) that were served from the cache: their files come from it too.
 *
 * Best effort, and in practice only for the files a page loads as it starts.
 * The set lives in this worker's memory, which is gone once the browser stops
 * the idle worker (after about 30 s in Chrome), and a new version of the
 * worker starts without it; a module the page imports later (psd.js,
 * heic.js) is then fetched network-first and may come from a newer deploy.
 * Keeping the set in storage would not make that safe either: the cache is
 * refreshed one file at a time, so even a cached psd.js need not match the
 * page, and an update replaces the whole cache under open pages anyway. What
 * catches it is loadModule() in js/actions.js: a module that no longer links
 * against the code already running asks for a reload. (One that still links
 * but behaves differently is not caught — the remaining, small risk.)
 */
const pinned = new Set();

/**
 * Forget pages that have since been closed, so the set never grows for good.
 * `keep` is the page being opened right now: it is no client yet.
 */
async function prunePinned(keep) {
  const open = new Set((await self.clients.matchAll({ includeUncontrolled: true })).map((c) => c.id));
  for (const id of pinned) if (id !== keep && !open.has(id)) pinned.delete(id);
}

async function navigate(event, url) {
  const network = fetchAndStore(event, keyOf(url));
  network.catch(() => {}); // a failure is handled below, once the cache has answered
  const cached = await caches.match(keyOf(url));
  if (!cached) return network.catch(() => offlineRedirect(url));
  const fromCache = () => {
    const id = event.resultingClientId;
    if (id) {
      pinned.add(id);
      if (pinned.size > 32) prunePinned(id).catch(() => {});
    }
    return cached;
  };
  let timer;
  const slow = new Promise((resolve) => {
    timer = setTimeout(() => resolve(fromCache()), NAV_TIMEOUT);
  });
  return Promise.race([network.catch(fromCache), slow]).finally(() => clearTimeout(timer));
}

async function asset(event, url) {
  const key = keyOf(url);
  if (pinned.has(event.clientId)) {
    // the page came from the cache: its modules must match it, not whatever
    // the network has now — which is still fetched, for the next visit
    const cached = await caches.match(key);
    if (cached) {
      fetchAndStore(event, key).catch(() => {});
      return cached;
    }
  }
  try {
    return await fetchAndStore(event, key);
  } catch (err) {
    const cached = await caches.match(key);
    if (cached) return cached;
    throw err;
  }
}

/**
 * The browser keeps scripts and styles in its memory cache and reuses them
 * on the next page of the tab without asking this worker, for as long as the
 * server's max-age allows: a page from a new deploy would run the old
 * modules. Marked no-cache, every load of them comes through here.
 */
async function revalidated(response) {
  if (response.type !== "basic" || response.status !== 200) return response;
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-cache");
  // the body passes through as a stream where a response can be built on one
  const body = streamBodies() ? response.body : await response.blob();
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

let canStream;
function streamBodies() {
  if (canStream === undefined) {
    try {
      canStream = !!new Response(new ReadableStream()).body;
    } catch {
      canStream = false;
    }
  }
  return canStream;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== location.origin) return;
  event.respondWith(request.mode === "navigate" ? navigate(event, url) : asset(event, url).then(revalidated));
});
