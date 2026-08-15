"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

const reducedVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

const pageTransition = {
  duration: 0.28,
  ease: [0.33, 1, 0.32, 1] as const,
};

const reducedTransition = {
  duration: 0.14,
  ease: "easeOut" as const,
};

/**
 * Persistent AnimatePresence host for App Router page transitions.
 * Lives in the root layout so exit animations are not torn down with the route.
 */
export function RoutePresence({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  return (
    <AnimatePresence mode="wait" initial>
      <motion.div
        key={pathname}
        initial="initial"
        animate="animate"
        exit="exit"
        variants={reduceMotion ? reducedVariants : pageVariants}
        transition={reduceMotion ? reducedTransition : pageTransition}
        style={{ minHeight: "100dvh" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
