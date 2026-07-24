// A codex entry can carry one raster image. This module only handles turning a
// picked file into a bounded data: URI — downscaled to a sane maximum
// dimension and re-encoded to WebP (which keeps transparency and is far
// smaller than PNG/JPEG), bringing a page image down to tens of KB. Anything
// still over the cap after that is rejected with a clear message rather than
// quietly producing an oversized upload.
//
// The caller (WikiView.jsx) uploads that data URI to Cloud Storage via
// lib/firebaseStorage.js and stores the resulting download URL on the entry —
// not the image bytes — so the picture only reaches a browser when the entry
// is actually opened (a normal cached <img> fetch), rather than riding along
// in every session's sector sync the way an inline blob would.
//
// SECURITY: the stored value is only ever shown through <img src="…">, which
// renders image bytes and nothing else — it will not run scripts even though
// the upload path (like the database) is world-writable given a valid auth
// token. Do not switch to any HTML/inline render.

export const MAX_IMAGE_DIM = 1600;          // longest side in px — ample for a page image
export const MAX_IMAGE_BYTES = 1024 * 1024; // ~1MB of data URI, measured after downscaling

// Only genuine raster formats; SVG is deliberately excluded (it's a different,
// markup-based path and the user asked for raster images).
const RASTER_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export function isRasterImage(file) {
  return !!file && RASTER_TYPES.includes(file.type);
}

// Decode a File into an HTMLImageElement through a short-lived object URL.
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode failed")); };
    img.src = url;
  });
}

// Downscale + re-encode a picked raster file into a bounded data URI.
// Resolves to { dataUri } on success, or { error } with a human-readable message.
export async function processImage(file) {
  if (!isRasterImage(file)) {
    return { error: "not a supported image — use PNG, JPG, WebP or GIF" };
  }
  let img;
  try {
    img = await loadImage(file);
  } catch {
    return { error: "that image file could not be read" };
  }
  const { width, height } = img;
  if (!width || !height) return { error: "that image has no dimensions" };

  const scale = Math.min(1, MAX_IMAGE_DIM / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { error: "your browser could not process the image" };
  ctx.drawImage(img, 0, 0, w, h);

  // WebP keeps alpha and is much smaller than PNG; a browser that can't encode it
  // hands back a PNG data URI, which we take as-is.
  let dataUri = canvas.toDataURL("image/webp", 0.85);
  if (!dataUri.startsWith("data:image/webp")) dataUri = canvas.toDataURL("image/png");

  // Data-URI length is ~1 char/byte for its base64 body — a fine size proxy.
  if (dataUri.length > MAX_IMAGE_BYTES) {
    return { error: `image is too detailed to store (over ${Math.round(MAX_IMAGE_BYTES / 1024)}KB after resizing) — try a simpler or smaller picture` };
  }
  return { dataUri };
}
