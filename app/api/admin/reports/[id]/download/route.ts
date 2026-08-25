import { NextResponse } from "next/server";
import { getAdminReportById, incrementReportDownloadCount } from "@/lib/admin/admin-reports";
import { requireAdminAuth } from "@/lib/admin-server/require-admin-auth";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireAdminAuth(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  try {
    const report = await getAdminReportById(id);
    if (!report) {
      return NextResponse.json({ error: "Report not found." }, { status: 404 });
    }

    await incrementReportDownloadCount(id).catch(() => undefined);

    // Prefer embedded file bytes (PDF/Word/CSV exports) over redirect links.
    if (report.contentBase64) {
      const buffer = Buffer.from(String(report.contentBase64), "base64");
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          "Content-Type": report.contentMimeType || "application/octet-stream",
          "Content-Disposition": `attachment; filename="${String(report.fileName || "report").replace(/"/g, "")}"`,
          "Cache-Control": "private, no-store",
        },
      });
    }

    if (report.downloadPath) {
      const url = new URL(report.downloadPath, request.url);
      return NextResponse.redirect(url);
    }

    return NextResponse.json({ error: "Report file unavailable." }, { status: 404 });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to download report.", details },
      { status: 500 },
    );
  }
}
