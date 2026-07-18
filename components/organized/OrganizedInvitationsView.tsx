"use client";

import { useEffect, useState } from "react";
import { OrganizedEventHeader } from "@/components/organized/OrganizedEventHeader";
import { InvitationTable } from "@/components/organized/InvitationTable";
import type { OrganizedEventDetail } from "@/lib/organizedEventDetails";
import {
  getInviteCandidates,
  getInviteState,
} from "@/lib/organizedInvitations";
import detailStyles from "@/components/organized/OrganizedDetail.module.css";
import styles from "@/components/organized/OrganizedInvitations.module.css";

export function OrganizedInvitationsView({ event }: { event: OrganizedEventDetail }) {
  const [studentInviteState, setStudentInviteState] = useState<Record<string, boolean>>({});
  const [facultyInviteState, setFacultyInviteState] = useState<Record<string, boolean>>({});

  const loadInviteStates = () => {
    setStudentInviteState(getInviteState(event.id, "student"));
    setFacultyInviteState(getInviteState(event.id, "faculty"));
  };

  useEffect(() => {
    loadInviteStates();
  }, [event.id]);

  useEffect(() => {
    const onChange = () => loadInviteStates();
    window.addEventListener("dc-invites-changed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("dc-invites-changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [event.id]);

  const students = getInviteCandidates(event.id, "student");
  const faculty = getInviteCandidates(event.id, "faculty");

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
