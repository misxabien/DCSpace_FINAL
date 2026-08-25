import { NextResponse } from "next/server";
import { loadReportAiContext } from "@/lib/ai/context";
import { generateGeminiJson, geminiErrorResponse } from "@/lib/ai/gemini";
import { storeSmartReport } from "@/lib/admin/admin-reports";
import { requireAdminAuth } from "@/lib/admin-server/require-admin-auth";

export async function POST(request: Request) {
  const auth = await requireAdminAuth(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { eventIds?: string[]; reportType?: string; sections?: string[]; refresh?: boolean };
  try {
    body = await request.json().catch(() => ({}));
  } catch {
    body = {};
  }

  const eventIds = Array.isArray(body.eventIds) ? body.eventIds.map(String) : [];
  const reportType = String(body.reportType || "event-summary").trim();
  const sections = Array.isArray(body.sections) ? body.sections.map(String) : [];

  try {
    const context = await loadReportAiContext(eventIds);
    const focusTitles = context.events.map((item) => item.event.title).join(", ");
    const result = await generateGeminiJson<{
      executiveSummary?: string;
      rationale?: string;
      objectives?: string;
      highlights?: string;
      recommendations?: string;
      conclusion?: string;
    }>(
      `You are the DC Space Smart Report Assistant. Write an admin report draft from campus event data.
Report type: ${reportType || "event-summary"}
Requested sections: ${JSON.stringify(sections)}
Focus events: ${focusTitles || "campus snapshot"}
Return JSON only:
{
  "executiveSummary": "2-4 sentences",
  "rationale": "2-3 sentences",
  "objectives": "2-3 sentences or short bullets separated by newlines",
  "highlights": "2-3 sentences",
  "recommendations": "3 short recommendations separated by newlines",
  "conclusion": "2 sentences"
}
Be specific to the counts and named events. Do not invent student names.
If a requested section is attendance, emphasize tap-in/out and duration.
If feedback, emphasize ratings and comment themes.
If certificate, emphasize qualified attendance.

Campus + event snapshot:
${JSON.stringify(context, null, 2)}`,
      {
        cacheKey: `report:${reportType}:${eventIds.join(",")}:${context.campus.totals.attendanceCount}:${context.campus.totals.feedbackCount}`,
        skipCache: Boolean(body.refresh),
      },
    );

    const eventTitles = context.events.map((item) => item.event.title);
    const draft = {
      executiveSummary: String(result.executiveSummary || ""),
      rationale: String(result.rationale || ""),
      objectives: String(result.objectives || ""),
      highlights: String(result.highlights || ""),
      recommendations: String(result.recommendations || ""),
      conclusion: String(result.conclusion || ""),
    };

    let storedReportId = "";
    try {
      const stored = await storeSmartReport({
        reportType,
        eventTitles,
        generatedBy: auth.session.name,
        generatedByEmail: auth.session.email,
        draft,
      });
      storedReportId = stored.id;
    } catch (error) {
      console.warn("[DC Space] Failed to store smart report in admin_reports:", error);
    }

    return NextResponse.json({
      ...draft,
      eventTitles,
      storedReportId,
    });
  } catch (error) {
    const mapped = geminiErrorResponse(error);
    return NextResponse.json(
      {
        error: mapped.error,
        details: "details" in mapped ? mapped.details : undefined,
        code: "code" in mapped ? mapped.code : undefined,
      },
      { status: mapped.status },
    );
  }
}
