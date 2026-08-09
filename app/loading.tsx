/**
 * Instant Suspense fallback for route segment streaming.
 * Complements the client TopLoadingBar during slower navigations.
 */
export default function Loading() {
  return (
    <div className="route-loading" aria-busy="true" aria-live="polite">
      <div
        className="top-loading-bar top-loading-bar--indeterminate"
        role="progressbar"
      >
        <div className="top-loading-bar__fill" />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
