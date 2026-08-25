export type CrowdFlow = "Stable" | "Building" | "Clearing";
export type FlowStatus = "Normal" | "Watch" | "Alert";
export type DensityLevel = "Low" | "Moderate" | "High";

export type EventAnalyticsInput = {
  status: string;
  registrations: number;
  tapIn: number;
  tapOut: number;
  currentlyInside: number;
  uniqueParticipants: number;
  uniqueTapIns: number;
  savedInterest: number;
  peakPeriod: string;
  peakHourCount: number;
  recentTapIn: number;
  recentTapOut: number;
  venueCapacity?: number;
  predictedPeakTime?: string;
};

export type AttendanceAnalytics = {
  expectedAttendees: number;
  expectedAttendanceRate: number;
  predictionConfidence: number;
  comparedToPrediction: number;
  crowdFlow: CrowdFlow;
  flowStatus: FlowStatus;
  crowdDensity: DensityLevel;
  congestionRisk: DensityLevel;
  predictedPeakTime: string;
  predictedPeakOccupancy: number;
  occupancyPercent: number;
  capacityRisk: string;
  overbookingRisk: string;
  underutilizationRisk: string;
  entryRateLabel?: string;
  exitRateLabel?: string;
  flowStatusLabel: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function densityFromOccupancy(occupancyPercent: number): DensityLevel {
  if (occupancyPercent >= 75) return "High";
  if (occupancyPercent >= 40) return "Moderate";
  return "Low";
}

/**
 * Deterministic attendance analytics from Mongo counts.
 * Gemini may explain these numbers but does not override them.
 */
export function computeAttendanceAnalytics(input: EventAnalyticsInput): AttendanceAnalytics {
  const registrations = Math.max(0, Number(input.registrations || 0));
  const tapIn = Math.max(0, Number(input.tapIn || 0));
  const tapOut = Math.max(0, Number(input.tapOut || 0));
  const currentlyInside = Math.max(0, Number(input.currentlyInside || 0));
  const uniqueTapIns = Math.max(0, Number(input.uniqueTapIns || 0));
  const uniqueParticipants = Math.max(0, Number(input.uniqueParticipants || 0));
  const savedInterest = Math.max(0, Number(input.savedInterest || 0));
  const peakHourCount = Math.max(0, Number(input.peakHourCount || 0));
  const recentTapIn = Math.max(0, Number(input.recentTapIn || 0));
  const recentTapOut = Math.max(0, Number(input.recentTapOut || 0));
  const venueCapacity = Math.max(0, Number(input.venueCapacity || 0));
  const status = String(input.status || "").toLowerCase();
  const liveOrDone = status === "live" || status === "completed";

  const observedShowRate =
    registrations > 0 && uniqueTapIns > 0
      ? clamp(uniqueTapIns / registrations, 0.35, 1)
      : 0.85;

  let expectedAttendees: number;
  if (liveOrDone && uniqueTapIns > 0) {
    const remaining = Math.max(0, registrations - uniqueTapIns);
    expectedAttendees = uniqueTapIns + Math.round(remaining * observedShowRate);
  } else if (registrations > 0) {
    const savedBoost = Math.round(savedInterest * 0.15);
    expectedAttendees = Math.round(registrations * 0.85) + savedBoost;
  } else {
    expectedAttendees = Math.round(savedInterest * 0.5);
  }
  expectedAttendees = Math.max(uniqueTapIns, uniqueParticipants, expectedAttendees);

  const expectedAttendanceRate = registrations
    ? clamp(Math.round((expectedAttendees / registrations) * 100), 0, 130)
    : uniqueTapIns > 0
      ? 100
      : 0;

  let predictionConfidence = 35;
  if (registrations > 0) predictionConfidence += 20;
  if (savedInterest > 0) predictionConfidence += 10;
  if (tapIn > 0) predictionConfidence += 20;
  if (status === "completed") predictionConfidence += 15;
  predictionConfidence = clamp(predictionConfidence, 0, 100);

  const actualRate = registrations ? clamp(Math.round((uniqueTapIns / registrations) * 100), 0, 100) : 0;
  const comparedToPrediction = liveOrDone && expectedAttendanceRate
    ? actualRate
    : expectedAttendanceRate;

  const recentNet = recentTapIn - recentTapOut;
  const overallNet = tapIn - tapOut;
  let crowdFlow: CrowdFlow = "Stable";
  if (recentTapIn + recentTapOut >= 3) {
    if (recentNet >= 3 && recentTapIn >= recentTapOut * 1.25) crowdFlow = "Building";
    else if (recentNet <= -3 && recentTapOut >= recentTapIn * 1.25) crowdFlow = "Clearing";
  } else if (tapIn + tapOut >= 4) {
    if (overallNet >= 4 && tapIn >= tapOut * 1.25) crowdFlow = "Building";
    else if (overallNet <= -4 && tapOut >= tapIn * 1.25) crowdFlow = "Clearing";
  }

  // Prefer real venue capacity for density; fall back to registrations / prediction.
  const densityBase = venueCapacity > 0
    ? venueCapacity
    : Math.max(registrations, expectedAttendees, currentlyInside, 1);
  const occupancyPercent = clamp(Math.round((currentlyInside / densityBase) * 100), 0, 100);
  const crowdDensity = densityFromOccupancy(occupancyPercent);

  let congestionRisk: DensityLevel = "Low";
  if (occupancyPercent >= 85 || (crowdDensity === "High" && crowdFlow === "Building")) {
    congestionRisk = "High";
  } else if (occupancyPercent >= 60 || crowdFlow === "Building") {
    congestionRisk = "Moderate";
  }

  let flowStatus: FlowStatus = "Normal";
  if (congestionRisk === "High" || Math.abs(recentNet) >= 12 || occupancyPercent >= 85) {
    flowStatus = "Alert";
  } else if (congestionRisk === "Moderate" || Math.abs(recentNet) >= 6 || occupancyPercent >= 60) {
    flowStatus = "Watch";
  }
  const flowStatusLabel =
    flowStatus === "Normal" ? "Normal Flow" : flowStatus === "Watch" ? "Watch" : "Alert";

  const capacityRisk =
    venueCapacity > 0 && currentlyInside >= venueCapacity
      ? "Critical Risk"
      : occupancyPercent >= 85 || expectedAttendanceRate >= 110
        ? "Critical Risk"
        : occupancyPercent >= 60 || expectedAttendanceRate >= 95
          ? "Moderate Risk"
          : "Low Risk";
  const predictedPeakOccupancy = Math.max(
    currentlyInside,
    peakHourCount,
    Math.round(expectedAttendees * (liveOrDone ? 0.7 : 0.6)),
  );

  const overbookingRisk =
    expectedAttendees > registrations && registrations > 0
      ? expectedAttendees - registrations >= 10
        ? "High"
        : "Moderate"
      : registrations === 0
        ? "Pending"
        : "Low";
  const underutilizationRisk =
    expectedAttendanceRate > 0 && expectedAttendanceRate < 40
      ? "Critical Risk"
      : expectedAttendanceRate > 0 && expectedAttendanceRate < 60
        ? "Moderate Risk"
        : "Low Risk";

  return {
    expectedAttendees,
    expectedAttendanceRate: clamp(expectedAttendanceRate, 0, 100),
    predictionConfidence,
    comparedToPrediction: clamp(comparedToPrediction, 0, 100),
    crowdFlow,
    flowStatus,
    crowdDensity,
    congestionRisk,
    predictedPeakTime: input.predictedPeakTime || input.peakPeriod || "TBA",
    predictedPeakOccupancy,
    occupancyPercent,
    capacityRisk,
    overbookingRisk,
    underutilizationRisk,
    flowStatusLabel,
  };
}

export function analyticsNarrative(
  analytics: AttendanceAnalytics,
  input: EventAnalyticsInput,
  meta?: { location?: string; venueCapacity?: number },
) {
  const location = String(meta?.location || "the venue").trim() || "the venue";
  const venueCapacity = Math.max(0, Number(meta?.venueCapacity || input.venueCapacity || 0));
  const capacityLabel = venueCapacity > 0 ? `${venueCapacity}` : "not set";

  return {
    capacityConclusion: `${input.registrations} participant(s) registered${venueCapacity > 0 ? ` against a venue capacity of ${venueCapacity}` : ""}. Predicted turnout is ${analytics.expectedAttendees} attendee(s) (${analytics.expectedAttendanceRate}% of registrations) with ${analytics.predictionConfidence}% confidence. ${input.currentlyInside} currently inside ${location} (${analytics.occupancyPercent}% utilization). Capacity risk is ${analytics.capacityRisk.toLowerCase()}.`,
    crowdInsight: `Live RFID records show ${input.uniqueTapIns} unique tap-in(s), ${input.tapIn} total tap-in record(s), and ${input.tapOut} tap-out record(s). Current occupancy is ${input.currentlyInside}. Crowd density is ${analytics.crowdDensity.toLowerCase()} at ${analytics.occupancyPercent}% occupancy (capacity ${capacityLabel}). Congestion risk is ${analytics.congestionRisk.toLowerCase()}; predicted peak ${analytics.predictedPeakTime} with about ${analytics.predictedPeakOccupancy} people.`,
    attendanceInsight: `Attendance flow is ${analytics.crowdFlow.toLowerCase()} (${input.tapIn} tap-in / ${input.tapOut} tap-out). Flow status is ${analytics.flowStatusLabel}. Peak arrival window: ${analytics.predictedPeakTime}.`,
  };
}
