/* ==========================================================================
   HEIC / HEIF (iPhone photos).

   Safari decodes HEIC natively, so this module only runs elsewhere. It loads
   the heic2any decoder (libheif compiled to WebAssembly, ~1.3 MB) from
   jsDelivr the first time it is needed, pinned to an exact version and an
   integrity hash. Decoding happens in this tab; the photo is never sent
   anywhere.
   ========================================================================== */

const SRC = "https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js";
const INTEGRITY = "sha384-OTofQ0MEeiSgh62havBcemCIK0gqj809wX6UA0uPISNMRnR6NZyCdGzX3SbLrgwL";

let loading = null;

function loadDecoder() {
  if (window.heic2any) return Promise.resolve(window.heic2any);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SRC;
    s.integrity = INTEGRITY;
    s.crossOrigin = "anonymous";
    s.async = true;
    s.onload = () =>
      window.heic2any ? resolve(window.heic2any) : reject(new Error("HEIC decoder unavailable"));
    s.onerror = () => {
      loading = null;
      reject(new Error("HEIC decoder could not be downloaded"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** Decode a HEIC/HEIF file to a PNG Blob (the first image of the file). */
export async function decodeHeic(file) {
  const heic2any = await loadDecoder();
  const out = await heic2any({ blob: file, toType: "image/png" });
  return Array.isArray(out) ? out[0] : out;
}
