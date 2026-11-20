import { NextResponse } from "next/server";
import { loadCampusAiContext } from "@/lib/ai/context";
import { generateGeminiJson, isAiConfigured } from "@/lib/ai/gemini";
import { requireAdminAuth } from "@/lib/admin-server/require-admin-auth";

type Insight = { title: string; body: string; tone: string };
type CampusContext = Awaited<ReturnType<typeof loadCampusAiContext>>;

/** Rule-based insights from the live DB snapshot, used when Gemini is off or fails. */
function fallbackInsights(context: CampusContext): Insight[] {
  const t = context.totals;
  const items: Insight[] = [];
  items.push(
    t.pending > 0
      ? {
          title: "Pending approvals",
          body: `${t.pending} event request(s) are waiting for review.`,
          tone: t.pending >= 5 ? "red" : "yellow",
        }
      : { title: "Approvals clear", body: "No event requests are waiting for review.", tone: "blue" },
  );
  items.push(
    t.live > 0
      ? {
          title: "Live now",
          body: `${t.live} event(s) are live. Keep the RFID desk open for tap-in and tap-out.`,
          tone: "blue",
        }
      : { title: "No live events", body: "No events are live right now.", tone: "blue" },
  );
  items.push({
    title: "Attendance records",
    body: `${t.attendanceCount} RFID attendance record(s) across ${t.completed} completed event(s).`,
    tone: "blue",
  });
  items.push(
    t.completed > 0 && t.feedbackCount === 0
      ? {
          title: "Feedback missing",
          body: "Completed events have no survey feedback yet. Remind participants to answer.",
          tone: "yellow",
        }
      : {
          title: "Feedback",
          body: `${t.feedbackCount} feedback response(s) from ${t.userCount} registered user(s).`,
          tone: "blue",
        },
  );
  return items;
}

export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const context = await loadCampusAiContext(10);
  if (!isAiConfigured()) {
    return NextResponse.json({ items: fallbackInsights(context), aiAvailable: false });
  }

  try {
    const result = await generateGeminiJson<{
      items?: Array<{ title?: string; body?: string; tone?: string }>;
    }>(
      `You are DC Space admin home AI. Return JSON only:
{"items":[{"title":"...","body":"one sentence","tone":"blue|yellow|red"}]}
Give 3 or 4 short operational insights from this snapshot. Use red only for real risk (pending pile-up, live events with no attendance, etc).

${JSON.stringify(context, null, 2)}`,
      `home-insights:${context.totals.pending}:${context.totals.live}:${context.totals.completed}:${context.totals.attendanceCount}:${context.totals.feedbackCount}`,
    );

    const items = Array.isArray(result.items)
      ? result.items
          .map((item) => ({
            title: String(item.title || "AI insight").trim(),
            body: String(item.body || "").trim(),
            tone: ["blue", "yellow", "red"].includes(String(item.tone))
              ? String(item.tone)
              : "blue",
          }))
          .filter((item) => item.body)
          .slice(0, 4)
      : [];

    return NextResponse.json({
      items: items.length ? items : fallbackInsights(context),
      aiAvailable: items.length > 0,
    });
  } catch (error) {
    console.error("[home-insights] Gemini failed, using rule-based insights", error);
    return NextResponse.json({ items: fallbackInsights(context), aiAvailable: false });
  }
}
