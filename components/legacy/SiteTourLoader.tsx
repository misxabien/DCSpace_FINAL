"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

declare global {
  interface Window {
    DCWebsiteTour?: { start: (from?: Element | null) => void; close: () => void };
  }
}

/** Loads the existing page tour script so Help buttons work on student and organizer pages. */
export function SiteTourLoader() {
  const pathname = usePathname();

  useEffect(() => {
    window.DCWebsiteTour?.close?.();
  }, [pathname]);

  useEffect(() => {
    if (!document.querySelector('script[data-site-tour="1"]')) {
      const script = document.createElement("script");
      script.src = "/site-tour.js";
      script.async = true;
      script.dataset.siteTour = "1";
      document.body.appendChild(script);
    }

    const onHelp = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const button = target?.closest<HTMLElement>('.tool-btn--help, [aria-label="Help"]');
      if (!button || !window.DCWebsiteTour?.start) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      window.DCWebsiteTour.start(button);
    };
    document.addEventListener("click", onHelp, true);
    return () => document.removeEventListener("click", onHelp, true);
  }, []);

  return null;
}
