"use client";

import { EMPTY_STATE_ICON } from "@/lib/ui/empty-state";

type EmptyStateProps = {
  title: string;
  description: string;
  compact?: boolean;
  section?: boolean;
  className?: string;
};

/** Illustrated empty state used across student, organizer, and admin screens. */
export function EmptyState({
  title,
  description,
  compact = false,
  section = false,
  className = "",
}: EmptyStateProps) {
  const sizeClass = section
    ? " dc-empty-state--section"
    : compact
      ? " dc-empty-state--compact"
      : "";

  return (
    <div className={`dc-empty-state${sizeClass}${className ? ` ${className}` : ""}`} role="status">
      <img
        className="dc-empty-state__icon"
        src={EMPTY_STATE_ICON}
        width={160}
        height={161}
        alt=""
        aria-hidden="true"
      />
      <h3 className="dc-empty-state__title">{title}</h3>
      <p className="dc-empty-state__description">{description}</p>
    </div>
  );
}

/** @deprecated Use default EmptyState icon — kept for existing imports. */
export const ORGANIZED_EMPTY_STATE_ICON = EMPTY_STATE_ICON;
