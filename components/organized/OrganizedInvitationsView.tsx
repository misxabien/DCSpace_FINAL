"use client";

import { useCallback, useEffect, useState } from "react";
import { OrganizedEventHeader } from "@/components/organized/OrganizedEventHeader";
import { InvitationTable } from "@/components/organized/InvitationTable";
import type { OrganizedEventDetail } from "@/lib/organizedEventDetails";
import type { InviteCandidate } from "@/lib/organizedInvitations";
import {
  fetchEventInvitationsLive,
  fetchInviteCandidatesLive,
} from "@/lib/organized/live";
import detailStyles from "@/components/organized/OrganizedDetail.module.css";
import styles from "@/components/organized/OrganizedInvitations.module.css";

export function OrganizedInvitationsView({ event }: { event: OrganizedEventDetail }) {
  const [students, setStudents] = useState<InviteCandidate[]>([]);
  const [faculty, setFaculty] = useState<InviteCandidate[]>([]);
  const [studentInviteState, setStudentInviteState] = useState<Record<string, boolean>>({});
  const [facultyInviteState, setFacultyInviteState] = useState<Record<string, boolean>>({});

  const applyInvitationState = useCallback(
    (
      studentRows: InviteCandidate[],
      facultyRows: InviteCandidate[],
      invitations: Array<{ email: string; userId?: string }>,
    ) => {
      const invitedEmails = new Set(
        invitations.map((row) => row.email.trim().toLowerCase()),
      );
      const invitedUserIds = new Set(
        invitations.map((row) => String(row.userId || "")).filter(Boolean),
      );
      const studentState: Record<string, boolean> = {};
      for (const row of studentRows) {
        studentState[row.id] =
          invitedUserIds.has(row.id) ||
          Boolean(row.email && invitedEmails.has(row.email.toLowerCase()));
      }
      const facultyState: Record<string, boolean> = {};
      for (const row of facultyRows) {
        facultyState[row.id] =
          invitedUserIds.has(row.id) ||
          Boolean(row.email && invitedEmails.has(row.email.toLowerCase()));
      }
      setStudentInviteState(studentState);
      setFacultyInviteState(facultyState);
    },
    [],
  );

  const loadInviteData = useCallback(async () => {
    try {
      const [studentRows, facultyRows, invitations] = await Promise.all([
        fetchInviteCandidatesLive("student"),
        fetchInviteCandidatesLive("faculty"),
        fetchEventInvitationsLive(event.id),
      ]);
      setStudents(studentRows);
      setFaculty(facultyRows);
      applyInvitationState(studentRows, facultyRows, invitations);
    } catch {
      setStudents([]);
      setFaculty([]);
      setStudentInviteState({});
      setFacultyInviteState({});
    }
  }, [applyInvitationState, event.id]);

  useEffect(() => {
    void loadInviteData();
  }, [loadInviteData]);

  useEffect(() => {
    const onChange = () => void loadInviteData();
    window.addEventListener("dc-invites-changed", onChange);
    return () => window.removeEventListener("dc-invites-changed", onChange);
  }, [loadInviteData]);

  return (
    <article className={`${detailStyles.page} ${styles.page}`}>
      <OrganizedEventHeader event={event} />

      <hr className={styles.divider} />

      <section className={styles.intro} aria-labelledby="exclusive-invitations">
        <h3 id="exclusive-invitations">Exclusive Invitations</h3>
        <p>
          Select and invite specific users to join this event. Invitations are managed exclusively
          by the organizer.
        </p>
      </section>

      <InvitationTable
        eventId={event.id}
        title="Invite a Student"
        numberLabel="STUDENT NUMBER"
        candidates={students}
        inviteState={studentInviteState}
        onInviteStateChange={setStudentInviteState}
      />

      <InvitationTable
        eventId={event.id}
        title="Invite a Faculty/Staff"
        numberLabel="STUDENT NUMBER"
        candidates={faculty}
        inviteState={facultyInviteState}
        onInviteStateChange={setFacultyInviteState}
      />
    </article>
  );
}
