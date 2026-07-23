// Forces stale tabs to pick up new deploys.
//
// This is a GM/player map tool: people leave a tab open for a whole session.
// Live Firebase data reaches them regardless (see the subscription in App.jsx),
// but a code change — like a bugfix to the visibility/hiding logic — only ever
// reaches a tab that reloads. Without this, players who don't manually refresh
// keep running whatever bundle was current when they opened the tab, silently
// diverging from everyone who has.
//
// Detects a new deploy by re-fetching index.html (Firebase Hosting serves it
// with Cache-Control: no-cache, see firebase.json) and diffing it against the
// copy captured at startup. Vite content-hashes the built script/css filenames,
// so any code or style change changes this text even though the route is the
// same. On a mismatch we reload immediately, unless the user is mid-keystroke
// in a text field (wiki entries, notes, etc. have no autosave-in-progress
// indicator we can check), in which case we wait for them to leave the field
// before forcing it — "force" shouldn't mean "eat someone's paragraph".

const CHECK_INTERVAL_MS = 60_000;

function isTextEntryFocused() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

export function startAutoReload() {
  if (import.meta.env.DEV) return; // dev server HTML/HMR churns constantly — not a "new deploy"

  let baseline = null;
  let reloadPending = false;

  const fetchIndex = () => fetch("./index.html", { cache: "no-store" }).then((r) => r.text());

  const reloadWhenSafe = () => {
    if (reloadPending) return;
    reloadPending = true;
    const tryReload = () => {
      if (isTextEntryFocused()) setTimeout(tryReload, 2000);
      else location.reload();
    };
    tryReload();
  };

  const checkNow = () => {
    if (baseline == null || document.hidden) return;
    fetchIndex()
      .then((html) => { if (html !== baseline) reloadWhenSafe(); })
      .catch(() => {}); // offline / hosting hiccup — just try again next tick
  };

  fetchIndex().then((html) => { baseline = html; }).catch(() => {});

  setInterval(checkNow, CHECK_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) checkNow(); });
}
