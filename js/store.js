/* ==========================================================================
   Tiny IndexedDB key-value store.

   Shared by the editor (autosave) and the landing pages (handing a dropped
   file over to the editor). Everything stays in this browser's storage — it
   is the same origin, never a server. Every call resolves, even when storage
   is unavailable (private windows, blocked site data): failures read as null.
   ========================================================================== */

const DB = "paint-studio";
const STORE = "kv";

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function run(mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve) => {
        if (!db) return resolve(null);
        try {
          const tx = db.transaction(STORE, mode);
          const req = fn(tx.objectStore(STORE));
          tx.oncomplete = () => resolve(req?.result ?? null);
          tx.onerror = () => resolve(null);
          tx.onabort = () => resolve(null);
        } catch {
          resolve(null);
        }
      })
  );
}

export const idbGet = (key) => run("readonly", (s) => s.get(key));
export const idbSet = (key, value) => run("readwrite", (s) => s.put(value, key));
export const idbDelete = (key) => run("readwrite", (s) => s.delete(key));

/** Key under which a landing page leaves a file for the editor to open. */
export const HANDOFF_KEY = "handoff";
/** How long a handed-over file stays valid (a reload later must not reopen it). */
export const HANDOFF_TTL = 10 * 60 * 1000;
