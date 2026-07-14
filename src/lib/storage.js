import { ref, get as dbGet, set as dbSet, remove as dbRemove } from "firebase/database";
import { db, firebaseReady } from "./firebase.js";

// URL param lets one Firebase project host several independent sector maps
// (e.g. https://yoursite.com/?sector=campaign-two) without extra setup.
const params = new URLSearchParams(window.location.search);
const SECTOR_ID = (params.get("sector") || "default").replace(/[.#$/[\]]/g, "-");

function path(key) {
  return `sectors/${SECTOR_ID}/${key}`;
}

// Mirrors the get/set/delete(key, shared) shape the map UI was built around:
// shared data (the map itself, the edit-lock code) lives in Firebase and is
// visible to everyone; personal data (the edit code *this* browser knows)
// stays in localStorage and never leaves the device.
export const storage = {
  async get(key, shared) {
    if (!shared) {
      const raw = localStorage.getItem(key);
      return raw === null ? null : { value: raw };
    }
    if (!firebaseReady) throw new Error("Firebase is not configured");
    const snap = await dbGet(ref(db, path(key)));
    return snap.exists() ? { value: snap.val() } : null;
  },
  async set(key, value, shared) {
    if (!shared) {
      localStorage.setItem(key, value);
      return true;
    }
    if (!firebaseReady) return false;
    await dbSet(ref(db, path(key)), value);
    return true;
  },
  async delete(key, shared) {
    if (!shared) {
      localStorage.removeItem(key);
      return true;
    }
    if (!firebaseReady) return false;
    await dbRemove(ref(db, path(key)));
    return true;
  },
};
