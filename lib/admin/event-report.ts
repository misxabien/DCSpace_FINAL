import type { Db, ObjectId } from "mongodb";
import { loadEventAiContext } from "@/lib/ai/context";
import { buildEventReportPdf } from "@/lib/admin/event-report-pdf";
import { storeEventPdfReport } from "@/lib/admin/admin-reports";
import { listEventGalleryPhotos } from "@/lib/events/event-gallery";
import { getUserDb } from "@/lib/user-server/get-user-db";

export type EventReportTrigger = "status_completed" | "manual";

export type EventReportDoc = {
  _id?: ObjectId;
  eventId: string;
  generatedAt: string;
  generatedByEmail: string;
  trigger: EventReportTrigger;
  stats: Record<string, unknown>;
  sections: {
    summary: string;
    attendance: string;
    feedback: string;
    security: string;
    recommendations: string;
  };
  feedbackSamples: string[];
  generatedPdfBase64: string;
  generatedPdfMimeType: string;
  generatedPdfFileName: string;
};

export function eventReportsCollection(db: Db) {
  return db.collection<EventReportDoc>("event_reports");
}

function buildSections(context: NonNullable<Awaited<ReturnType<typeof loadEventAiContext>>>) {
  const { event, stats, feedbackSamples } = context;
  const summary = `${event.title} (${String(event.status).toUpperCase()}) at ${event.location || "TBA"} was organized by ${event.organizerName || "—"}. ${
    event.description ? event.description.slice(0, 280) : "No description was provided."
  }`;
  const attendance = `Registrations: ${stats.registrations}. Tap-in ${stats.tapIn}, tap-out ${stats.tapOut}, attendance rate ${stats.attendanceRate}%. Peak ${stats.peakPeriod}, lowest ${stats.lowestPeriod}. Average duration ${stats.avgDurationLabel}. ${stats.qualifiedForCertificate} participant(s) qualified for certificates.`;
  const feedback = stats.feedbackCount
    ? `${stats.feedbackCount} feedback response(s), average rating ${stats.averageRating}/5 (${stats.overallSentiment}).`
    : "No feedback responses were recorded for this event yet.";
  const security =
    stats.totalSecurityEvents > 0 || stats.duplicateWarnings
      ? stats.totalSecurityEvents > 0
        ? `${stats.totalSecurityEvents} suspicious alert(s): ${stats.duplicateScans} repeated duplicate${stats.duplicateScans === 1 ? "" : "s"}, ${stats.concurrentEventTaps || 0} concurrent event, ${stats.invalidScans} invalid/unregistered.${stats.duplicateWarnings ? ` ${stats.duplicateWarnings} warning(s).` : ""} Risk: ${stats.securityRisk}.`
        : `${stats.duplicateWarnings} duplicate tap warning(s). Risk: ${stats.securityRisk}.`
      : "No RFID scan errors were recorded for this event.";
  const recommendations = [
    stats.attendanceRate < 50
      ? "Improve pre-event reminders and registration follow-up to raise attendance rate."
      : "Maintain current outreach practices; attendance rate is healthy.",
    stats.feedbackCount < Math.max(5, Math.round(stats.registrations * 0.1))
      ? "Prompt attendees for post-event feedback to improve future planning."
      : "Continue collecting feedback; response volume is useful for analysis.",
    "Archive event photos and attach this PDF to the event completion packet.",
  ].join(" ");

  return {
    summary,
    attendance,
    feedback,
    security,
    recommendations,
    feedbackSamples: feedbackSamples || [],
  };
}

export function sanitizeReportMeta(doc: EventReportDoc & { _id?: ObjectId }) {
  return {
    id: String(doc._id || ""),
    eventId: doc.eventId,
    generatedAt: doc.generatedAt,
    generatedByEmail: doc.generatedByEmail,
    trigger: doc.trigger,
    stats: doc.stats,
    sections: doc.sections,
    feedbackSamples: doc.feedbackSamples || [],
    fileName: doc.generatedPdfFileName,
    mimeType: doc.generatedPdfMimeType,
    hasPdf: Boolean(doc.generatedPdfBase64),
  };
}

