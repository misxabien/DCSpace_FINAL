import type { SpaceEvent } from "@/lib/events/types";

export const EVENT_ATTACHMENT_KINDS = [
  "concept-paper",
  "certificate-template",
  "program-file",
  "poster",
] as const;

export type EventAttachmentKind = (typeof EVENT_ATTACHMENT_KINDS)[number];

export function isEventAttachmentKind(value: string): value is EventAttachmentKind {
  return (EVENT_ATTACHMENT_KINDS as readonly string[]).includes(value);
}

export function bufferFromStoredBase64(value: string): Buffer {
  const trimmed = String(value || "").trim();
  const comma = trimmed.indexOf(",");
  const payload =
    trimmed.startsWith("data:") && comma >= 0 ? trimmed.slice(comma + 1) : trimmed;
  return Buffer.from(payload, "base64");
}

export function eventAttachmentUrl(eventId: string, kind: EventAttachmentKind) {
  return `/api/events/${encodeURIComponent(eventId)}/attachments/${kind}`;
}

export function resolveEventAttachment(doc: SpaceEvent, kind: EventAttachmentKind) {
  if (kind === "concept-paper") {
    return {
      name: doc.conceptPaperName || "concept-paper.pdf",
      mimeType: doc.conceptPaperMimeType || "application/octet-stream",
      base64: doc.conceptPaperBase64 || "",
      organizerOnly: false,
    };
  }
  if (kind === "certificate-template") {
    return {
      name: doc.certificateTemplateName || "e-certificate.pdf",
      mimeType: doc.certificateTemplateMimeType || "application/pdf",
      base64: doc.certificateTemplateBase64 || "",
      organizerOnly: true,
    };
  }
  if (kind === "program-file") {
    return {
      name: doc.programFileName || "program-flow.pdf",
      mimeType: doc.programFileMimeType || "application/octet-stream",
      base64: doc.programFileBase64 || "",
      organizerOnly: (doc.programFileVisibility || "everyone") === "organizers",
    };
  }
  return {
    name: "event-poster.jpg",
    mimeType: doc.posterImageMimeType || "image/jpeg",
    base64: doc.posterImageBase64 || "",
    organizerOnly: false,
  };
}
