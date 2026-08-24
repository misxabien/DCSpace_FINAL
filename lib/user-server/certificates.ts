import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import { getAdminDb } from "@/lib/db/get-db";
import { eventsCollection } from "@/lib/events/types";
import { certificatesCollection, logUserActivity } from "@/lib/user-server/activity";
import { notifyUser } from "@/lib/user-server/portal";
import {
  buildCertificatePdfFromTemplate,
  buildDefaultCertificateTemplate,
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

function formatDateIssued(value?: string) {
  if (value && value.trim()) return value.trim();
  return new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Return stored PDF bytes or generate, persist, and return when missing. */
export async function resolveCertificatePdf(
  db: Db,
  cert: StoredCertificateDoc & { _id?: unknown },
): Promise<{ base64: string; fileName: string; mimeType: string } | null> {
  const existing = String(cert.generatedPdfBase64 || "").trim();
  if (existing) {
    return {
      base64: existing,
      fileName: String(cert.generatedPdfFileName || "certificate.pdf"),
      mimeType: String(cert.generatedPdfMimeType || "application/pdf"),
    };
  }

  const recipientName = String(cert.userName || cert.name || cert.email || "Participant");
  const eventName = String(cert.eventName || cert.eventTitle || "Event");
  const dateIssued = formatDateIssued(cert.dateIssued || cert.createdAt);

  let templateBase64 = "";
  const eventId = String(cert.eventId || "");
  if (eventId && ObjectId.isValid(eventId)) {
    const event = await eventsCollection(await getAdminDb()).findOne(
      { _id: new ObjectId(eventId) },
      {
        projection: {
          title: 1,
          certificateTemplateBase64: 1,
          hasCertificateTemplate: 1,
        },
      },
    );
    templateBase64 = String(event?.certificateTemplateBase64 || "").trim();
    if (!templateBase64 && event?.hasCertificateTemplate) {
      templateBase64 = await buildDefaultCertificateTemplate();
    }
  }

  if (!templateBase64) {
    templateBase64 = await buildDefaultCertificateTemplate();
  }

  const generatedPdfBase64 = await buildCertificatePdfFromTemplate({
    templateBase64,
    recipientName,
    eventName,
    dateIssued,
  });
  const generatedPdfFileName = `${eventName} - ${recipientName}.pdf`;
  const generatedPdfMimeType = "application/pdf";

  if (cert._id) {
    await certificatesCollection(db).updateOne(
      { _id: cert._id },
      {
        $set: {
          generatedPdfBase64,
          generatedPdfMimeType,
          generatedPdfFileName,
          userName: recipientName,
          eventName,
          dateIssued,
          status: "generated",
          updatedAt: new Date().toISOString(),
        },
      },
    );
  }

  return {
    base64: generatedPdfBase64,
    fileName: generatedPdfFileName,
    mimeType: generatedPdfMimeType,
  };
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
  const templateBase64 =
    String(input.event.certificateTemplateBase64 || "").trim() ||
    (await buildDefaultCertificateTemplate());

  const now = new Date().toISOString();
  const dateIssued = new Date(now).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const generatedPdfBase64 = await buildCertificatePdfFromTemplate({
    templateBase64,
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