/** Generate (or regenerate) a PDF event report and upsert into event_reports. */
export async function generateAndStoreEventReport(input: {
  eventId: string;
  generatedByEmail?: string;
  generatedByName?: string;
  trigger: EventReportTrigger;
  db?: Db;
}) {
  const db = input.db || (await getUserDb());
  const context = await loadEventAiContext(input.eventId);
  if (!context) {
    throw new Error("Event not found.");
  }

  // Current event_gallery snapshot (active + archived) for this eventId.
  const galleryPhotos = await listEventGalleryPhotos(db, input.eventId, {
    includeArchived: true,
    limit: 80,
  }).catch((error) => {
    const details = error instanceof Error ? error.message : String(error);
    console.error("[DC Space] Failed to load event_gallery for report:", details);
    return [];
  });
  const activePhotoCount = galleryPhotos.filter((photo) => !photo.archived).length;
  const archivedPhotoCount = galleryPhotos.filter((photo) => photo.archived).length;
  const photoCount = galleryPhotos.length;

  const sectionsBundle = buildSections(context);
  const generatedAt = new Date().toISOString();
  const safeTitle = (context.event.title || "event").replace(/[^\w\- ]+/g, "").trim() || "event";
  const fileName = `${safeTitle}-report-${generatedAt.slice(0, 10)}.pdf`;

  const generatedPdfBase64 = await buildEventReportPdf({
    title: context.event.title,
    generatedAt,
    trigger: input.trigger,
    event: {
      title: context.event.title,
      status: String(context.event.status),
      location: context.event.location,
      organizerName: context.event.organizerName,
      startsAt: context.event.startsAt,
      endsAt: context.event.endsAt,
      category: context.event.category,
      description: context.event.description,
    },
    stats: {
      ...context.stats,
      photoCount,
      activePhotoCount,
      archivedPhotoCount,
    },
    sections: {
      summary: sectionsBundle.summary,
      attendance: sectionsBundle.attendance,
      feedback: sectionsBundle.feedback,
      security: sectionsBundle.security,
      recommendations: sectionsBundle.recommendations,
    },
    feedbackSamples: sectionsBundle.feedbackSamples,
    photos: galleryPhotos.map((photo) => ({
      id: photo.id,
      dataUrl: photo.dataUrl,
      uploadedAt: photo.uploadedAt,
      archived: photo.archived,
      caption: photo.caption,
      source: photo.source,
    })),
  });

  const doc: EventReportDoc = {
    eventId: input.eventId,
    generatedAt,
    generatedByEmail: (input.generatedByEmail || "").trim().toLowerCase(),
    trigger: input.trigger,
    stats: {
      ...context.stats,
      photoCount,
      activePhotoCount,
      archivedPhotoCount,
    },
    sections: {
      summary: sectionsBundle.summary,
      attendance: sectionsBundle.attendance,
      feedback: sectionsBundle.feedback,
      security: sectionsBundle.security,
      recommendations: sectionsBundle.recommendations,
    },
    feedbackSamples: sectionsBundle.feedbackSamples,
    generatedPdfBase64,
    generatedPdfMimeType: "application/pdf",
    generatedPdfFileName: fileName,
  };

  const result = await eventReportsCollection(db).findOneAndUpdate(
    { eventId: input.eventId },
    { $set: doc },
    { upsert: true, returnDocument: "after" },
  );

  const stored = (result || doc) as EventReportDoc & { _id?: ObjectId };
  await storeEventPdfReport({
    eventId: input.eventId,
    eventTitle: context.event.title || "Event",
    fileName,
    generatedBy: (input.generatedByName || input.generatedByEmail || "Admin").trim(),
    generatedByEmail: (input.generatedByEmail || "").trim().toLowerCase(),
    generatedAt,
    recordCount: Number(context.stats.registrations || 0),
    contentBase64: generatedPdfBase64,
    contentMimeType: "application/pdf",
    db,
  }).catch((error) => {
    console.warn("[DC Space] Failed to register event report in admin_reports:", error);
  });
  return sanitizeReportMeta(stored);
}

export async function getLatestEventReport(eventId: string, db?: Db) {
  const database = db || (await getUserDb());
  const doc = await eventReportsCollection(database).findOne(
    { eventId },
    { sort: { generatedAt: -1 } },
  );
  if (!doc) return null;
  return sanitizeReportMeta(doc as EventReportDoc & { _id?: ObjectId });
}

export async function getLatestEventReportPdf(eventId: string, db?: Db) {
  const database = db || (await getUserDb());
  const doc = await eventReportsCollection(database).findOne(
    { eventId },
    { sort: { generatedAt: -1 } },
  );
  if (!doc?.generatedPdfBase64) return null;
  return {
    base64: String(doc.generatedPdfBase64),
    mimeType: String(doc.generatedPdfMimeType || "application/pdf"),
    fileName: String(doc.generatedPdfFileName || "event-report.pdf"),
  };
}
