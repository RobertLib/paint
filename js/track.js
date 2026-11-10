/* ==========================================================================
   Privacy-friendly usage counting.

   A no-op unless the page loaded GoatCounter (see scripts/site/config.mjs).
   Only event names are sent — never file names, sizes or image content.
   ========================================================================== */

export function track(name) {
  try {
    window.goatcounter?.count?.({ path: `event/${name}`, title: name, event: true });
  } catch {
    /* counting must never break the editor */
  }
}
