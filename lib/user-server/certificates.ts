import type { Db } from "mongodb";
import { certificatesCollection, logUserActivity } from "@/lib/user-server/activity";
import { notifyUser } from "@/lib/user-server/portal";
import { inferCertificateCategory } from "@/lib/certificates/duration";

export type StoredCertificateDoc = {
  _id?: unknown;
  name?: string;
  eventId?: string;
  eventName?: string;
  eventTitle?: string;
  email?: string;
  userName?: string;
  dateIssued?: string;
  status?: string;
  category?: string;
  createdAt?: string;
  generatedBy?: string;
  generatedPdfBase64?: string;
  generatedPdfFileName?: string;
  generatedPdfMimeType?: string;
  qualificationSource?: string;
  attendanceMinutes?: number;
  layoutVersion?: number;
  distributedAt?: string;
  distributedBy?: string;
};

export function certificateDownloadUrl(id: string) {
  return `/api/user/certificates/${encodeURIComponent(id)}/download`;
}

export async function createCertificateDoc(input: {
  db: Db;
  event: {
    id: string;
    title: string;
    startsAt?: string;
    certificateTemplateBase64?: string;
  };
  recipient: { email: string; userName: string };
  generatedBy: { email: string; name: string; role: string };
  /** "admin-override" = issued by an admin without meeting the attendance rule. */
  qualificationSource: "admin" | "attendance" | "admin-override";
  attendanceMinutes?: number;
}) {
  if (!input.event.certificateTemplateBase64) {
    throw new Error("This event has no certificate template PDF.");
  }

  const now = new Date().toISOString();
  const dateIssued = new Date(now).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  // The PDF is built from the event's template when it is downloaded. Storing a
  // copy per student saved a full template (often 1–3 MB) for every certificate,
  // filling the database and making bulk issuing very slow.
  const doc: StoredCertificateDoc = {
    name: "Certificate of Participation",
    eventId: input.event.id,
    eventName: input.event.title,
    email: input.recipient.email,
    userName: input.recipient.userName,
    dateIssued,
    status: "generated",
    category: inferCertificateCategory(input.event.startsAt || now),
    createdAt: now,
    generatedBy: input.generatedBy.email,
    generatedPdfMimeType: "application/pdf",
    generatedPdfFileName: `${input.event.title || "certificate"} - ${
      input.recipient.userName || input.recipient.email
    }.pdf`,
    qualificationSource: input.qualificationSource,
    attendanceMinutes: input.attendanceMinutes,
    layoutVersion: 3,
  };
  const result = await certificatesCollection(input.db).insertOne({
    ...doc,
    _id: undefined,
  });
  const id = String(result.insertedId);
  await logUserActivity({
    type: "certificate_generated",
    actorEmail: input.generatedBy.email,
    actorName: input.generatedBy.name,
    actorRole: input.generatedBy.role,
    targetId: input.event.id,
    targetTitle: input.event.title,
    meta: {
      recipient: input.recipient.email,
      qualificationSource: input.qualificationSource,
      attendanceMinutes: input.attendanceMinutes ?? null,
    },
  });
  await notifyUser({
    email: input.recipient.email,
    title: "Certificate available",
    body: `Your certificate for ${input.event.title} is ready to download.`,
    type: "certificate",
    eventId: input.event.id,
    eventTitle: input.event.title,
  });
  return { id, ...doc, downloadUrl: certificateDownloadUrl(id) };
}
