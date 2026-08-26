"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    DCWebsiteTour?: {
      start: (from?: Element | null) => void;
      close: () => void;
      bind?: () => void;
    };
  }
}

const HELP_BUTTON_SELECTOR =
  '.tool-btn--help, .icon-btn.help, [aria-label="Help"], [aria-label="Tutorial"]';

const SITE_TOUR_VERSION = "20260826c";

function loadSiteTourScript(): Promise<void> {
  const existing = document.querySelector<HTMLScriptElement>('script[data-site-tour]');
  if (
    existing?.dataset.siteTour === SITE_TOUR_VERSION &&
    window.DCWebsiteTour?.start
  ) {
    return Promise.resolve();
  }

  if (existing) existing.remove();

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `/site-tour.js?v=${SITE_TOUR_VERSION}`;
    script.async = true;
    script.dataset.siteTour = SITE_TOUR_VERSION;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load site tour"));
    document.body.appendChild(script);
  });
}

/** Loads the page tour script so Help / Tutorial (?) buttons work on student and admin pages. */
export function SiteTourLoader() {
  useEffect(() => {
    let cancelled = false;

    void loadSiteTourScript()
      .then(() => {
        if (!cancelled) window.DCWebsiteTour?.bind?.();
      })
      .catch(() => {
        /* Tour is progressive enhancement; ignore load failures. */
      });

    const onHelp = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const button = target?.closest<HTMLElement>(HELP_BUTTON_SELECTOR);
      if (!button) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      void loadSiteTourScript().then(() => {
        if (cancelled || !window.DCWebsiteTour?.start) return;
        window.DCWebsiteTour.bind?.();
        window.DCWebsiteTour.start(button);
      });
    };

    const onContentReady = () => {
      window.DCWebsiteTour?.bind?.();
    };

    document.addEventListener("click", onHelp, true);
    document.addEventListener("dc-legacy-content-ready", onContentReady);
    return () => {
      cancelled = true;
      document.removeEventListener("click", onHelp, true);
      document.removeEventListener("dc-legacy-content-ready", onContentReady);
    };
  }, []);

  return null;
}
