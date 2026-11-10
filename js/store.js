/* ==========================================================================
   Tiny IndexedDB key-value store.

   Shared by the editor (autosave) and the landing pages (handing a dropped
   file over to the editor). Everything stays in this browser's storage — it
   is the same origin, never a server. The plain calls always resolve, even
   when storage is unavailable (private windows, blocked site data): failures
   read as null. The strict ones (idbRead, idbUpdate) reject instead, for
   callers that must not mistake a failure for an empty slot.
   ========================================================================== */

const DB = "paint-studio";
const STORE = "kv";

let dbPromise = null;

/** Open (once) — with a timeout: some Safari versions never answer open(). */
function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    let settled = false;
    const done = (db) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // a failed or hung open is retried on the next call
      if (!db) dbPromise = null;
      resolve(db);
    };
    const timer = setTimeout(() => done(null), 4000);
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => {
        const db = req.result;
        // another tab upgrading the database, or Safari dropping the
        // connection: forget this handle and open a fresh one next time
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        db.onclose = () => {
          dbPromise = null;
        };
        done(db);
      };
      req.onerror = () => done(null);
      req.onblocked = () => done(null);
    } catch {
      done(null);
    }
  });
  return dbPromise;
}

/**
 * One transaction: `fn` issues the requests and returns the one whose result
 * is wanted. Lenient calls read every failure as null; strict ones resolve
 * with the plain result (undefined for a missing key) and reject on failure.
 */
function run(mode, fn, strict = false) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const fail = (err) => (strict ? reject(err || new Error("IndexedDB is unavailable")) : resolve(null));
        if (!db) return fail();
        try {
          const tx = db.transaction(STORE, mode);
          const req = fn(tx.objectStore(STORE));
          tx.oncomplete = () => resolve(strict ? req?.result : req?.result ?? null);
          tx.onerror = () => fail(tx.error);
          tx.onabort = () => fail(tx.error);
        } catch (err) {
          // "connection is closing" and friends: reopen on the next call
          dbPromise = null;
          fail(err);
        }
      })
  );
}

export const idbGet = (key) => run("readonly", (s) => s.get(key));
export const idbSet = (key, value) => run("readwrite", (s) => s.put(value, key));
export const idbDelete = (key) => run("readwrite", (s) => s.delete(key));

/** Strict read: undefined when the key is missing, a rejection when storage fails. */
export const idbRead = (key) => run("readonly", (s) => s.get(key), true);

/**
 * Read `key` and write what `fn(value)` returns — an object of key → value
 * pairs — in one transaction: the writes land together or not at all (a
 * full disk), and no other tab can write in between. Resolves with the value
 * that was read; rejects when storage is unavailable or the writes fail.
 */
export const idbUpdate = (key, fn) =>
  run(
    "readwrite",
    (s) => {
      const req = s.get(key);
      req.onsuccess = () => {
        for (const [k, value] of Object.entries(fn(req.result) || {})) s.put(value, k);
      };
      return req;
    },
    true
  );

/** Delete the entries under keys starting with `prefix` for which `stale(value)` is true. */
export const idbSweep = (prefix, stale) =>
  run("readwrite", (s) => {
    const req = s.openCursor(IDBKeyRange.bound(prefix, `${prefix}\uffff`));
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      if (stale(cursor.value)) cursor.delete();
      cursor.continue();
    };
    return null;
  });

/**
 * Key prefix under which a landing page leaves a file for the editor to
 * open. Every drop gets a key of its own (`handoff:<id>`, the id travels in
 * the editor URL as ?open=<id>), so two tabs never take each other's file;
 * pages from before that used this key alone, with ?open=1.
 */
export const HANDOFF_KEY = "handoff";
/** How long a handed-over file stays valid (a reload later must not reopen it). */
export const HANDOFF_TTL = 10 * 60 * 1000;
/** The storage key for hand-over `id`, or null when `id` is not one. */
export const handoffKey = (id) => (/^[a-z0-9-]{1,40}$/i.test(id || "") ? `${HANDOFF_KEY}:${id}` : null);
