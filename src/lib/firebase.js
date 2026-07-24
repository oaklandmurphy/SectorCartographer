import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth, signInAnonymously } from "firebase/auth";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

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

// Resolves once this browser holds an anonymous auth token. The database rules
// require auth for writes (world-readable, but not world-writable — see
// database.rules.json), so every write path awaits this before calling
// update()/set(). Reads don't need it and start immediately.
export let authReady = Promise.resolve();

let app = null;
let db = null;
if (firebaseReady) {
  app = initializeApp(config);
  db = getDatabase(app);

  // App Check proves a write came from this app running in a real browser, not
  // a script that pulled the config values out of the public JS bundle and is
  // hitting the database REST API directly. Optional: without a site key the
  // app still works, it just skips this layer (e.g. local dev before it's set
  // up). See README.md for how to register one.
  const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
  if (recaptchaSiteKey) {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(recaptchaSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } else {
    console.warn("[firebase] VITE_RECAPTCHA_SITE_KEY is not set — App Check is disabled. See README.md.");
  }

  // Silent, no UI: every visitor gets an anonymous token so the .write rule
  // (auth != null) passes, without adding a login step to what is otherwise a
  // link-and-edit-code app.
  authReady = signInAnonymously(getAuth(app)).catch((e) => {
    console.error("[firebase] anonymous sign-in failed — writes will be rejected by the database rules until this succeeds", e);
  });
} else {
  // Missing env vars (e.g. running `npm run dev` before Firebase is configured) — the
  // sector repo checks firebaseReady and falls back to a clear error rather than
  // crashing on a null database handle.
  console.warn("[firebase] VITE_FIREBASE_DATABASE_URL is not set — shared sector data will not load or save. See README.md.");
}

export { db, app };
