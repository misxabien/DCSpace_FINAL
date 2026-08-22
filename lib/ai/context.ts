import { ObjectId } from "mongodb";
import { eventsCollection } from "@/lib/events/types";
import {
  attendanceCollection,
  certificatesCollection,
  feedbackCollection,
} from "@/lib/user-server/activity";
import { getUserDb } from "@/lib/user-server/get-user-db";
import { registrationsCollection } from "@/lib/user-server/portal";

function hourLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", { hour: "numeric", hour12: true });
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

function sentimentFromRating(avgRating: number) {
  if (avgRating >= 4.2) return "Positive";
  if (avgRating >= 3) return "Mixed";
  if (avgRating > 0) return "Needs attention";
  return "Pending";
}

export async function loadEventAiContext(eventId: string) {
  const db = await getUserDb();
  if (!ObjectId.isValid(eventId)) return null;
  const event = await eventsCollection(db).findOne({ _id: new ObjectId(eventId) });
  if (!event) return null;

  const [registrationCount, attendanceDocs, feedbackDocs, savedCount] = await Promise.all([
    registrationsCollection(db).countDocuments({ eventId }),
    attendanceCollection(db).find({ eventId }).limit(400).toArray(),
    feedbackCollection(db).find({ eventId }).limit(80).toArray(),
    db.collection("saved_events").countDocuments({ eventIds: eventId }).catch(() => 0),
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
  const duplicateScans = [...byEmail.values()].filter((count) => count > 4).length;
  const { peakPeriod, lowestPeriod } = peakFromHours(
    attendanceDocs
      .filter((row) => String(row.action || "in") === "in")
      .map((row) => hourLabel(String(row.scannedAt || row.createdAt || "")))
      .filter(Boolean),
  );

  const currentlyInside = Math.max(0, tapIn - tapOut);
  const attendanceRate = registrationCount
    ? Math.round((tapIn / registrationCount) * 100)
    : 0;

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
    },
    stats: {
      registrations: registrationCount,
      tapIn,
      tapOut,
      currentlyInside,
      attendanceRate: Math.min(100, attendanceRate),
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
      peakPeriod,
      lowestPeriod,
    },
    feedbackSamples: feedbackDocs
      .map((row) => String(row.comment || "").trim())
      .filter(Boolean)
      .slice(0, 8),
  };
}

export async function loadUserAiContext(userId: string) {
  const db = await getUserDb();
  if (!ObjectId.isValid(userId)) return null;
  const user = await db.collection("users").findOne({ _id: new ObjectId(userId) });
  if (!user) return null;
  const email = String(user.email || "").toLowerCase();

  const [attendanceDocs, registrationCount, certificateCount, feedbackCount] = await Promise.all([
    attendanceCollection(db).find({ email }).limit(120).toArray(),
    registrationsCollection(db).countDocuments({ email }),
    certificatesCollection(db).countDocuments({ email }),
    feedbackCollection(db).countDocuments({ email }),
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
  const db = await getUserDb();
  const events = await eventsCollection(db)
    .find({})
    .sort({ updatedAt: -1 })
    .limit(limit)
    .toArray();

  const [pending, live, completed, attendanceCount, feedbackCount, userCount] = await Promise.all([
    eventsCollection(db).countDocuments({ status: "pending" }),
    eventsCollection(db).countDocuments({ status: "live" }),
    eventsCollection(db).countDocuments({ status: "completed" }),
    attendanceCollection(db).countDocuments({}),
    feedbackCollection(db).countDocuments({}),
    db.collection("users").countDocuments({ role: { $nin: ["admin", "super-admin"] } }),
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
  const db = await getUserDb();
  const normalized = email.trim().toLowerCase();
  const user = await db.collection("users").findOne({ email: normalized });
  const events = await eventsCollection(db)
    .find({ status: { $in: ["approved", "live"] } })
    .sort({ startsAt: 1 })
    .limit(16)
    .toArray();

  const [registrationCount, attendanceCount, certificateCount] = await Promise.all([
    registrationsCollection(db).countDocuments({ email: normalized }),
    attendanceCollection(db).countDocuments({ email: normalized }),
    certificatesCollection(db).countDocuments({ email: normalized }),
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
