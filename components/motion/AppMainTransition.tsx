"use client";

/**
 * Main column wrapper — no exit overlay so sidebar stays clickable.
 * Page content remounts via route segment keys in legacy pages.
 */
export function AppMainTransition({ children }: { children: React.ReactNode }) {
  return <div className="app-main-transition">{children}</div>;
}
