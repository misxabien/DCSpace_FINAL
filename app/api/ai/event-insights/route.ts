import { NextResponse } from "next/server";
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

    const result = await generateGeminiJson<{
      expectedAttendees?: number;
      expectedAttendanceRate?: number;
      predictionConfidence?: number;
      capacityRisk?: string;
      overbookingRisk?: string;
      underutilizationRisk?: string;
      capacityConclusion?: string;
      crowdInsight?: string;
      attendanceInsight?: string;
      securityInsight?: string;
      eventSummary?: string;
      performanceSummary?: string;
      futureRecommendations?: string;
      peakPeriod?: string;
      lowestPeriod?: string;
      avgDurationLabel?: string;
      comparedToPrediction?: number;
      crowdDensity?: string;
      congestionRisk?: string;
      predictedPeakTime?: string;
      predictedPeakOccupancy?: number;
      crowdFlow?: string;
      flowStatus?: string;
      securityRisk?: string;
      overallSentiment?: string;
      interestFlow?: string;
      registrationStatus?: string;
      recommendations?: unknown;
    }>(
      `You are DC Space campus admin AI. Analyze this live event snapshot and return JSON only:
{
  "expectedAttendees": 0,
  "expectedAttendanceRate": 0,
  "predictionConfidence": 0,
  "capacityRisk": "Low Risk|Moderate Risk|Critical Risk",
  "overbookingRisk": "Low|Moderate|High|Pending",
  "underutilizationRisk": "Low Risk|Moderate Risk|Critical Risk",
  "capacityConclusion": "2-3 sentences",
  "crowdInsight": "1-2 sentences",
  "attendanceInsight": "1-2 sentences",
  "securityInsight": "1-2 sentences about RFID/tap anomalies",
  "eventSummary": "2-3 sentences",
  "performanceSummary": "1-2 sentences",
  "futureRecommendations": "1-2 sentences",
  "peakPeriod": "short label",
  "lowestPeriod": "short label",
  "avgDurationLabel": "e.g. 42 min",
  "comparedToPrediction": 0,
  "crowdDensity": "Low|Moderate|High",
  "congestionRisk": "Low|Moderate|High",
  "predictedPeakTime": "short label",
  "predictedPeakOccupancy": 0,
  "crowdFlow": "Stable|Building|Clearing",
  "flowStatus": "Normal|Watch|Alert",
  "securityRisk": "Low|Moderate|High",
  "overallSentiment": "Positive|Mixed|Needs attention|Pending",
  "interestFlow": "Rising|Steady|Falling",
  "registrationStatus": "Open|Closing|Closed|Complete",
  "recommendations": ["bullet 1","bullet 2","bullet 3"]
}
Rates are 0-100 integers. Base claims on the numbers. If data is sparse, say so and keep risk Low.

Data:
${JSON.stringify(context, null, 2)}`,
      {
        cacheKey: `event-insights:${eventId}:${context.stats.registrations}:${context.stats.uniqueScans}:${context.stats.feedbackCount}`,
        skipCache: Boolean(body.refresh),
      },
    );

    const recommendations = Array.isArray(result.recommendations)
      ? result.recommendations.map((item) => String(item).trim()).filter(Boolean).slice(0, 6)
      : [];

    return NextResponse.json({
      eventId,
      aiAvailable: true,
      expectedAttendees: Number(result.expectedAttendees || context.stats.registrations || 0),
      expectedAttendanceRate: Number(result.expectedAttendanceRate || context.stats.attendanceRate || 0),
      predictionConfidence: Number(result.predictionConfidence || 0),
      capacityRisk: String(result.capacityRisk || "Moderate Risk"),
      overbookingRisk: String(result.overbookingRisk || "Pending"),
      underutilizationRisk: String(result.underutilizationRisk || "Low Risk"),
      capacityConclusion: String(result.capacityConclusion || ""),
      crowdInsight: String(result.crowdInsight || ""),
      attendanceInsight: String(result.attendanceInsight || ""),
      securityInsight: String(result.securityInsight || ""),
      eventSummary: String(result.eventSummary || ""),
      performanceSummary: String(result.performanceSummary || ""),
      futureRecommendations: String(result.futureRecommendations || ""),
      peakPeriod: String(result.peakPeriod || context.stats.peakPeriod),
      lowestPeriod: String(result.lowestPeriod || context.stats.lowestPeriod),
      avgDurationLabel: String(result.avgDurationLabel || context.stats.avgDurationLabel),
      comparedToPrediction: Number(result.comparedToPrediction || result.expectedAttendanceRate || context.stats.attendanceRate || 0),
      tappedIn: context.stats.tapIn,
      tappedOut: context.stats.tapOut,
      currentlyInside: context.stats.currentlyInside,
      attendanceRate: context.stats.attendanceRate,
      registrations: context.stats.registrations,
      savedInterest: context.stats.savedInterest,
      feedbackCount: context.stats.feedbackCount,
      averageRating: context.stats.averageRating,
      overallSentiment: String(result.overallSentiment || context.stats.overallSentiment),
      crowdDensity: String(result.crowdDensity || "Low"),
      congestionRisk: String(result.congestionRisk || "Low"),
      predictedPeakTime: String(result.predictedPeakTime || context.stats.peakPeriod),
      predictedPeakOccupancy: Number(result.predictedPeakOccupancy || context.stats.currentlyInside),
      crowdFlow: String(result.crowdFlow || "Stable"),
      flowStatus: String(result.flowStatus || "Normal"),
      securityRisk: String(result.securityRisk || (context.stats.duplicateScans ? "Moderate" : "Low")),
      duplicateScans: context.stats.duplicateScans,
      interestFlow: String(result.interestFlow || "Steady"),
      registrationStatus: String(result.registrationStatus || "Open"),
      recommendations,
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
