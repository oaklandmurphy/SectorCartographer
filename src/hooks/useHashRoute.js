import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_ROUTE, formatHash, parseHash } from "../lib/routing.js";

// The current page, read from and written to the URL hash. See lib/routing.js
// for the shape of a route and why it lives in the hash.
//
// Returns [route, navigate]. `navigate` takes a patch — an object, or a
// function of the current route returning one — and pushes a history entry for
// it. Pass { replace: true } for a move the user shouldn't have to press Back
// through (e.g. clearing a selection because the thing was deleted).
//
// Every navigation must be a single `navigate` call: two calls in one handler
// are two Back presses for what the user did once.
export function useHashRoute() {
  const [route, setRoute] = useState(() => ({ ...DEFAULT_ROUTE, ...parseHash(window.location.hash) }));

  // Mirrors `route` for `navigate` to read, so that back-to-back navigations in
  // one tick compound instead of both building on a stale render's value.
  const routeRef = useRef(route);

  const apply = useCallback((next) => {
    routeRef.current = next;
    setRoute(next);
  }, []);

  useEffect(() => {
    // Back/forward, and anyone typing in the address bar. hashchange covers
    // both; popstate is belt-and-braces, and the guard keeps the pair from
    // rendering twice for one move.
    const sync = () => {
      const next = { ...routeRef.current, ...parseHash(window.location.hash) };
      if (formatHash(next) !== formatHash(routeRef.current)) apply(next);
    };
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, [apply]);

  const navigate = useCallback((patch, opts = {}) => {
    const cur = routeRef.current;
    const next = { ...cur, ...(typeof patch === "function" ? patch(cur) : patch) };
    const hash = formatHash(next);

    // Same page: still store `next` (it may carry a remembered codex/fleet
    // position the URL doesn't spell out) but don't touch history — clicking
    // the tab you're already on shouldn't cost a Back press.
    if (hash === formatHash(cur)) { apply(next); return; }

    // pathname + search keep ?sector= (lib/storage.js) and any host subpath intact.
    const url = window.location.pathname + window.location.search + hash;
    if (opts.replace) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
    apply(next);
  }, [apply]);

  return [route, navigate];
}
