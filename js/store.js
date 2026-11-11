/* ==========================================================================
   Tiny IndexedDB key-value store.

   Shared by the editor (autosave) and the landing pages (handing a dropped
   file over to the editor). Everything stays in this browser's storage — it
   is the same origin, never a server. The plain calls always resolve, even
   when storage is unavailable (private windows, blocked site data): failures
   read as null. The strict ones (idbRead, idbReadMany, idbUpdate) reject
   instead, for callers that must not mistake a failure for an empty slot.
   ========================================================================== */

const DB = "paint-studio";
const STORE = "kv";
/** How long open() waits for an answer: some Safari versions never give one. */
const OPEN_TIMEOUT = 4000;
/** After a failed or unanswered open, calls fail at once for this long. */
const RETRY_AFTER = 30000;

let dbPromise = null;
let failedAt = -Infinity;

/**
 * Open (once). A failed or hung open is not retried by every call — each would
 * wait the whole timeout again — but only after RETRY_AFTER; and an open that
 * answers late is still put to use.
 */
function open() {
  if (dbPromise) return dbPromise;
  if (Date.now() - failedAt < RETRY_AFTER) return Promise.resolve(null);
  let settled = false;
  let attempt = null;
  attempt = new Promise((resolve) => {
    const done = (db) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (!db) {
        failedAt = Date.now();
        if (dbPromise === attempt) dbPromise = null;
      }
      resolve(db);
    };
    const timer = setTimeout(() => done(null), OPEN_TIMEOUT);
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => {
        const db = req.result;
        const forget = () => {
          if (dbPromise === ready) dbPromise = null;
        };
        const ready = Promise.resolve(db);
        // another tab upgrading the database, or Safari dropping the
        // connection: forget this handle and open a fresh one next time
        db.onversionchange = () => {
          db.close();
          forget();
        };
        db.onclose = forget;
        if (!settled) {
          dbPromise = ready;
          done(db);
        } else if (!dbPromise) {
          // answered after the timeout: use it from now on
          failedAt = -Infinity;
          dbPromise = ready;
        } else {
          db.close();
        }
      };
      req.onerror = () => done(null);
      req.onblocked = () => done(null);
    } catch {
      done(null);
    }
  });
  // (an open that failed on the spot leaves nothing behind to wait for)
  if (!settled) dbPromise = attempt;
  return attempt;
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

/** Issue a get for every key; `done(values)` runs once all have answered. */
function getAll(s, keys, done) {
  const values = new Array(keys.length);
  let left = keys.length;
  keys.forEach((k, i) => {
    const req = s.get(k);
    req.onsuccess = () => {
      values[i] = req.result;
      if (--left === 0) done(values);
    };
  });
}

/**
 * Strict read of several keys in one transaction (one consistent snapshot):
 * an array of values, undefined where a key is missing; rejects when storage
 * fails.
 */
export function idbReadMany(keys) {
  let values = [];
  return run("readonly", (s) => getAll(s, keys, (v) => (values = v)), true).then(() => values);
}

/** Lenient idbReadMany: every value reads as null when storage fails. */
export const idbGetMany = (keys) =>
  idbReadMany(keys).then(
    (values) => values.map((v) => v ?? null),
    () => keys.map(() => null)
  );

/**
 * Read `key` — or every key of an array of keys — and write what
 * `fn(value)` (`fn(values)`) returns, an object of key → value pairs, in one
 * transaction: the writes land together or not at all (a full disk), and no
 * other tab can write in between. A value of undefined deletes its key.
 * Resolves with what was read; rejects when storage is unavailable or the
 * writes fail.
 */
export function idbUpdate(key, fn) {
  const many = Array.isArray(key);
  const keys = many ? key : [key];
  let read;
  return run(
    "readwrite",
    (s) =>
      getAll(s, keys, (values) => {
        read = many ? values : values[0];
        for (const [k, value] of Object.entries(fn(read) || {})) {
          if (value === undefined) s.delete(k);
          else s.put(value, k);
        }
      }),
    true
  ).then(() => read);
}

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
