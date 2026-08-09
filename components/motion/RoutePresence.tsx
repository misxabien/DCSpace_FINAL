"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";

const pageVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

const pageTransition = {
  duration: 0.2,
  ease: [0.25, 0.1, 0.25, 1] as const,
};

/**
 * Persistent AnimatePresence host for App Router page transitions.
 * Lives in the root layout so exit animations are not torn down with the route.
 * `app/template.tsx` remounts underneath for state reset on navigation.
 */
export function RoutePresence({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial="initial"
        animate="animate"
        exit="exit"
        variants={pageVariants}
        transition={pageTransition}
        style={{ minHeight: "100dvh" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
