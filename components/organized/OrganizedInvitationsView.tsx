"use client";

import { useEffect, useState } from "react";
import { OrganizedEventHeader } from "@/components/organized/OrganizedEventHeader";
import { InvitationTable } from "@/components/organized/InvitationTable";
import type { OrganizedEventDetail } from "@/lib/organizedEventDetails";
import { type InviteCandidate } from "@/lib/organizedInvitations";
import detailStyles from "@/components/organized/OrganizedDetail.module.css";
import styles from "@/components/organized/OrganizedInvitations.module.css";

type LiveUser = {
  id: string;
  email: string;
  name: string;
  studentNumber: string;
  course: string;
  organization: string;
  role: string;
};

function toCandidates(
  users: LiveUser[],
  audience: InviteCandidate["audience"],
): InviteCandidate[] {
  return users.map((user) => ({
    id: user.id,
    audience,
    number: user.studentNumber || user.email,
    name: user.name,
    course: user.course || "—",
    organization: user.organization || "None",
    email: user.email,
  }));
}

export function OrganizedInvitationsView({ event }: { event: OrganizedEventDetail }) {
  const [studentInviteState, setStudentInviteState] = useState<Record<string, boolean>>({});
  const [facultyInviteState, setFacultyInviteState] = useState<Record<string, boolean>>({});
  const [students, setStudents] = useState<InviteCandidate[]>([]);
  const [faculty, setFaculty] = useState<InviteCandidate[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [studentRes, facultyRes, inviteRes] = await Promise.all([
          fetch("/api/organized/users?role=student", { cache: "no-store" }),
          fetch("/api/organized/users?role=faculty", { cache: "no-store" }),
          fetch(`/api/organized/events/${encodeURIComponent(event.id)}/invitations`, {
            cache: "no-store",
          }),
        ]);
        const studentData = studentRes.ok
          ? ((await studentRes.json()) as { users?: LiveUser[] })
          : { users: [] };
        const facultyData = facultyRes.ok
          ? ((await facultyRes.json()) as { users?: LiveUser[] })
          : { users: [] };
        const inviteData = inviteRes.ok
          ? ((await inviteRes.json()) as {
              invitations?: Array<{ email?: string; userId?: string }>;
            })
          : { invitations: [] };

        if (cancelled) return;

        const nextStudents = toCandidates(studentData.users || [], "student");
        const nextFaculty = toCandidates(facultyData.users || [], "faculty");
        setStudents(nextStudents);
        setFaculty(nextFaculty);

        const invitedEmails = new Set(
          (inviteData.invitations || []).map((row) =>
            String(row.email || row.userId || "").toLowerCase(),
          ),
        );
        const studentState: Record<string, boolean> = {};
        nextStudents.forEach((row) => {
          studentState[row.id] = invitedEmails.has((row.email || "").toLowerCase()) ||
            invitedEmails.has(row.id.toLowerCase());
        });
        const facultyState: Record<string, boolean> = {};
        nextFaculty.forEach((row) => {
          facultyState[row.id] = invitedEmails.has((row.email || "").toLowerCase()) ||
            invitedEmails.has(row.id.toLowerCase());
        });
        setStudentInviteState(studentState);
        setFacultyInviteState(facultyState);
      } catch {
        if (!cancelled) {
          setStudents([]);
          setFaculty([]);
          setStudentInviteState({});
          setFacultyInviteState({});
        }
      }
    };

    void load();
    const timer = window.setInterval(() => void load(), 12000);
    window.addEventListener("dc-invites-changed", load);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("dc-invites-changed", load);
    };
  }, [event.id]);

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
