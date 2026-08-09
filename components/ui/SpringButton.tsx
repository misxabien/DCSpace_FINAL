"use client";

import { forwardRef } from "react";

const SPRING =
  "spring-press active:scale-95 transition-transform duration-150 ease-out";

type SpringButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  className?: string;
};

/**
 * iOS-style spring press button.
 * Utility: `.spring-press` — or apply the same Tailwind classes directly.
 */
export const SpringButton = forwardRef<HTMLButtonElement, SpringButtonProps>(
  function SpringButton({ className = "", type = "button", ...props }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        className={[SPRING, className].filter(Boolean).join(" ")}
        {...props}
      />
    );
  }
);

/** Class string for non-button elements that should feel like an iOS press. */
export const springPressClassName = SPRING;
