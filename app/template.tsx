/**
 * Remounts on navigation (App Router template convention).
 * Resets child Client Component state; page enter/exit motion is handled by
 * `RoutePresence` (AnimatePresence) in the root layout.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return children;
}
