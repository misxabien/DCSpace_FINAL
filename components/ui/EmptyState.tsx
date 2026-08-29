"use client";

import styles from "@/components/ui/EmptyState.module.css";

export const ORGANIZED_EMPTY_STATE_ICON = "/no-organized-events.svg";

type EmptyStateProps = {
  title: string;
  description: string;
  compact?: boolean;
  iconSrc?: string;
};

/** Illustrated empty state matching Home (calendar + message). */
export function EmptyState({
  title,
  description,
  compact = false,
  iconSrc = "/no-event.svg",
}: EmptyStateProps) {
  return (
    <div
      className={`${styles.emptyState}${compact ? ` ${styles.compact}` : ""}`}
      role="status"
    >
      <img
        className={styles.icon}
        src={iconSrc}
        width={160}
        height={160}
        alt=""
        aria-hidden="true"
      />
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.description}>{description}</p>
    </div>
  );
}
