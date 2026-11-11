/* ==========================================================================
   HEIC / HEIF (iPhone photos).

   Safari decodes HEIC natively, so this module only runs elsewhere. It loads
   the heic2any decoder (libheif compiled to WebAssembly, ~1.3 MB) from
   jsDelivr, pinned to an exact version and an integrity hash. Decoding
   happens in this tab; the photo is never sent anywhere.

   heic2any keeps one decoder instance per page, and that instance can break
   for good on a photo (after a small image, every later one fails or never
   finishes). So every photo gets a fresh decoder in a hidden frame of its
   own, which is removed afterwards — that also stops a decode that hangs and
   gives its memory back. The script itself comes from the HTTP cache after
   the first download.
   ========================================================================== */

const SRC = "https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js";
const INTEGRITY = "sha384-OTofQ0MEeiSgh62havBcemCIK0gqj809wX6UA0uPISNMRnR6NZyCdGzX3SbLrgwL";

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

/** A fresh decoder in a hidden frame: { heic2any, dispose }. */
function loadDecoder() {
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.hidden = true;
    frame.tabIndex = -1;
    frame.setAttribute("aria-hidden", "true");
    const dispose = () => frame.remove();
    const fail = (message) => {
      clearTimeout(timer);
      frame.onload = null;
      dispose();
      reject(new HeicError("download", message));
    };
    const timer = setTimeout(() => fail("HEIC decoder download timed out"), LOAD_TIMEOUT);
    // the frame's load event waits for its script — or for the script's failure
    frame.onload = () => {
      clearTimeout(timer);
      let heic2any = null;
      try {
        heic2any = frame.contentWindow?.heic2any;
      } catch {
        /* not reachable */
      }
      if (typeof heic2any !== "function") return fail("HEIC decoder could not be downloaded");
      frame.onload = null;
      resolve({ heic2any, dispose });
    };
    frame.srcdoc = `<!doctype html><script src="${SRC}" integrity="${INTEGRITY}" crossorigin="anonymous"></script>`;
    document.body.appendChild(frame);
  });
}

/**
 * Decode a HEIC/HEIF file to a PNG Blob (the first image of the file).
 * Always settles; rejects with a HeicError.
 */
export async function decodeHeic(file) {
  const decoder = await loadDecoder();
  let timer = 0;
  try {
    const out = await Promise.race([
      Promise.resolve().then(() => decoder.heic2any({ blob: file, toType: "image/png" })),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new HeicError("decode", "HEIC decoding timed out")), decodeTimeout(file.size || 0));
      }),
    ]);
    const png = Array.isArray(out) ? out[0] : out;
    if (!png || typeof png.size !== "number" || !png.size) throw new HeicError("decode", "HEIC decoder returned no image");
    // a Blob of this page, so it outlives the frame
    return new Blob([png], { type: png.type || "image/png" });
  } catch (err) {
    // heic2any rejects with plain objects too ({ code, message })
    throw err instanceof HeicError ? err : new HeicError("decode", String(err?.message || err || "HEIC decoding failed"));
  } finally {
    clearTimeout(timer);
    decoder.dispose();
  }
}
