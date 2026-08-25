import { NextResponse } from "next/server";
import {
  analyticsNarrative,
  computeAttendanceAnalytics,
} from "@/lib/ai/attendance-analytics";
import { loadEventAiContext } from "@/lib/ai/context";
import { generateGeminiJson, geminiErrorResponse } from "@/lib/ai/gemini";
import { requireAdminAuth } from "@/lib/admin-server/require-admin-auth";

export async function POST(request: Request) {
  const auth = await requireAdminAuth(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { eventId?: string; refresh?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const eventId = String(body.eventId || "").trim();
  if (!eventId) {
    return NextResponse.json({ error: "eventId is required." }, { status: 400 });
  }

  try {
    const context = await loadEventAiContext(eventId);
    if (!context) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }

    const analyticsInput = {
      status: String(context.event.status || ""),
      registrations: context.stats.registrations,
      tapIn: context.stats.tapIn,
      tapOut: context.stats.tapOut,
      currentlyInside: context.stats.currentlyInside,
      uniqueParticipants: context.stats.uniqueParticipants,
      uniqueTapIns: Number(context.stats.uniqueTapIns || 0),
      savedInterest: context.stats.savedInterest,
      peakPeriod: context.stats.peakPeriod,
      peakHourCount: Number(context.stats.peakHourCount || 0),
      recentTapIn: Number(context.stats.recentTapIn || 0),
      recentTapOut: Number(context.stats.recentTapOut || 0),
      venueCapacity: Number(context.stats.venueCapacity || 0),
      predictedPeakTime: String(context.stats.predictedPeakTime || context.stats.peakPeriod || ""),
    };
    const analytics = computeAttendanceAnalytics(analyticsInput);
    const fallbackCopy = analyticsNarrative(analytics, analyticsInput, {
      location: context.event.location,
      venueCapacity: Number(context.stats.venueCapacity || 0),
    });

    let result: {
      capacityConclusion?: string;
      crowdInsight?: string;
      attendanceInsight?: string;
      securityInsight?: string;
      eventSummary?: string;
      performanceSummary?: string;
      futureRecommendations?: string;
      overallSentiment?: string;
      interestFlow?: string;
      registrationStatus?: string;
      recommendations?: unknown;
    } = {};
    let aiAvailable = false;

    try {
      result = await generateGeminiJson(
        `You are DC Space campus admin AI. Explain the AUTHORITATIVE metrics below. Do not invent different numbers or risk labels.
Return JSON only:
{
  "capacityConclusion": "2-3 sentences using the provided expected attendees, rate, and capacity risk",
  "crowdInsight": "1-2 sentences using crowd density, occupancy, and congestion risk",
  "attendanceInsight": "1-2 sentences using crowd flow, tap-in/out, and flow status",
  "securityInsight": "1-2 sentences about RFID/tap anomalies",
  "eventSummary": "2-3 sentences",
  "performanceSummary": "1-2 sentences",
  "futureRecommendations": "1-2 sentences",
  "overallSentiment": "Positive|Mixed|Needs attention|Pending",
  "interestFlow": "Rising|Steady|Falling",
  "registrationStatus": "Open|Closing|Closed|Complete",
  "recommendations": ["bullet 1","bullet 2","bullet 3"]
}
If data is sparse, say so.

Authoritative metrics:
${JSON.stringify({ event: context.event, stats: context.stats, analytics }, null, 2)}`,
        {
          cacheKey: `event-insights:${eventId}:${context.stats.registrations}:${context.stats.currentlyInside}:${context.stats.tapIn}:${context.stats.tapOut}:${context.stats.feedbackCount}:${analytics.expectedAttendees}:${analytics.crowdFlow}:${analytics.crowdDensity}`,
          skipCache: Boolean(body.refresh),
        },
      );
      aiAvailable = true;
    } catch (error) {
      console.warn("[DC Space] Gemini event insights unavailable, using computed analytics.", error);
    }

    const recommendations = Array.isArray(result.recommendations)
      ? result.recommendations.map((item) => String(item).trim()).filter(Boolean).slice(0, 6)
      : [];

    return NextResponse.json({
      eventId,
      aiAvailable,
      expectedAttendees: analytics.expectedAttendees,
      expectedAttendanceRate: analytics.expectedAttendanceRate,
      predictionConfidence: analytics.predictionConfidence,
      capacityRisk: analytics.capacityRisk,
      overbookingRisk: analytics.overbookingRisk,
      underutilizationRisk: analytics.underutilizationRisk,
      occupancyPercent: analytics.occupancyPercent,
      capacityConclusion: String(result.capacityConclusion || fallbackCopy.capacityConclusion),
      crowdInsight: String(result.crowdInsight || fallbackCopy.crowdInsight),
      attendanceInsight: String(result.attendanceInsight || fallbackCopy.attendanceInsight),
      securityInsight: String(
        result.securityInsight ||
          (context.stats.totalSecurityEvents
            ? `${context.stats.totalSecurityEvents} suspicious alert(s): ${context.stats.duplicateScans} repeated duplicate${context.stats.duplicateScans === 1 ? "" : "s"}, ${context.stats.concurrentEventTaps || 0} concurrent event, ${context.stats.invalidScans} unregistered/invalid.${context.stats.duplicateWarnings ? ` ${context.stats.duplicateWarnings} warning(s).` : ""}`
            : context.stats.duplicateWarnings
              ? `${context.stats.duplicateWarnings} duplicate tap warning(s). No suspicious alerts yet.`
              : "No RFID scan errors recorded for this event yet."),
      ),
      eventSummary: String(result.eventSummary || `${context.event.title} is ${context.event.status}.`),
      performanceSummary: String(
        result.performanceSummary ||
          `Tap-in ${context.stats.tapIn}, tap-out ${context.stats.tapOut}, ${context.stats.currentlyInside} currently inside.`,
      ),
      futureRecommendations: String(
        result.futureRecommendations ||
          (analytics.congestionRisk === "High"
            ? "Open additional entry lanes and stagger arrivals near the predicted peak."
            : "Keep monitoring RFID taps and send reminders to registered students who have not arrived."),
      ),
      peakPeriod: context.stats.peakPeriod,
      lowestPeriod: context.stats.lowestPeriod,
      avgDurationLabel: context.stats.avgDurationLabel,
      comparedToPrediction: analytics.comparedToPrediction,
      tappedIn: context.stats.tapIn,
      tappedOut: context.stats.tapOut,
      currentlyInside: context.stats.currentlyInside,
      attendanceRate: context.stats.attendanceRate,
      registrations: context.stats.registrations,
      uniqueTapIns: context.stats.uniqueTapIns,
      venueCapacity: context.stats.venueCapacity,
      eventLocation: context.event.location,
      savedInterest: context.stats.savedInterest,
      feedbackCount: context.stats.feedbackCount,
      averageRating: context.stats.averageRating,
      overallSentiment: String(result.overallSentiment || context.stats.overallSentiment),
      crowdDensity: analytics.crowdDensity,
      congestionRisk: analytics.congestionRisk,
      predictedPeakTime: analytics.predictedPeakTime,
      predictedPeakOccupancy: analytics.predictedPeakOccupancy,
      crowdFlow: analytics.crowdFlow,
      flowStatus: analytics.flowStatusLabel,
      entryRate: String(context.stats.entryRate || "—"),
      exitRate: String(context.stats.exitRate || "—"),
      securityRisk: context.stats.securityRisk,
      duplicateScans: context.stats.duplicateScans,
      duplicateWarnings: context.stats.duplicateWarnings,
      rapidConsecutiveScans: context.stats.rapidConsecutiveScans,
      concurrentEventTaps: context.stats.concurrentEventTaps,
      invalidScans: context.stats.invalidScans,
      manualOverrideCount: context.stats.manualOverrideCount,
      securityEvents: context.stats.securityEvents,
      interestFlow: String(result.interestFlow || "Steady"),
      registrationStatus: String(result.registrationStatus || "Open"),
      recommendations: recommendations.length
        ? recommendations
        : [
            `Plan for ${analytics.expectedAttendees} attendees (${analytics.expectedAttendanceRate}% of registrations).`,
            `Crowd flow is ${analytics.crowdFlow}; status ${analytics.flowStatus}.`,
            `Density is ${analytics.crowdDensity} with ${analytics.congestionRisk.toLowerCase()} congestion risk.`,
          ],
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
