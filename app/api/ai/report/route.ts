import { NextResponse } from "next/server";
import { loadReportAiContext } from "@/lib/ai/context";
import { generateGeminiJson, geminiErrorResponse } from "@/lib/ai/gemini";
import { storeSmartReport } from "@/lib/admin/admin-reports";
import { requireAdminAuth } from "@/lib/admin-server/require-admin-auth";

type ReportContext = Awaited<ReturnType<typeof loadReportAiContext>>;

/** Report draft computed from DC Space records, used when Gemini is busy. */
function fallbackReportDraft(context: ReportContext) {
  const events = context.events;
  const titles = events.map((item) => item.event.title).filter(Boolean);
  const list = titles.length ? titles.join(", ") : "recent campus events";
  const sum = (pick: (s: ReportContext["events"][number]["stats"]) => number) =>
    events.reduce((total, item) => total + (Number(pick(item.stats)) || 0), 0);
  const registrations = sum((s) => s.registrations);
  const attendees = sum((s) => s.uniqueParticipants);
  const qualified = sum((s) => s.qualifiedForCertificate);
  const feedback = sum((s) => s.feedbackCount);
  const rated = events.filter((item) => Number(item.stats.averageRating) > 0);
  const avgRating = rated.length
    ? Math.round((rated.reduce((t, item) => t + Number(item.stats.averageRating), 0) / rated.length) * 10) / 10
    : 0;
  const rate = registrations ? Math.round((attendees / registrations) * 100) : 0;
  const t = context.campus.totals;

  const executiveSummary = events.length
    ? `This report covers ${list}. ${registrations} participant(s) registered and ${attendees} attended through RFID tap-in (${rate}% turnout); ${qualified} met the attendance requirement for a certificate. ${feedback} feedback response(s) were collected${avgRating ? ` with an average rating of ${avgRating}/5` : ""}.`
    : `Campus snapshot: ${t.live} live, ${t.pending} pending and ${t.completed} completed event(s), with ${t.attendanceCount} RFID attendance record(s) and ${t.feedbackCount} feedback response(s).`;
  const highlights =
    events
      .map(({ event, stats }) => {
        const parts = [
          `${stats.registrations} registered`,
          `${stats.uniqueParticipants} attended (${stats.attendanceRate}%)`,
          stats.averageAttendanceMinutes ? `avg. stay ${stats.avgDurationLabel}` : "",
          stats.predictedPeakTime && !/^(tba|n\/a|—|-)$/i.test(String(stats.predictedPeakTime).trim()) ? `peak arrival ${stats.predictedPeakTime}` : "",
          stats.averageRating ? `rating ${stats.averageRating}/5 (${stats.overallSentiment})` : "",
        ].filter(Boolean);
        return `${event.title}: ${parts.join(", ")}.`;
      })
      .join("\n") || "No event-level records were selected for this report.";
  const recommendations: string[] = [];
  if (events.length && rate < 70) recommendations.push("Send reminders before the event to raise turnout among registered participants.");
  if (events.length && feedback === 0) recommendations.push("Prompt participants to answer the mid-event and post-event surveys.");
  if (events.some(({ stats }) => Number(stats.totalSecurityEvents) > 0)) recommendations.push("Review duplicate or suspicious RFID taps flagged at the attendance desk.");
  recommendations.push("Staff the RFID desk early, before the predicted peak arrival time.");
  recommendations.push("Reuse what worked well and address the lowest-rated parts in the next event plan.");

  return {
    executiveSummary,
    rationale: `This report documents attendance, engagement and feedback for ${list} to support evaluation and planning of future events.`,
    objectives: ["Measure turnout against registrations", "Review RFID attendance flow and duration", "Summarize participant feedback and certificate qualification"].join("\n"),
    highlights,
    recommendations: recommendations.slice(0, 4).join("\n"),
    conclusion: `The figures above are computed directly from DC Space records. ${avgRating >= 4 ? "Participants rated the events positively; keep the same format." : "Use the recommendations to improve the next events."}`,
  };
}

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
    type AiDraft = {
      executiveSummary?: string;
      rationale?: string;
      objectives?: string;
      highlights?: string;
      recommendations?: string;
      conclusion?: string;
    };
    let result: AiDraft & { __fallback?: boolean } = {};
    try {
      result = await generateGeminiJson<AiDraft>(
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
    } catch (error) {
      // Gemini busy / timed out: build the draft from DC Space records instead.
      console.warn("[DC Space] Gemini smart report unavailable, using data-driven draft.", error);
      result = { __fallback: true };
    }

    const eventTitles = context.events.map((item) => item.event.title);
    const fromAi = {
      executiveSummary: String(result.executiveSummary || ""),
      rationale: String(result.rationale || ""),
      objectives: String(result.objectives || ""),
      highlights: String(result.highlights || ""),
      recommendations: String(result.recommendations || ""),
      conclusion: String(result.conclusion || ""),
    };
    const aiAvailable = !result.__fallback && Boolean(fromAi.executiveSummary);
    const draft = aiAvailable ? fromAi : fallbackReportDraft(context);

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
      aiAvailable,
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
