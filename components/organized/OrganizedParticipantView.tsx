"use client";

import { useEffect, useState } from "react";
import { OrganizedEventHeader } from "@/components/organized/OrganizedEventHeader";
import { FileAction } from "@/components/organized/FileAction";
import type { OrganizedEventDetail } from "@/lib/organizedEventDetails";
import {
  type FileSubmissionStatus,
  type ParticipantDetail,
} from "@/lib/organizedRegistrations";
import detailStyles from "@/components/organized/OrganizedDetail.module.css";
import styles from "@/components/organized/OrganizedParticipant.module.css";

function attendanceBadgeClass(label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes("on time") || normalized.includes("met")) {
    return `${styles.statusBadge} ${styles.statusOnTime}`;
  }
  return `${styles.statusBadge} ${styles.statusLate}`;
}

export function OrganizedParticipantView({
  event,
  participant: initialParticipant,
}: {
  event: OrganizedEventDetail;
  participant: ParticipantDetail;
}) {
  const [participant, setParticipant] = useState(initialParticipant);

  useEffect(() => {
    setParticipant(initialParticipant);
  }, [initialParticipant]);

  const onFileStatusChange = (fileId: string, status: FileSubmissionStatus) => {
    setParticipant((current) => ({
      ...current,
      files: current.files.map((file) => (file.id === fileId ? { ...file, status } : file)),
    }));
  };

  return (
    <article className={`${detailStyles.page} ${styles.page}`}>
      <OrganizedEventHeader event={event} />

      <hr className={styles.divider} />

      <section className={styles.section} aria-labelledby="participant-details">
        <h3 id="participant-details">Participant Details</h3>
        <div className={styles.participantCard}>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Student Number</span>
            <span className={styles.detailValue}>{participant.studentNumber}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Student Name</span>
            <span className={styles.detailValue}>{participant.studentName}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Course &amp; School</span>
            <span className={styles.detailValue}>{participant.courseSchool}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Organization</span>
            <span className={styles.detailValue}>{participant.organization}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Organization Role</span>
            <span className={styles.detailValue}>{participant.organizationRole}</span>
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="files-submitted">
        <h3 id="files-submitted">Files Submitted</h3>
        <div className={`${styles.tableWrap} ${styles.filesTableWrap}`}>
          <table className={styles.table} aria-label="Files submitted">
            <thead>
              <tr>
                <th scope="col">FILE</th>
                <th scope="col">FILE NAME</th>
                <th scope="col">ACTION</th>
              </tr>
            </thead>
            <tbody>
              {participant.files.map((file) => (
                <tr key={file.id}>
                  <td className={styles.fileCell}>
                    <svg className={styles.fileIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                      <path d="M14 2v6h6" />
                      <path d="M9 15l2 2 4-4" />
                    </svg>
                  </td>
                  <td>
                    <p className={styles.fileName}>{file.name}</p>
                    {file.viewed ? (
                      <button type="button" className={styles.fileViewed}>
                        File viewed
                      </button>
                    ) : null}
                  </td>
                  <td className={styles.actionCell}>
                    <FileAction
                      participantId={participant.id}
                      fileId={file.id}
                      status={file.status}
                      onChange={(status) => onFileStatusChange(file.id, status)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="attendance-status">
        <h3 id="attendance-status">Attendance Status Details</h3>
        <div className={styles.statusList}>
          <div className={styles.statusRow}>
            <span>Grace Period Status</span>
            <span className={attendanceBadgeClass(participant.gracePeriodStatus)}>
              {participant.gracePeriodStatus}
            </span>
          </div>
          <div className={styles.statusRow}>
            <span>Attendance Requirement Status</span>
            <span className={attendanceBadgeClass(participant.attendanceRequirementStatus)}>
              {participant.attendanceRequirementStatus}
            </span>
          </div>
        </div>
      </section>
    </article>
  );
}
