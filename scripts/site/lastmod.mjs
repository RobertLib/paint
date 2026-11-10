/* ==========================================================================
   Stable <lastmod> dates for the sitemap.

   scripts/site/lastmod.json maps every sitemap URL to
     { hash, date, submitted? }
   hash       fingerprint of the page's title, description and <main> content
   date       the day that fingerprint last changed (the sitemap's <lastmod>)
   submitted  the hash last sent to IndexNow (scripts/indexnow.mjs)

   build-site.mjs only moves `date` forward when the hash changes, so a rebuild
   without copy changes leaves sitemap.xml untouched and IndexNow only pings
   pages that really changed. The file is committed with the generated pages.
   ========================================================================== */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const LASTMOD_FILE = join(dirname(fileURLToPath(import.meta.url)), "lastmod.json");

/** @returns {Record<string, {hash: string, date: string, submitted?: string}>} */
export function readLastmod() {
  if (!existsSync(LASTMOD_FILE)) return {};
  return JSON.parse(readFileSync(LASTMOD_FILE, "utf8"));
}

/** Writes only when something changed, so the file never churns. */
export function writeLastmod(entries) {
  const text = `${JSON.stringify(entries, null, 2)}\n`;
  const old = existsSync(LASTMOD_FILE) ? readFileSync(LASTMOD_FILE, "utf8") : "";
  if (text === old) return false;
  writeFileSync(LASTMOD_FILE, text);
  return true;
}
