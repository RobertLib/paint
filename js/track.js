/* ==========================================================================
   Privacy-friendly usage counting.

   A no-op unless the page loaded GoatCounter (see scripts/site/config.mjs).
   Only event names are sent — never file names, sizes or image content.
   ========================================================================== */

/** Events from before the (async) counter script finished loading. */
const queue = [];

function send(name) {
  try {
    window.goatcounter.count({ path: `event/${name}`, title: name, event: true });
  } catch {
    /* counting must never break the editor */
  }
}

export function track(name) {
  // event names are fixed words; anything else is not sent
  if (!/^[a-z0-9-]{1,48}$/.test(name)) return;
  if (window.goatcounter?.count) {
    send(name);
    return;
  }
  // analytics not configured: nothing to wait for
  if (!document.querySelector("script[data-goatcounter]")) return;
  queue.push(name);
  if (queue.length === 1) {
    // async scripts run before the load event, so the counter is there by then
    window.addEventListener(
      "load",
      () => {
        if (!window.goatcounter?.count) return;
        for (const n of queue.splice(0)) send(n);
      },
      { once: true }
    );
  }
}
