import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireAdminAuth } from "@/lib/admin-server/require-admin-auth";
import { getLatestEventReportPdf } from "@/lib/admin/event-report";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireAdminAuth(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid event id." }, { status: 400 });
  }

  try {
    const pdf = await getLatestEventReportPdf(id);
    if (!pdf) {
      return NextResponse.json(
        { error: "No report PDF found for this event. Generate a report first." },
        { status: 404 },
      );
    }

    const bytes = Buffer.from(pdf.base64, "base64");
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": pdf.mimeType || "application/pdf",
        "Content-Disposition": `attachment; filename="${pdf.fileName.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to download event report.", details },
      { status: 500 },
    );
  }
}
