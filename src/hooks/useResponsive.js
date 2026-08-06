import { useEffect, useState } from "react";

// tracks a max-width media query and returns whether it currently matches.
// Defaults to "(max-width: 768px)" — the breakpoint that switches between the
// desktop toolbar/side-panel layout and the mobile drawer layout — but callers
// can pass a wider query (e.g. to collapse a strip once the row gets cramped).
export function useResponsive(query = "(max-width: 768px)") {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    try {
      const mq = window.matchMedia(query);
      setMatches(mq.matches);
      const handler = (e) => setMatches(e.matches);
      if (mq.addEventListener) mq.addEventListener("change", handler); else mq.addListener(handler);
      return () => { if (mq.removeEventListener) mq.removeEventListener("change", handler); else mq.removeListener(handler); };
    } catch (e) {
      // matchMedia unavailable — fall back to the desktop layout rather than crashing
    }
  }, [query]);
  return matches;
}
