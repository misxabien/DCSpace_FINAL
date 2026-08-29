"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const PRESS_MS = 90;
const PRESS_SELECTOR =
  'a[href], button:not([aria-haspopup]):not(.toolbar-select):not(.att-month-btn):not(.att-select), [role="button"]:not([aria-haspopup]), .cta, .btn, .continue-btn, .view-btn, .add-user-btn, input[type="submit"], input[type="button"]';

function clearPress(el: Element | null) {
  el?.classList.remove("is-pressing");
}

function isDropdownTrigger(el: Element | null) {
  if (!el) return false;
  return Boolean(
    el.closest(
      'button[aria-haspopup], .toolbar-select, .att-month-btn, .att-select, .admin-dd-wrap, .fb47-dd-wrap, .cert-dd-wrap, .att-month-wrap, .att-course-wrap, .att-org-wrap, .u27-dd-wrap',
    ),
  );
}

/**
 * Makes link/button presses feel immediate, then soft-navigates same-origin
 * links so AppMainTransition exit/enter animations are visible.
 */
export function SoftNavEnhancer() {
  const router = useRouter();
  const pending = useRef<number | null>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Legacy event cards call this for soft App Router navigation.
    window.__dcNavigate = (href: string) => {
      try {
        const next = new URL(href, window.location.href);
        if (next.origin === window.location.origin) {
          router.push(`${next.pathname}${next.search}${next.hash}`);
          return;
        }
      } catch {
        /* fall through */
      }
      window.location.assign(href);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const target = (event.target as HTMLElement | null)?.closest(PRESS_SELECTOR);
      if (!target) return;
      if (target.closest(".sidebar")) return;
      if (isDropdownTrigger(target)) return;
      if (target instanceof HTMLButtonElement && target.disabled) return;
      if (target instanceof HTMLInputElement && target.disabled) return;
      target.classList.add("is-pressing");
    };

    const onPointerUp = (event: PointerEvent) => {
      const target =
        (event.target as HTMLElement | null)?.closest(PRESS_SELECTOR) ?? null;
      // keep press class briefly so click handler can still see it
      window.setTimeout(() => clearPress(target), PRESS_MS + 40);
    };

    const onClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const rawTarget = event.target as HTMLElement | null;
      // Sidebar uses Next.js Link — native client nav is more reliable here.
      if (rawTarget?.closest(".sidebar")) {
        return;
      }
      // Never hijack filter / dropdown controls
      if (
        rawTarget?.closest(
          'button[aria-haspopup], .toolbar-select, .admin-dd-wrap, .fb47-dd-wrap, .cert-dd-wrap, .u27-dd-wrap, .att-month-wrap, .att-course-wrap, .att-org-wrap, .att-month-btn, .att-select',
        )
      ) {
        return;
      }

      const anchor = rawTarget?.closest("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (
        !href ||
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        href.startsWith("javascript:")
      ) {
        return;
      }
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }

      if (url.origin !== window.location.origin) return;
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search &&
        url.hash === window.location.hash
      ) {
        return;
      }

      // Soft client navigation so exit animation can run
      event.preventDefault();
      anchor.classList.add("is-pressing");

      if (pending.current) window.clearTimeout(pending.current);

      const go = () => {
        clearPress(anchor);
        router.push(`${url.pathname}${url.search}${url.hash}`);
      };

      if (reduce) {
        go();
        return;
      }

      pending.current = window.setTimeout(go, PRESS_MS);
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("pointercancel", onPointerUp, true);
    document.addEventListener("click", onClick, true);

    // Soft-route same-origin hard navigations from legacy scripts
    const loc = window.location;
    const originalAssign = loc.assign.bind(loc);
    const originalReplace = loc.replace.bind(loc);
    let patchedLocation = false;

    const softOrHard = (url: string | URL, hard: (u: string) => void) => {
      try {
        const next = new URL(String(url), loc.href);
        if (next.origin === loc.origin) {
          router.push(`${next.pathname}${next.search}${next.hash}`);
          return;
        }
      } catch {
        /* fall through */
      }
      hard(String(url));
    };

    try {
      loc.assign = ((url: string | URL) => {
        softOrHard(url, originalAssign);
      }) as typeof loc.assign;
      loc.replace = ((url: string | URL) => {
        softOrHard(url, originalReplace);
      }) as typeof loc.replace;
      patchedLocation = true;
    } catch {
      /* some browsers lock Location methods */
    }

    return () => {
      if (window.__dcNavigate) delete window.__dcNavigate;
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("pointercancel", onPointerUp, true);
      document.removeEventListener("click", onClick, true);
      if (pending.current) window.clearTimeout(pending.current);
      if (patchedLocation) {
        try {
          loc.assign = originalAssign;
          loc.replace = originalReplace;
        } catch {
          /* ignore */
        }
      }
    };
  }, [router]);

  return null;
}

declare global {
  interface Window {
    __dcNavigate?: (href: string) => void;
  }
}
