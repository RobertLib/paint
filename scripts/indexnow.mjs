#!/usr/bin/env node
/* ==========================================================================
   Tell IndexNow-compatible search engines (Bing, Seznam, Yandex, Naver…)
   that the pages in sitemap.xml changed. Run it after a deploy:

     node scripts/indexnow.mjs            # every URL in the sitemap
     node scripts/indexnow.mjs --dry-run  # only print what would be sent

   The key file (<key>.txt in the site root) is written by build-site.mjs and
   must be live on the site before this runs.
   ========================================================================== */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SITE } from "./site/config.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const sitemap = readFileSync(join(ROOT, "sitemap.xml"), "utf8");
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const host = new URL(SITE.base).host;
const body = {
  host,
  key: SITE.indexNowKey,
  keyLocation: `${SITE.base}${SITE.indexNowKey}.txt`,
  urlList,
};

if (process.argv.includes("--dry-run")) {
  console.log(JSON.stringify(body, null, 2));
  process.exit(0);
}

const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify(body),
});
console.log(`IndexNow: ${res.status} ${res.statusText} for ${urlList.length} URLs`);
if (!res.ok && res.status !== 202) process.exitCode = 1;
