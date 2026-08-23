"use client";

import styles from "@/components/ui/EmptyState.module.css";

type EmptyStateProps = {
  title: string;
  description: string;
  compact?: boolean;
};

/** Illustrated empty state matching Home (calendar + message). */
export function EmptyState({ title, description, compact = false }: EmptyStateProps) {
  return (
    <div
      className={`${styles.emptyState}${compact ? ` ${styles.compact}` : ""}`}
      role="status"
    >
      <img
        className={styles.icon}
        src="/no-event.svg"
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
