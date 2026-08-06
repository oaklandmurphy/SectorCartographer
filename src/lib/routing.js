// Which page you're on, kept in the URL hash so it survives a reload, a share,
// and the browser's Back button.
//
// It's the *hash* rather than a real path (`#/codex/lore/wk_1`, not
// `/codex/lore/wk_1`) because of how this app gets deployed. The build uses
// relative asset URLs (`base: "./"` in vite.config.js) so it can be served from
// any host path and embedded in a Google Sites iframe; under a relative base a
// path deep-link would resolve its assets against `/codex/lore/` and 404 on a
// cold load, and it would need an SPA rewrite rule on every host it's dropped
// on. A hash costs nothing on any static host, and leaves `?sector=` (see
// lib/storage.js) readable beside it: `?sector=campaign-two#/codex/lore/wk_1`.
//
//   #/map
//   #/fleet · #/fleet/<fleetId> · #/fleet/<fleetId>/vs/<fleetId>
//   #/politics
//   #/codex · #/codex/<category> · #/codex/<category>/<entryId>
//   #/assets · #/assets/<factionId>
//   #/agents · #/agents/<factionId> · #/agents/<factionId>/<agentId>
//   #/odds
//   #/gmtools
//
// Map popups deliberately stay out of the URL: they're a click on a marker, not
// a page, and pushing one per click would bury the Back button. The odds tool's
// inputs stay out for the same reason — they're a scratch calculation, not a
// page worth linking to, and every keystroke would be a Back step.

import { WIKI_CATS } from "../constants.js";

export const TABS = ["map", "fleet", "politics", "codex", "timeline", "updates", "assets", "agents", "odds", "gmtools"];

export const DEFAULT_ROUTE = {
  tab: "map",
  cat: WIKI_CATS[0].id,
  wikiId: null,
  fleetId: null,   // null = whichever fleet FleetView falls back to
  compareId: null,
  assetFactionId: null, // null = whichever faction AssetsView falls back to
  assetSubtab: null, // null = no section deep-link; otherwise "resources"/"trackers"/"modifiers" to scroll to on arrival
  agentFactionId: null, // null = whichever faction AgentsView falls back to
  agentId: null, // null = whichever agent AgentsView falls back to; set when deep-linking to one (e.g. "Request Action" from the map or politics view)
};

const isTab = (t) => TABS.includes(t);
const isCat = (c) => WIKI_CATS.some((w) => w.id === c);

// Returns only the fields the URL actually pins down — a patch, not a whole
// route. Callers merge it over what they already have, which is what lets
// `#/map` forget nothing: bounce to the map and back to the codex and you land
// on the entry you were reading, exactly as the tabs behaved before there were
// URLs at all.
export function parseHash(hash) {
  const [tab, ...rest] = String(hash || "")
    .replace(/^#\/?/, "")
    .split("/")
    .filter(Boolean)
    .map((s) => {
      try { return decodeURIComponent(s); } catch { return s; }
    });

  if (!isTab(tab)) return { tab: DEFAULT_ROUTE.tab }; // no hash, or someone mangled it

  if (tab === "codex") {
    return { tab, cat: isCat(rest[0]) ? rest[0] : DEFAULT_ROUTE.cat, wikiId: rest[1] || null };
  }
  if (tab === "fleet") {
    return { tab, fleetId: rest[0] || null, compareId: rest[1] === "vs" ? rest[2] || null : null };
  }
  if (tab === "assets") {
    return { tab, assetFactionId: rest[0] || null, assetSubtab: rest[1] || null };
  }
  if (tab === "agents") {
    return { tab, agentFactionId: rest[0] || null, agentId: rest[1] || null };
  }
  return { tab };
}

export function formatHash(route) {
  const seg = [route.tab];
  if (route.tab === "codex") {
    seg.push(route.cat);
    if (route.wikiId) seg.push(route.wikiId);
  } else if (route.tab === "fleet" && route.fleetId) {
    seg.push(route.fleetId);
    if (route.compareId) seg.push("vs", route.compareId);
  } else if (route.tab === "assets" && route.assetFactionId) {
    seg.push(route.assetFactionId);
    if (route.assetSubtab) seg.push(route.assetSubtab);
  } else if (route.tab === "agents" && route.agentFactionId) {
    seg.push(route.agentFactionId);
    if (route.agentId) seg.push(route.agentId);
  }
  return `#/${seg.map(encodeURIComponent).join("/")}`;
}
