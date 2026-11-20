import { NextResponse } from "next/server";
import { generateGeminiJson, geminiErrorResponse } from "@/lib/ai/gemini";
import {
  buildProgramFlowPdf,
  formatTimedActivityLabel,
  normalizeTimedActivities,
} from "@/lib/ai/program-flow-pdf";
import { requireSessionActor } from "@/lib/user-server/session-auth";

/** Standard SDCA event flow used when Gemini is busy or unavailable. */
function fallbackActivities(eventType: string): string[] {
  const type = eventType.toLowerCase();
  const core = /seminar|talk|lecture|forum|webinar|symposium/.test(type)
    ? ["Introduction of the resource speaker", "Talk / lecture proper", "Open forum (Q&A)"]
    : /workshop|training|bootcamp|hackathon/.test(type)
      ? ["Overview of the workshop", "Hands-on session", "Presentation of outputs"]
      : /assembly|meeting|orientation|oath/.test(type)
        ? ["Presentation of agenda", "Main program proper", "Open forum and announcements"]
        : ["Main program proper", "Activities and presentations", "Open forum (Q&A)"];
  return [
    "Arrival and registration (RFID tap-in)",
    "Opening prayer and Philippine National Anthem",
    "Welcome remarks",
    ...core,
    "Mid-event survey",
    "Awarding of certificates and closing remarks",
    "Photo opportunity and RFID tap-out",
  ];
}

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
    let activities: string[] = [];
    let notes = "";
    let aiAvailable = true;
    try {
      const result = await generateGeminiJson<{ activities?: unknown; notes?: unknown }>(prompt, {
        cacheKey: `program-flow:${title}:${body.eventType || ""}:${body.startDate || ""}:${body.startTime || ""}:${body.endTime || ""}:${body.venue || ""}`,
      });
      activities = Array.isArray(result.activities)
        ? result.activities.map((item) => String(item).trim()).filter(Boolean).slice(0, 12)
        : [];
      notes = String(result.notes || "").trim();
    } catch (error) {
      console.warn("[DC Space] Gemini program flow unavailable, using standard flow.", error);
    }
    if (!activities.length) {
      aiAvailable = false;
      activities = fallbackActivities(String(body.eventType || ""));
      notes = "Standard program flow (AI suggestions were unavailable) — edit the activities as needed.";
    }

    const timedActivities = normalizeTimedActivities(
      activities,
      body.startTime || "08:00",
      body.endTime || "12:00",
    );
    const pdf = await buildProgramFlowPdf({
      title,
      eventType: body.eventType,
      venue: body.venue,
      venueType: body.venueType,
      startDate: body.startDate,
      endDate: body.endDate,
      startTime: body.startTime,
      endTime: body.endTime,
      notes,
      activities: timedActivities,
    });

    return NextResponse.json({
      activities: timedActivities.map(formatTimedActivityLabel),
      notes,
      pdf,
      aiAvailable,
    });
  } catch (error) {
    const mapped = geminiErrorResponse(error);
    return NextResponse.json(
      { error: mapped.error, details: "details" in mapped ? mapped.details : undefined, code: "code" in mapped ? mapped.code : undefined },
      { status: mapped.status },
    );
  }
}
