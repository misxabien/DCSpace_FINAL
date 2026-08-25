import type { Db, ObjectId } from "mongodb";
import { ObjectId as MongoObjectId } from "mongodb";
import { eventsCollection } from "@/lib/events/types";
import { getUserDb } from "@/lib/user-server/get-user-db";

export type AdminReportCategory =
  | "event"
  | "attendance"
  | "certificate"
  | "feedback"
  | "users";

export type AdminReportSource = "event_pdf" | "smart_report" | "csv_export" | "snapshot";

export type AdminReportDoc = {
  _id?: ObjectId;
  category: AdminReportCategory;
  name: string;
  fileName: string;
  format: string;
  generatedAt: string;
  generatedBy: string;
  generatedByEmail: string;
  source: AdminReportSource;
  eventId?: string;
  recordCount?: number;
  downloadCount?: number;
  downloadPath?: string;
  contentBase64?: string;
  contentMimeType?: string;
};

export function adminReportsCollection(db: Db) {
  return db.collection<AdminReportDoc>("admin_reports");
}

export function reportTypeToCategory(reportType: string): AdminReportCategory {
  switch (String(reportType || "").toLowerCase()) {
    case "attendance":
      return "attendance";
    case "certificate":
      return "certificate";
    case "feedback":
      return "feedback";
    default:
      return "event";
  }
}

function formatDisplayDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function sanitizeAdminReport(doc: AdminReportDoc & { _id?: ObjectId }) {
  return {
    id: String(doc._id || ""),
    category: doc.category,
    name: doc.name,
    fileName: doc.fileName,
    format: doc.format,
    generatedAt: doc.generatedAt,
    generatedBy: doc.generatedBy,
    generatedByEmail: doc.generatedByEmail,
    source: doc.source,
    eventId: doc.eventId,
    recordCount: doc.recordCount,
    downloadPath: doc.downloadPath,
    hasDownload: Boolean(doc.downloadPath || doc.contentBase64),
    date: formatDisplayDate(doc.generatedAt),
  };
}

export async function storeAdminReport(
  input: Omit<AdminReportDoc, "generatedAt"> & { generatedAt?: string },
  db?: Db,
) {
  const database = db || (await getUserDb());
  const doc: AdminReportDoc = {
    ...input,
    generatedAt: input.generatedAt || new Date().toISOString(),
  };
  const result = await adminReportsCollection(database).insertOne(doc);
  return sanitizeAdminReport({ ...doc, _id: result.insertedId });
}

export async function syncExistingEventPdfReports(db?: Db) {
  const database = db || (await getUserDb());
  const eventReports = await database.collection("event_reports").find({}).toArray();
  if (!eventReports.length) return 0;

  const eventIds = [...new Set(eventReports.map((row) => String(row.eventId || "")).filter(Boolean))];
  const events = await eventsCollection(database)
    .find({
      _id: {
        $in: eventIds
          .filter((id) => MongoObjectId.isValid(id))
          .map((id) => new MongoObjectId(id)),
      },
    })
    .toArray();
  const titleById = new Map(events.map((event) => [String(event._id), String(event.title || "Event")]));

  let synced = 0;
  for (const report of eventReports) {
    const exists = await adminReportsCollection(database).findOne({
      source: "event_pdf",
      eventId: report.eventId,
      generatedAt: report.generatedAt,
    });
    if (exists) continue;
    await storeEventPdfReport({
      eventId: report.eventId,
      eventTitle: titleById.get(report.eventId) || "Event",
      fileName: report.generatedPdfFileName,
      generatedBy: (report.generatedByEmail || "Admin").split("@")[0] || "Admin",
      generatedByEmail: report.generatedByEmail,
      generatedAt: report.generatedAt,
      recordCount: Number((report.stats as { registrations?: number } | undefined)?.registrations || 0),
      db: database,
    });
    synced += 1;
  }
  return synced;
}

