import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseReady = Boolean(config.databaseURL);

let app = null;
let db = null;
if (firebaseReady) {
  app = initializeApp(config);
  db = getDatabase(app);
} else {
  // Missing env vars (e.g. running `npm run dev` before Firebase is configured) — the
  // storage adapter checks firebaseReady and falls back to a clear error rather than
  // crashing on a null database handle.
  console.warn("[firebase] VITE_FIREBASE_DATABASE_URL is not set — shared sector data will not load or save. See README.md.");
}

export { db };
