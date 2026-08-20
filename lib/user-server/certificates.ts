import type { Db } from "mongodb";
import { certificatesCollection, logUserActivity } from "@/lib/user-server/activity";
import { notifyUser } from "@/lib/user-server/portal";
import {
  buildCertificatePdfFromTemplate,
  inferCertificateCategory,
} from "@/lib/certificates/template";

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
  qualificationSource: "admin" | "attendance";
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
  const generatedPdfBase64 = await buildCertificatePdfFromTemplate({
    templateBase64: input.event.certificateTemplateBase64,
    recipientName: input.recipient.userName,
    eventName: input.event.title,
    dateIssued,
  });
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
    generatedPdfBase64,
    generatedPdfMimeType: "application/pdf",
    generatedPdfFileName: `${input.event.title || "certificate"} - ${
      input.recipient.userName || input.recipient.email
    }.pdf`,
    qualificationSource: input.qualificationSource,
    attendanceMinutes: input.attendanceMinutes,
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
