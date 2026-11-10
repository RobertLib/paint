/* ==========================================================================
   Site settings for the landing-page generator (scripts/build-site.mjs).
   ========================================================================== */

export const SITE = {
  name: "Paint Studio",
  /**
   * Absolute address of the site root, with a trailing slash. Canonical URLs,
   * hreflang, Open Graph and the sitemap are built from it, and the build sets
   * the "id" of manifest.json to its path ("/paint/" here — the id resolves
   * against the origin, so it must name the path). Switching to a custom
   * domain is: change this, add a CNAME file, rebuild (which moves the
   * manifest id to the new path, e.g. "/"), update robots.txt — see README.
   */
  base: "https://robertlib.github.io/paint/",
  github: "https://github.com/RobertLib/paint",
  author: { name: "RobertLib", url: "https://github.com/RobertLib" },
  /** first language is the default (x-default) and lives at the root */
  languages: ["en", "cs"],
  locales: { en: "en_US", cs: "cs_CZ" },
  /** each language's name in that language, for the footer language links */
  languageNames: { en: "English", cs: "Čeština" },
  /**
   * Cookie-free page counting with GoatCounter (https://www.goatcounter.com).
   * Put your site code here (e.g. "paintstudio" for paintstudio.goatcounter.com)
   * and rebuild; empty means no analytics at all.
   */
  goatcounter: "",
  /** IndexNow key — the matching <key>.txt file sits in the site root. */
  indexNowKey: "44dadb76da4bea04edd7c6e87c81f22c",
};
