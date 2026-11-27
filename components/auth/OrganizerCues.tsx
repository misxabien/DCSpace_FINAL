"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import styles from "./OrganizerCues.module.css";

export function ProfileOrganizerBadge() {
  const { isOrganizer, loading } = useAuth();

  if (loading || !isOrganizer) return null;

  return (
    <div className={styles.badgeWrap} role="status">
      <span className={styles.badge}>Student Organizer</span>
    </div>
  );
}
