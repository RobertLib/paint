#!/usr/bin/env node
/* ==========================================================================
   Tell IndexNow-compatible search engines (Bing, Seznam, Yandex, Naver…)
   which pages changed. Run it after a deploy:

     node scripts/indexnow.mjs            # pages changed since the last run
     node scripts/indexnow.mjs --all      # every URL in the sitemap
     node scripts/indexnow.mjs --dry-run  # only print what would be sent

   "Changed" comes from scripts/site/lastmod.json, which build-site.mjs keeps:
   a URL is sent when its content hash differs from the one last submitted.
   After a successful submission the file records the submitted hashes —
   commit it so the next run starts from there.

   The key file (<key>.txt in the site root) is written by build-site.mjs and
   must be live on the site before this runs.
   ========================================================================== */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SITE } from "./site/config.mjs";
import { readLastmod, writeLastmod } from "./site/lastmod.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const all = args.has("--all");

const sitemap = readFileSync(join(ROOT, "sitemap.xml"), "utf8");
const inSitemap = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const lastmod = readLastmod();
const pending = (url) => !lastmod[url] || lastmod[url].submitted !== lastmod[url].hash;
const urlList = all ? inSitemap : inSitemap.filter(pending);

if (!urlList.length) {
  console.log("IndexNow: nothing changed since the last submission (use --all to send every URL).");
  process.exit(0);
}

const body = {
  host: new URL(SITE.base).host,
  key: SITE.indexNowKey,
  keyLocation: `${SITE.base}${SITE.indexNowKey}.txt`,
  urlList,
};

if (dryRun) {
  console.log(JSON.stringify(body, null, 2));
  console.log(`(dry run: ${urlList.length} of ${inSitemap.length} URLs, nothing sent)`);
  process.exit(0);
}

const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify(body),
});
console.log(`IndexNow: ${res.status} ${res.statusText} for ${urlList.length} URLs`);

if (res.ok) {
  for (const url of urlList) {
    if (lastmod[url]) lastmod[url].submitted = lastmod[url].hash;
  }
  if (writeLastmod(lastmod)) console.log("Recorded in scripts/site/lastmod.json — commit it.");
} else {
  process.exitCode = 1;
}
