/* ==========================================================================
   HEIC / HEIF (iPhone photos).

   Safari decodes HEIC natively, so this module only runs elsewhere. It loads
   libheif (compiled to WebAssembly, ~2 MB; it reads 8-bit photos as well as
   the 10- and 12-bit ones of HDR cameras and macOS "Convert to HEIF") from
   jsDelivr, pinned to an exact version and an integrity hash. Decoding
   happens on this device; the photo is never sent anywhere.

   Every photo gets a fresh decoder in a worker of its own, which is ended
   afterwards: a decoder that broke on one photo cannot spoil the next, the
   page stays responsive while a big photo decodes, and a decode that hangs
   can really be stopped (its memory goes with it). The script itself is
   downloaded once per page and comes from the HTTP cache after that.
   ========================================================================== */

const SRC = "https://cdn.jsdelivr.net/npm/libheif-js@1.23.5/libheif-wasm/libheif-bundle.js";
const INTEGRITY = "sha384-QYMUACFeOR9DQlmZGsI+VXolKAMA0hYyiOXLSyd8o5rgrg9L+aKyRZCiiY7RNhPF";

/** Give up on a download that has not finished after this long. */
const LOAD_TIMEOUT = 20000;
/** Give up on a decode after this long: a base plus time per megabyte. */
const decodeTimeout = (bytes) => Math.min(180000, 30000 + (bytes / 1048576) * 8000);

/**
 * Why a photo could not be decoded: `kind` is "download" when the decoder
 * could not be fetched (offline, blocked) and "decode" when it ran but could
 * not read the file (or took too long).
 */
export class HeicError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = "HeicError";
    this.kind = kind;
  }
}

/**
 * Runs after the library in the worker: decodes the primary image of the
 * file it is sent to 8-bit RGBA (libheif converts deeper images and applies
 * rotation and mirroring) and posts { width, height, data } back.
 */
const WORKER = `
self.onmessage = async (e) => {
  try {
    const lib = typeof libheif === "function" ? await libheif() : libheif;
    const images = new lib.HeifDecoder().decode(new Uint8Array(e.data));
    const image = images.find((i) => i.is_primary()) || images[0];
    if (!image) throw new Error("No image in the file");
    const width = image.get_width();
    const height = image.get_height();
    const out = { data: new Uint8ClampedArray(width * height * 4), width, height };
    const ok = await new Promise((resolve) => image.display(out, resolve));
    if (!ok) throw new Error("The image could not be decoded");
    self.postMessage({ width, height, data: out.data }, [out.data.buffer]);
  } catch (err) {
    self.postMessage({ error: String((err && err.message) || err || "HEIC decoding failed") });
  }
};`;

/** Object URL of the worker script (library + WORKER), once downloaded. */
let workerUrl = null;

async function loadWorkerUrl() {
  if (workerUrl) return workerUrl;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), LOAD_TIMEOUT);
  let lib = "";
  try {
    // (an integrity mismatch fails like a download that did not arrive)
    const res = await fetch(SRC, { integrity: INTEGRITY, signal: abort.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    lib = await res.text();
  } catch {
    throw new HeicError(
      "download",
      abort.signal.aborted ? "HEIC decoder download timed out" : "HEIC decoder could not be downloaded"
    );
  } finally {
    clearTimeout(timer);
  }
  workerUrl ||= URL.createObjectURL(new Blob([lib, "\n", WORKER], { type: "text/javascript" }));
  return workerUrl;
}

/**
 * Decode a HEIC/HEIF file to an ImageBitmap (the primary image of the file);
 * the caller closes it. Always settles; rejects with a HeicError.
 */
export async function decodeHeic(file) {
  const url = await loadWorkerUrl();
  let worker = null;
  let timer = 0;
  try {
    const buffer = await file.arrayBuffer();
    worker = new Worker(url);
    const out = await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new HeicError("decode", "HEIC decoding timed out")), decodeTimeout(file.size || 0));
      worker.onmessage = (e) => resolve(e.data);
      worker.onerror = (e) => reject(new HeicError("decode", String(e.message || "HEIC decoder failed")));
      worker.postMessage(buffer, [buffer]);
    });
    if (out?.error) throw new HeicError("decode", out.error);
    if (!out?.width || !out?.height || !out.data) throw new HeicError("decode", "HEIC decoder returned no image");
    return await createImageBitmap(new ImageData(out.data, out.width, out.height));
  } catch (err) {
    throw err instanceof HeicError ? err : new HeicError("decode", String(err?.message || err || "HEIC decoding failed"));
  } finally {
    clearTimeout(timer);
    // ends a decode that is still running and frees the decoder's memory
    worker?.terminate();
  }
}