export async function listAdminReports(options?: {
  category?: AdminReportCategory;
  limit?: number;
  db?: Db;
  syncEventPdfs?: boolean;
}) {
  const database = options?.db || (await getUserDb());
  if (options?.syncEventPdfs && (!options.category || options.category === "event")) {
    await syncExistingEventPdfReports(database).catch(() => 0);
  }
  const filter = options?.category ? { category: options.category } : {};
  const docs = await adminReportsCollection(database)
    .find(filter)
    .sort({ generatedAt: -1 })
    .limit(options?.limit ?? 50)
    .toArray();
  return docs.map((doc) => sanitizeAdminReport(doc as AdminReportDoc & { _id?: ObjectId }));
}

export async function getAdminReportById(id: string, db?: Db) {
  const database = db || (await getUserDb());
  const { ObjectId } = await import("mongodb");
  if (!ObjectId.isValid(id)) return null;
  const doc = await adminReportsCollection(database).findOne({ _id: new ObjectId(id) });
  if (!doc) return null;
  return doc as AdminReportDoc & { _id: ObjectId };
}

export async function getAdminReportStats(db?: Db) {
  const database = db || (await getUserDb());
  const col = adminReportsCollection(database);
  const total = await col.countDocuments({});
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const thisMonth = await col.countDocuments({
    generatedAt: { $gte: monthStart.toISOString() },
  });
  const latest = await col.findOne({}, { sort: { generatedAt: -1 } });
  const mostDownloaded =
    (await col.findOne({ downloadCount: { $gt: 0 } }, { sort: { downloadCount: -1, generatedAt: -1 } })) ||
    latest;
  return {
    totalReportsGenerated: total,
    thisMonth,
    lastGenerated: latest?.name || "—",
    mostDownloaded: mostDownloaded?.name || "—",
  };
}

export async function incrementReportDownloadCount(id: string, db?: Db) {
  const database = db || (await getUserDb());
  if (!MongoObjectId.isValid(id)) return;
  await adminReportsCollection(database).updateOne(
    { _id: new MongoObjectId(id) },
    { $inc: { downloadCount: 1 } },
  );
}

export async function storeCategorySnapshots(input: {
  generatedBy: string;
  generatedByEmail: string;
  counts: {
    events: number;
    attendance: number;
    feedback: number;
    certificates: number;
    users?: number;
  };
  csvBase64?: string;
  usersCsvBase64?: string;
  db?: Db;
}) {
  const database = input.db || (await getUserDb());
  const generatedAt = new Date().toISOString();
  const dateLabel = formatDisplayDate(generatedAt).replace(/,/g, "");
  const entries: Array<Omit<AdminReportDoc, "generatedAt">> = [
    {
      category: "event",
      name: "Events Summary",
      fileName: `events-summary-${dateLabel}.csv`,
      format: "CSV",
      generatedBy: input.generatedBy,
      generatedByEmail: input.generatedByEmail,
      source: "snapshot",
      recordCount: input.counts.events,
      contentBase64: input.csvBase64,
      contentMimeType: "text/csv",
    },
    {
      category: "attendance",
      name: "Attendance Log",
      fileName: `attendance-log-${dateLabel}.csv`,
      format: "CSV",
      generatedBy: input.generatedBy,
      generatedByEmail: input.generatedByEmail,
      source: "snapshot",
      recordCount: input.counts.attendance,
      contentBase64: input.csvBase64,
      contentMimeType: "text/csv",
    },
    {
      category: "feedback",
      name: "Feedback Digest",
      fileName: `feedback-digest-${dateLabel}.csv`,
      format: "CSV",
      generatedBy: input.generatedBy,
      generatedByEmail: input.generatedByEmail,
      source: "snapshot",
      recordCount: input.counts.feedback,
      contentBase64: input.csvBase64,
      contentMimeType: "text/csv",
    },
    {
      category: "certificate",
      name: "Certificates Issued",
      fileName: `certificates-issued-${dateLabel}.csv`,
      format: "CSV",
      generatedBy: input.generatedBy,
      generatedByEmail: input.generatedByEmail,
      source: "snapshot",
      recordCount: input.counts.certificates,
      contentBase64: input.csvBase64,
      contentMimeType: "text/csv",
    },
    {
      category: "users",
      name: "User Directory",
      fileName: `user-directory-${dateLabel}.csv`,
      format: "CSV",
      generatedBy: input.generatedBy,
      generatedByEmail: input.generatedByEmail,
      source: "snapshot",
      recordCount: input.counts.users ?? 0,
      contentBase64: input.usersCsvBase64 || input.csvBase64,
      contentMimeType: "text/csv",
    },
  ];

  const stored = [];
  for (const entry of entries) {
    stored.push(await storeAdminReport({ ...entry, generatedAt }, database));
  }
  return stored;
}

