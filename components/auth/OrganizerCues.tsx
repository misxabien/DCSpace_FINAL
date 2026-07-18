"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import styles from "./OrganizerCues.module.css";

export function ProfileOrganizerBadge() {
  const { isOrganizer, user, loading } = useAuth();

  if (loading || !isOrganizer) return null;

  return (
    <div className={styles.badgeWrap} role="status">
      <span className={styles.badge}>Student Organizer</span>
      {user ? (
        <p className={styles.badgeHint}>
          Signed in as {user.name} ({user.email}). You have access to Events Organized.
        </p>
      ) : null}
    </div>
  );
}
