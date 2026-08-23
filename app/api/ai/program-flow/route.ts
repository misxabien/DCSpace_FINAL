import { NextResponse } from "next/server";
import { generateGeminiJson, geminiErrorResponse } from "@/lib/ai/gemini";
import {
  buildProgramFlowPdf,
  formatTimedActivityLabel,
  normalizeTimedActivities,
} from "@/lib/ai/program-flow-pdf";
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

  const startTime = String(body.startTime || "08:00").trim() || "08:00";
  const endTime = String(body.endTime || "12:00").trim() || "12:00";

  const prompt = `You are an event programming assistant for SDCA (St. Dominic College of Asia) campus events in the Philippines.
Suggest a practical program flow with suggested clock times for each activity.
Return JSON only with this shape:
{"activities":[{"title":"Registration and Attendance Verification","startTime":"08:00","endTime":"08:20"},{"title":"Opening Remarks","startTime":"08:20","endTime":"08:35"}],"notes":"one short sentence"}
Rules:
- 5 to 10 activities
- Keep each title under 80 characters
- Use 24-hour HH:MM times that fit inside the event window (${startTime} to ${endTime})
- Times must be sequential with no overlaps
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
      startTime,
      endTime,
      courses: body.courses || [],
      description: body.description || "",
      announcements: body.announcements || "",
    },
    null,
    2,
  )}`;

  try {
    const result = await generateGeminiJson<{ activities?: unknown; notes?: unknown }>(prompt, {
      cacheKey: `program-flow-v2:${title}:${body.eventType || ""}:${body.startDate || ""}:${startTime}:${endTime}:${body.venue || ""}`,
    });

    const timed = normalizeTimedActivities(result.activities, startTime, endTime);
    if (!timed.length) {
      return NextResponse.json({ error: "Gemini did not return activities." }, { status: 502 });
    }

    const notes = String(result.notes || "").trim();
    const activities = timed.map(formatTimedActivityLabel);
    const pdf = await buildProgramFlowPdf({
      title,
      eventType: body.eventType || "",
      venue: body.venue || "",
      venueType: body.venueType || "",
      startDate: body.startDate || "",
      endDate: body.endDate || "",
      startTime,
      endTime,
      notes,
      activities: timed,
    });

    return NextResponse.json({
      activities,
      timedActivities: timed,
      notes,
      pdf,
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
