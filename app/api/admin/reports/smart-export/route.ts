import { NextResponse } from "next/server";
import { storeSmartReportExport } from "@/lib/admin/admin-reports";
import {
  buildSmartReportExport,
  type SmartExportFormat,
  type SmartReportDraft,
} from "@/lib/admin/smart-report-export";
import { requireAdminAuth } from "@/lib/admin-server/require-admin-auth";

function parseFormat(value: string): SmartExportFormat | null {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "word") return "word";
  if (normalized === "docs") return "docs";
  if (normalized === "excel") return "excel";
  if (normalized === "pdf") return "pdf";
  return null;
}

/** Export Smart Report draft to Word, CSV, PDF, etc. and store in admin_reports. */
export async function POST(request: Request) {
  const auth = await requireAdminAuth(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: {
    format?: string;
    reportType?: string;
    eventTitles?: string[];
    draft?: SmartReportDraft;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const format = parseFormat(String(body.format || ""));
  if (!format) {
    return NextResponse.json({ error: "Unsupported export format." }, { status: 400 });
  }

  const draft = body.draft || {};
  const hasContent = Object.values(draft).some((value) => String(value || "").trim());
  if (!hasContent) {
    return NextResponse.json(
      { error: "No report draft found. Generate the Smart Report first." },
      { status: 400 },
    );
  }

  const reportType = String(body.reportType || "event-summary");
  const eventTitles = Array.isArray(body.eventTitles) ? body.eventTitles.map(String) : [];
  const title =
    eventTitles.length === 1
      ? `${eventTitles[0]} — Smart Report`
      : eventTitles.length > 1
        ? `Smart Report: ${eventTitles.slice(0, 2).join(", ")}`
        : "DC Space Smart Report";

  try {
    const exported = await buildSmartReportExport({ format, title, draft });
    const contentBase64 = exported.buffer.toString("base64");
    const stored = await storeSmartReportExport({
      reportType,
      eventTitles,
      generatedBy: auth.session.name,
      generatedByEmail: auth.session.email,
      draft: draft as Record<string, string>,
      format,
      fileName: exported.fileName,
      formatLabel: exported.formatLabel,
      contentBase64,
      contentMimeType: exported.mimeType,
    });

    return NextResponse.json({
      ok: true,
      reportId: stored.id,
      fileName: exported.fileName,
      downloadPath: `/api/admin/reports/${stored.id}/download`,
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to export smart report.", details },
      { status: 500 },
    );
  }
}
