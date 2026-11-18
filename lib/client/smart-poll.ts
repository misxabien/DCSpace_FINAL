/**
 * Background refresh for portal pages.
 *
 * Calls `fn` every `ms`, but:
 *  - skips ticks while the tab / Android app is hidden (screen off, other app),
 *  - never starts a new call while the previous one is still running,
 *  - refreshes once right away when the page becomes visible again after a skip.
 *
 * Returns a stop function for effect cleanup.
 */
export function startSmartPoll(fn: () => unknown, ms: number): () => void {
  let running = false;
  let missed = false;
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    if (document.hidden) {
      missed = true;
      return;
    }
    if (running) return;
    running = true;
    try {
      await fn();
    } catch {
      /* callers handle their own errors */
    } finally {
      running = false;
    }
  };

  const timer = window.setInterval(() => void tick(), ms);
  const onVisibility = () => {
    if (!document.hidden && missed) {
      missed = false;
      void tick();
    }
  };
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    stopped = true;
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
