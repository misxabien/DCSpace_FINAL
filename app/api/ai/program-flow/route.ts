import { NextResponse } from "next/server";
import { generateGeminiJson, geminiErrorResponse } from "@/lib/ai/gemini";
import { requireSessionActor } from "@/lib/user-server/session-auth";

export async function POST(request: Request) {
  const actor = await requireSessionActor(request);
  if ("error" in actor) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  let body: {
    title?: string;
    eventType?: string;
    venue?: string;
    venueType?: string;
    startDate?: string;
    endDate?: string;
    startTime?: string;
    endTime?: string;
    courses?: string[];
    description?: string;
    announcements?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const title = String(body.title || "").trim();
  if (!title) {
    return NextResponse.json({ error: "Event title is required." }, { status: 400 });
  }

  const prompt = `You are an event programming assistant for SDCA (St. Dominic College of Asia) campus events in the Philippines.
Suggest a practical program flow (ordered activity list) for this event.
Return JSON only with this shape:
{"activities":["Welcome remarks","..."],"notes":"one short sentence"}
Rules:
- 5 to 10 activities
- Keep each activity under 80 characters
- Match the event type, venue, and audience
- Do not invent sponsors or specific celebrity names

Event:
${JSON.stringify(
    {
      title,
      eventType: body.eventType || "",
      venue: body.venue || "",
      venueType: body.venueType || "",
      startDate: body.startDate || "",
      endDate: body.endDate || "",
      startTime: body.startTime || "",
      endTime: body.endTime || "",
      courses: body.courses || [],
      description: body.description || "",
      announcements: body.announcements || "",
    },
    null,
    2,
  )}`;

  try {
    const result = await generateGeminiJson<{ activities?: unknown; notes?: unknown }>(prompt, {
      cacheKey: `program-flow:${title}:${body.eventType || ""}:${body.startDate || ""}:${body.venue || ""}`,
    });
    const activities = Array.isArray(result.activities)
      ? result.activities.map((item) => String(item).trim()).filter(Boolean).slice(0, 12)
      : [];
    if (!activities.length) {
      return NextResponse.json({ error: "Gemini did not return activities." }, { status: 502 });
    }
    return NextResponse.json({
      activities,
      notes: String(result.notes || "").trim(),
    });
  } catch (error) {
    const mapped = geminiErrorResponse(error);
    return NextResponse.json(
      { error: mapped.error, details: "details" in mapped ? mapped.details : undefined, code: "code" in mapped ? mapped.code : undefined },
      { status: mapped.status },
    );
  }
}
