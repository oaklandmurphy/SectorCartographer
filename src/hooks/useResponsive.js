import { useEffect, useState } from "react";

// tracks the "(max-width: 768px)" breakpoint used to switch between the
// desktop toolbar/side-panel layout and the mobile drawer layout
export function useResponsive() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    try {
      const mq = window.matchMedia("(max-width: 768px)");
      setIsMobile(mq.matches);
      const handler = (e) => setIsMobile(e.matches);
      if (mq.addEventListener) mq.addEventListener("change", handler); else mq.addListener(handler);
      return () => { if (mq.removeEventListener) mq.removeEventListener("change", handler); else mq.removeListener(handler); };
    } catch (e) {
      // matchMedia unavailable — fall back to the desktop layout rather than crashing
    }
  }, []);
  return isMobile;
}
