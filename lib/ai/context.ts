import { ObjectId } from "mongodb";
import { eventsCollection } from "@/lib/events/types";
import {
  attendanceCollection,
  certificatesCollection,
  feedbackCollection,
} from "@/lib/user-server/activity";
import { loadAttendanceSecurityStats } from "@/lib/user-server/attendance-security";
import { getAdminDb, getUserDb } from "@/lib/db/get-db";
import { registrationsCollection } from "@/lib/user-server/portal";

function hourLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", { hour: "numeric", hour12: true });
}

function stampOf(row: { scannedAt?: unknown; createdAt?: unknown } | Record<string, unknown>) {
  const stamp = new Date(String(row.scannedAt || row.createdAt || "")).getTime();
  return Number.isFinite(stamp) ? stamp : 0;
}

function formatClock(ms: number) {
  return new Date(ms).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function peakFromHours(hours: string[]) {
  if (!hours.length) return { peakPeriod: "TBA", lowestPeriod: "TBA" };
  const counts = new Map<string, number>();
  hours.forEach((hour) => counts.set(hour, (counts.get(hour) || 0) + 1));
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return {
    peakPeriod: ranked[0]?.[0] || "TBA",
    lowestPeriod: ranked[ranked.length - 1]?.[0] || "TBA",
  };
}

/** Densest 30-minute arrival window from tap-in timestamps. */
function peakArrivalWindow(tapInStamps: number[]) {
  const stamps = tapInStamps.filter((n) => n > 0).sort((a, b) => a - b);
  if (!stamps.length) {
    return { peakPeriod: "TBA", peakHourCount: 0, predictedPeakTime: "TBA" };
  }
  if (stamps.length === 1) {
    const label = formatClock(stamps[0]);
    return {
      peakPeriod: label,
      peakHourCount: 1,
      predictedPeakTime: `Around ${label}`,
    };
  }

  const windowMs = 30 * 60 * 1000;
  let bestStart = stamps[0];
  let bestCount = 1;
  let left = 0;
  for (let right = 0; right < stamps.length; right += 1) {
    while (stamps[right] - stamps[left] > windowMs) left += 1;
    const count = right - left + 1;
    if (count > bestCount) {
      bestCount = count;
      bestStart = stamps[left];
    }
  }
  const bestEnd = bestStart + windowMs;
  const predictedPeakTime = `Between ${formatClock(bestStart)} to ${formatClock(bestEnd)}`;
  return {
    peakPeriod: predictedPeakTime,
    peakHourCount: bestCount,
    predictedPeakTime,
  };
}

function rateLabel(count: number, windowMinutes: number, noun = "people") {
  if (count <= 0) return `0 ${noun} / ${windowMinutes} min`;
  if (windowMinutes <= 1) return `${count} ${noun} per minute`;
  const perMinute = count / windowMinutes;
  if (perMinute >= 1) {
    const rounded = Math.round(perMinute * 10) / 10;
    return `${rounded} ${noun} per minute`;
  }
  return `${count} ${noun} per ${windowMinutes} minutes`;
}

function sentimentFromRating(avgRating: number) {
  if (avgRating >= 4.2) return "Positive";
  if (avgRating >= 3) return "Mixed";
  if (avgRating > 0) return "Needs attention";
  return "Pending";
}

export async function loadEventAiContext(eventId: string) {
  const userDb = await getUserDb();
  const adminDb = await getAdminDb();
  if (!ObjectId.isValid(eventId)) return null;
  const event = await eventsCollection(adminDb).findOne({ _id: new ObjectId(eventId) });
  if (!event) return null;

  const [registrationCount, attendanceDocs, feedbackDocs, savedCount, security] =
    await Promise.all([
    registrationsCollection(userDb).countDocuments({
      eventId,
      status: { $in: ["joined", "approved"] },
    }),
    attendanceCollection(userDb)
      .find({ eventId })
      .sort({ scannedAt: 1, createdAt: 1 })
      .limit(5000)
      .toArray(),
    feedbackCollection(userDb).find({ eventId }).limit(80).toArray(),
    userDb.collection("saved_events").countDocuments({ eventIds: eventId }).catch(() => 0),
    loadAttendanceSecurityStats(eventId),
  ]);

  const tapIn = attendanceDocs.filter((row) => String(row.action || "in") === "in").length;
  const tapOut = attendanceDocs.filter((row) => String(row.action) === "out").length;
  const qualified = attendanceDocs.filter((row) => Boolean(row.qualifiedForCertificate)).length;
  const minutes = attendanceDocs.map((row) => Number(row.attendanceMinutes || 0)).filter((n) => n > 0);
  const avgMinutes = minutes.length
    ? Math.round(minutes.reduce((sum, n) => sum + n, 0) / minutes.length)
    : 0;
  const ratings = feedbackDocs.map((row) => Number(row.rating || 0)).filter((n) => n > 0);
  const avgRating = ratings.length
    ? Number((ratings.reduce((sum, n) => sum + n, 0) / ratings.length).toFixed(1))
    : 0;

  const byEmail = new Map<string, number>();
  attendanceDocs.forEach((row) => {
    const email = String(row.email || "").toLowerCase();
    if (!email) return;
    byEmail.set(email, (byEmail.get(email) || 0) + 1);
  });
  const highScanParticipants = [...byEmail.values()].filter((count) => count > 4).length;
  const duplicateScans = security.duplicateScans;
  const tapInDocs = attendanceDocs.filter((row) => String(row.action || "in") === "in");
  const tapInHours = tapInDocs
    .map((row) => hourLabel(String(row.scannedAt || row.createdAt || "")))
    .filter(Boolean);
  const hourPeaks = peakFromHours(tapInHours);
  const tapInStamps = tapInDocs.map((row) => stampOf(row));
  const arrivalPeak = peakArrivalWindow(tapInStamps);
  const peakPeriod = arrivalPeak.peakPeriod !== "TBA" ? arrivalPeak.peakPeriod : hourPeaks.peakPeriod;
  const lowestPeriod = hourPeaks.lowestPeriod;
  const peakHourCount = arrivalPeak.peakHourCount;

  const uniqueTapIns = new Set(
    tapInDocs.map((row) => String(row.email || "").toLowerCase()).filter(Boolean),
  ).size;

  const recentWindowMinutes = 15;
  const recentCutoff = Date.now() - recentWindowMinutes * 60 * 1000;
  const recentDocs = attendanceDocs.filter((row) => stampOf(row) >= recentCutoff);
  const recentTapIn = recentDocs.filter((row) => String(row.action || "in") === "in").length;
  const recentTapOut = recentDocs.filter((row) => String(row.action) === "out").length;
  const entryRate = rateLabel(recentTapIn, recentWindowMinutes);
  const exitRate = rateLabel(recentTapOut, recentWindowMinutes);

  // Chronological open-session reconstruction (oldest → newest).
  const openTapIns = new Set<string>();
  for (const row of attendanceDocs) {
    const email = String(row.email || "").toLowerCase();
    if (!email) continue;
    if (String(row.action || "in") === "in") openTapIns.add(email);
    else openTapIns.delete(email);
  }
  const currentlyInside = openTapIns.size;
  const attendanceRate = registrationCount
    ? Math.round((uniqueTapIns / registrationCount) * 100)
    : 0;
  const venueCapacity = Math.max(0, Number(event.reservationCapacity || 0));

  return {
    event: {
      id: eventId,
      title: event.title,
      description: event.description || "",
      status: event.status,
      location: event.location || "",
      venueType: event.venueType || "",
      category: event.category || "",
      startsAt: event.startsAt || "",
      endsAt: event.endsAt || "",
      attendanceRequired: event.attendanceRequired || "",
      gracePeriod: event.gracePeriod || "",
      allowedCourses: event.allowedCourses || [],
      requiredFiles: event.requiredFiles || [],
      speakers: event.speakers || [],
      collaboratingDepartments: event.collaboratingDepartments || [],
      programActivities: event.programActivities || [],
      organizerName: event.organizerName || event.organizerEmail || "",
      reservationCapacity: venueCapacity,
    },
    stats: {
      registrations: registrationCount,
      tapIn,
      tapOut,
      currentlyInside,
      attendanceRate: Math.min(100, attendanceRate),
      venueCapacity,
      qualifiedForCertificate: qualified,
      uniqueScans: attendanceDocs.length,
      uniqueParticipants: byEmail.size,
      averageAttendanceMinutes: avgMinutes,
      avgDurationLabel: avgMinutes ? `${avgMinutes} min` : "—",
      feedbackCount: feedbackDocs.length,
      averageRating: avgRating,
      overallSentiment: sentimentFromRating(avgRating),
      savedInterest: savedCount,
      duplicateScans,
      duplicateWarnings: security.duplicateWarnings,
      highScanParticipants,
      rapidConsecutiveScans: security.rapidConsecutiveScans + security.concurrentEventTaps,
      invalidScans: security.invalidScans,
      concurrentEventTaps: security.concurrentEventTaps,
      manualOverrideCount: security.manualOverrideCount,
      totalSecurityEvents: security.totalSecurityEvents,
      securityRisk: security.securityRisk,
      securityEvents: security.recentEvents,
      peakPeriod,
      lowestPeriod,
      uniqueTapIns,
      peakHourCount,
      recentTapIn,
      recentTapOut,
      recentWindowMinutes,
      entryRate,
      exitRate,
      predictedPeakTime: arrivalPeak.predictedPeakTime,
    },
    feedbackSamples: feedbackDocs
      .map((row) => String(row.comment || "").trim())
      .filter(Boolean)
      .slice(0, 8),
  };
}

export async function loadUserAiContext(userId: string) {
  const userDb = await getUserDb();
  if (!ObjectId.isValid(userId)) return null;
  const user = await userDb.collection("users").findOne({ _id: new ObjectId(userId) });
  if (!user) return null;
  const email = String(user.email || "").toLowerCase();

  const [attendanceDocs, registrationCount, certificateCount, feedbackCount] = await Promise.all([
    attendanceCollection(userDb).find({ email }).limit(120).toArray(),
    registrationsCollection(userDb).countDocuments({ email }),
    certificatesCollection(userDb).countDocuments({ email }),
    feedbackCollection(userDb).countDocuments({ email }),
  ]);

  const qualified = attendanceDocs.filter((row) => Boolean(row.qualifiedForCertificate)).length;
  const tapOut = attendanceDocs.filter((row) => String(row.action) === "out").length;
  const minutes = attendanceDocs.map((row) => Number(row.attendanceMinutes || 0));
  const avgMinutes = minutes.length
    ? Math.round(minutes.reduce((sum, n) => sum + n, 0) / minutes.length)
    : 0;

  return {
    user: {
      id: userId,
      name: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
      role: String(user.role || "student"),
      course: String(user.course || ""),
      school: String(user.school || ""),
      organization: String(user.organizationPart || ""),
      organizationRole: String(user.organizationRole || ""),
    },
    stats: {
      registrations: registrationCount,
      attendanceRecords: attendanceDocs.length,
      qualifiedSessions: qualified,
      tapOuts: tapOut,
      certificates: certificateCount,
      feedbackSubmitted: feedbackCount,
      averageAttendanceMinutes: avgMinutes,
    },
  };
}

export async function loadCampusAiContext(limit = 12) {
  const userDb = await getUserDb();
  const adminDb = await getAdminDb();
  const events = await eventsCollection(adminDb)
    .find({})
    .sort({ updatedAt: -1 })
    .limit(limit)
    .toArray();

  const [pending, live, completed, attendanceCount, feedbackCount, userCount] = await Promise.all([
    eventsCollection(adminDb).countDocuments({ status: "pending" }),
    eventsCollection(adminDb).countDocuments({ status: "live" }),
    eventsCollection(adminDb).countDocuments({ status: "completed" }),
    attendanceCollection(userDb).countDocuments({}),
    feedbackCollection(userDb).countDocuments({}),
    userDb.collection("users").countDocuments({ role: { $nin: ["admin", "super-admin"] } }),
  ]);

  return {
    totals: { pending, live, completed, attendanceCount, feedbackCount, userCount },
    recentEvents: events.map((event) => ({
      id: String(event._id),
      title: event.title,
      status: event.status,
      location: event.location || "",
      startsAt: event.startsAt || "",
      organizerName: event.organizerName || event.organizerEmail || "",
    })),
  };
}

export async function loadReportAiContext(eventIds: string[]) {
  const campus = await loadCampusAiContext(12);
  const uniqueIds = [...new Set(eventIds.map((id) => String(id).trim()).filter(Boolean))].slice(0, 8);
  const events = [];
  for (const eventId of uniqueIds) {
    const context = await loadEventAiContext(eventId);
    if (context) events.push(context);
  }

  if (!events.length) {
    const recent = campus.recentEvents.slice(0, 4);
    for (const row of recent) {
      const context = await loadEventAiContext(row.id);
      if (context) events.push(context);
    }
  }

  return { campus, events };
}

export async function loadStudentAiContext(email: string) {
  const userDb = await getUserDb();
  const adminDb = await getAdminDb();
  const normalized = email.trim().toLowerCase();
  const user = await userDb.collection("users").findOne({ email: normalized });
  const events = await eventsCollection(adminDb)
    .find({ status: { $in: ["approved", "live"] } })
    .sort({ startsAt: 1 })
    .limit(16)
    .toArray();

  const [registrationCount, attendanceCount, certificateCount] = await Promise.all([
    registrationsCollection(userDb).countDocuments({ email: normalized }),
    attendanceCollection(userDb).countDocuments({ email: normalized }),
    certificatesCollection(userDb).countDocuments({ email: normalized }),
  ]);

  return {
    student: {
      name: user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() : "",
      course: String(user?.course || ""),
      school: String(user?.school || ""),
      organization: String(user?.organizationPart || ""),
      registrations: registrationCount,
      attendanceRecords: attendanceCount,
      certificates: certificateCount,
    },
    upcomingEvents: events.map((event) => ({
      id: String(event._id),
      title: event.title,
      category: event.category || "",
      location: event.location || "",
      startsAt: event.startsAt || "",
      allowedCourses: event.allowedCourses || [],
    })),
  };
}
