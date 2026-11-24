/**
 * Admin pages are made of several independent "bridges" that each load the
 * same data (events, notifications, dashboard…) when a page opens. This wraps
 * window.fetch so identical GET requests to our own /api share one network
 * call: in flight, plus a short window after it completes.
 *
 * Safe by design:
 *  - only same-origin GET /api/… requests without an AbortSignal are shared;
 *  - any POST/PATCH/PUT/DELETE to /api clears everything (before and after),
 *    so data is never stale after a save;
 *  - each caller gets its own Response clone.
 */

const SHARE_WINDOW_MS = 2_000;

type Entry = { promise: Promise<Response>; settledAt: number | null };

let installed = false;

export function installApiFetchDedupe() {
  if (installed || typeof window === "undefined" || typeof window.fetch !== "function") return;
  installed = true;

  const originalFetch = window.fetch.bind(window);
  const entries = new Map<string, Entry>();

  const apiPath = (input: RequestInfo | URL): string | null => {
    try {
      const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const url = new URL(raw, window.location.href);
      if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) return null;
      return url.pathname + url.search;
    } catch {
      return null;
    }
  };

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const key = apiPath(input);
    if (!key) return originalFetch(input, init);

    const method = String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (method !== "GET") {
      entries.clear();
      const result = originalFetch(input, init);
      void result.finally(() => entries.clear()).catch(() => {});
      return result;
    }
    // Callers that can cancel their request (timeouts, aborts) keep it to themselves;
    // downloads stream large bodies and are not worth sharing.
    if (init?.signal || input instanceof Request) return originalFetch(input, init);
    if (/\/download(\/|$|\?)/.test(key)) return originalFetch(input, init);

    const now = Date.now();
    const existing = entries.get(key);
    if (existing && (existing.settledAt === null || now - existing.settledAt < SHARE_WINDOW_MS)) {
      return existing.promise.then((response) => response.clone());
    }

    const entry: Entry = { promise: originalFetch(input, init), settledAt: null };
    entries.set(key, entry);
    entry.promise.then(
      (response) => {
        if (!response.ok) {
          entries.delete(key);
          return;
        }
        entry.settledAt = Date.now();
        window.setTimeout(() => {
          if (entries.get(key) === entry) entries.delete(key);
        }, SHARE_WINDOW_MS);
      },
      () => {
        if (entries.get(key) === entry) entries.delete(key);
      },
    );
    return entry.promise.then((response) => response.clone());
  };
}