export async function storeSmartReportExport(input: {
  reportType: string;
  eventTitles: string[];
  generatedBy: string;
  generatedByEmail: string;
  draft: Record<string, string>;
  format: string;
  fileName: string;
  formatLabel: string;
  contentBase64: string;
  contentMimeType: string;
  db?: Db;
}) {
  const category = reportTypeToCategory(input.reportType);
  const label =
    category === "event"
      ? "Event Summary Report"
      : category === "attendance"
        ? "Attendance Report"
        : category === "certificate"
          ? "Certificate Report"
          : "Feedback Report";
  const focus =
    input.eventTitles.length > 0 ? input.eventTitles.slice(0, 2).join(", ") : "Campus Snapshot";
  const name =
    input.eventTitles.length === 1
      ? `${input.eventTitles[0]} — ${label}`
      : `${label}: ${focus}`;

  return storeAdminReport(
    {
      category,
      name,
      fileName: input.fileName,
      format: input.formatLabel,
      generatedBy: input.generatedBy,
      generatedByEmail: input.generatedByEmail,
      source: "smart_report",
      recordCount: input.eventTitles.length || undefined,
      contentBase64: input.contentBase64,
      contentMimeType: input.contentMimeType,
    },
    input.db,
  );
}

export async function storeSmartReport(input: {
  reportType: string;
  eventTitles: string[];
  generatedBy: string;
  generatedByEmail: string;
  draft: Record<string, string>;
  db?: Db;
}) {
  const category = reportTypeToCategory(input.reportType);
  const label =
    category === "event"
      ? "Event Summary Report"
      : category === "attendance"
        ? "Attendance Report"
        : category === "certificate"
          ? "Certificate Report"
          : "Feedback Report";
  const focus =
    input.eventTitles.length > 0 ? input.eventTitles.slice(0, 2).join(", ") : "Campus Snapshot";
  const name = input.eventTitles.length === 1 ? `${input.eventTitles[0]} — ${label}` : `${label}: ${focus}`;
  const generatedAt = new Date().toISOString();
  const safeDate = generatedAt.slice(0, 10);
  const fileName = `${category}-smart-report-${safeDate}.txt`;
  const body = [
    input.draft.executiveSummary,
    input.draft.rationale,
    input.draft.objectives,
    input.draft.highlights,
    input.draft.recommendations,
    input.draft.conclusion,
  ]
    .filter(Boolean)
    .join("\n\n");
  const contentBase64 = Buffer.from(body || "Smart report draft", "utf8").toString("base64");

  return storeAdminReport(
    {
      category,
      name,
      fileName,
      format: "Smart Report",
      generatedBy: input.generatedBy,
      generatedByEmail: input.generatedByEmail,
      source: "smart_report",
      recordCount: input.eventTitles.length || undefined,
      contentBase64,
      contentMimeType: "text/plain; charset=utf-8",
    },
    input.db,
  );
}

export async function storeEventPdfReport(input: {
  eventId: string;
  eventTitle: string;
  fileName: string;
  generatedBy: string;
  generatedByEmail: string;
  generatedAt?: string;
  recordCount?: number;
  contentBase64?: string;
  contentMimeType?: string;
  db?: Db;
}) {
  return storeAdminReport(
    {
      category: "event",
      name: `${input.eventTitle} Report`,
      fileName: input.fileName,
      format: "PDF",
      generatedBy: input.generatedBy,
      generatedByEmail: input.generatedByEmail,
      source: "event_pdf",
      eventId: input.eventId,
      recordCount: input.recordCount,
      downloadPath: `/api/admin/events/${encodeURIComponent(input.eventId)}/report/download`,
      contentBase64: input.contentBase64,
      contentMimeType: input.contentMimeType || "application/pdf",
      generatedAt: input.generatedAt,
    },
    input.db,
  );
}
