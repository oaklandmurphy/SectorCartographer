// Cloud Storage for the two blob types that used to ride inline in the
// Realtime Database tree: wiki-entry images and ship-art SVGs (see
// codexImage.js / shipArt.js). Moving them here means a viewer only fetches
// one when it's actually rendered — a normal cached HTTP request, not a
// forced part of every session's tree sync — and drops the ~33% base64
// inflation of storing them as data URIs.
import { getStorage, ref as storageRef, uploadString, uploadBytes, getDownloadURL } from "firebase/storage";
import { app, firebaseReady, authReady } from "./firebase.js";

let storage = null;
if (firebaseReady) storage = getStorage(app);

// `dataUri` in, a long-lived download URL out. Used for wiki images, which
// processImage() already produced as a data: URI (see codexImage.js).
export async function uploadDataUri(path, dataUri) {
  if (!storage) throw new Error("Firebase is not configured");
  await authReady; // storage.rules requires auth != null, same as the database
  const r = storageRef(storage, path);
  await uploadString(r, dataUri, "data_url");
  return getDownloadURL(r);
}

// Raw text in (ship-art SVG source), same auth/URL handling.
export async function uploadText(path, text, contentType) {
  if (!storage) throw new Error("Firebase is not configured");
  await authReady;
  const r = storageRef(storage, path);
  await uploadBytes(r, new Blob([text], { type: contentType }));
  return getDownloadURL(r);
}
