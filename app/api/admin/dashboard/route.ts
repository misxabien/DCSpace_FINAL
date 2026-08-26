import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireAdminAuth } from "@/lib/admin-server/require-admin-auth";
import {
  eventsCollection,
  sanitizeEvent,
  type SpaceEvent,
} from "@/lib/events/types";
import {
  activitiesCollection,
  attendanceCollection,
  certificatesCollection,
  feedbackCollection,
  type ActivityDoc,
} from "@/lib/user-server/activity";
import { getUserDb } from "@/lib/user-server/get-user-db";
import { sanitizeUser } from "@/lib/user-server/sanitize-user";
import { buildDashboardCharts } from "@/lib/admin/dashboard-charts";
import {
  MONGO_QUICK_TIMEOUT_MS,
  withTimeout,
} from "@/lib/user-server/with-timeout";

const DASHBOARD_TIMEOUT_MS = Math.max(MONGO_QUICK_TIMEOUT_MS, 8_000);

function emptyDashboard(details?: string) {
  return {
    generatedAt: new Date().toISOString(),
    offline: true,
    details: details || "Database unavailable",
    stats: {
      totalEvents: 0,
      ongoingEvents: 0,
      totalUsers: 0,
      certificatesGenerated: 0,
      attendanceRate: 0,
      feedbackReceived: 0,
      pendingEvents: 0,
      approvedEvents: 0,
      completedEvents: 0,
      facultyUsers: 0,
      newUsers: 0,
      activeUsers: 0,
    },
    attention: [],
    todayEvents: [],
    events: { pending: [], approved: [] },
    users: [],
    activities: [],
    attendance: [],
    feedback: [],
    charts: {
      monthly: {
        labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
        counts: Array.from({ length: 12 }, () => 0),
        peakIndex: 0,
        peakLabel: "Jan",
      },
      topAttendance: [],
      eventTypes: [],
      range: "monthly" as const,
    },
    window: { weekAgo: "", monthAgo: "" },
  };
}

function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function isEventToday(startsAt?: string, endsAt?: string) {
  if (!startsAt) return false;
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return false;
  const end = endsAt ? new Date(endsAt) : start;
  if (Number.isNaN(end.getTime())) return false;
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date();
  dayEnd.setHours(23, 59, 59, 999);
  return start <= dayEnd && end >= dayStart;
}

function formatTimeRemaining(endsAt?: string, startsAt?: string) {
  const now = Date.now();
  let endMs = endsAt ? new Date(endsAt).getTime() : Number.NaN;
  if (!Number.isFinite(endMs) && startsAt) {
    endMs = new Date(startsAt).getTime() + 2 * 60 * 60 * 1000;
  }
  if (!Number.isFinite(endMs)) return "Schedule TBA";
  const diff = endMs - now;
  if (diff <= 0) return "Ended";
  const hrs = Math.floor(diff / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  if (hrs <= 0) return `${mins} MIN${mins === 1 ? "" : "S"}`;
  return `${hrs} HR${hrs === 1 ? "" : "S"} ${mins} MIN${mins === 1 ? "" : "S"}`;
}

function formatDate(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Live admin dashboard aggregates from registered users + their actions. */
export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const db = await withTimeout(
      getUserDb(),
      DASHBOARD_TIMEOUT_MS,
      "MongoDB connect",
    );

    const usersCol = db.collection("users");
    const eventsCol = eventsCollection(db);
    const activitiesCol = activitiesCollection(db);
    const attendanceCol = attendanceCollection(db);
    const feedbackCol = feedbackCollection(db);
    const certificatesCol = certificatesCollection(db);

    const weekAgo = daysAgoIso(7);
    const monthAgo = daysAgoIso(30);

    const [
      totalUsers,
      facultyUsers,
      newUsers,
      recentLogins,
      allUsers,
      totalEvents,
      pendingEvents,
      liveEvents,
      approvedEvents,
      completedEvents,
      attentionEvents,
      recentSubmitted,
      recentApproved,
      scheduledEvents,
      recentActivities,
      attendanceCount,
      feedbackCount,
      certificateCount,
      recentAttendance,
      recentFeedback,
    ] = await Promise.all([
      usersCol.countDocuments({
        role: { $nin: ["admin", "super-admin"] },
      }),
      usersCol.countDocuments({ role: "faculty" }),
      usersCol.countDocuments({
        role: { $nin: ["admin", "super-admin"] },
        createdAt: { $gte: weekAgo },
      }),
      usersCol.countDocuments({
        role: { $nin: ["admin", "super-admin"] },
        lastLoginAt: { $gte: weekAgo },
      }),
      usersCol
        .find({ role: { $nin: ["admin", "super-admin"] } })
        .sort({ createdAt: -1 })
        .limit(500)
        .toArray(),
      eventsCol.countDocuments({}),
      eventsCol.countDocuments({ status: "pending" }),
      eventsCol.countDocuments({ status: { $in: ["live"] } }),
      eventsCol.countDocuments({ status: "approved" }),
      eventsCol.countDocuments({ status: "completed" }),
      eventsCol
        .find({
          status: { $in: ["pending", "postponed", "rejected"] },
        })
        .sort({ updatedAt: -1 })
        .limit(6)
        .toArray(),
      eventsCol
        .find({ status: "pending" })
        .sort({ createdAt: -1 })
        .limit(500)
        .toArray(),
      eventsCol
        .find({ status: { $in: ["approved", "live", "completed"] } })
        .sort({ updatedAt: -1 })
        .limit(500)
        .toArray(),
      eventsCol
        .find({ status: { $in: ["approved", "live"] } })
        .sort({ startsAt: 1 })
        .limit(40)
        .toArray(),
      activitiesCol.find({}).sort({ createdAt: -1 }).limit(40).toArray(),
      attendanceCol.countDocuments({}),
      feedbackCol.countDocuments({}),
      certificatesCol.countDocuments({}),
      attendanceCol.find({}).sort({ createdAt: -1 }).limit(20).toArray(),
      feedbackCol.find({}).sort({ createdAt: -1 }).limit(20).toArray(),
    ]);

    const attendanceRate =
      totalUsers > 0 && attendanceCount > 0
        ? Math.min(100, Math.round((attendanceCount / Math.max(totalUsers, 1)) * 10))
        : attendanceCount > 0
          ? 100
          : 0;

    // Prefer explicit certificate docs; fall back to completed events.
    const certificatesGenerated =
      certificateCount > 0 ? certificateCount : completedEvents;

    const sanitizeUsers = allUsers.map((doc) =>
      sanitizeUser(
        doc as {
          _id: ObjectId;
          firstName: string;
          lastName: string;
          studentNumber: string;
          email: string;
          photoUrl?: string;
          bannerUrl?: string;
          role?: string;
          rfidNumber?: string;
          organizationPart?: string;
          organizationRole?: string;
          course?: string;
          school?: string;
        },
      ),
    );

    const mapEvent = (doc: SpaceEvent & { _id: ObjectId }) => {
      const e = sanitizeEvent(doc);
      return {
        ...e,
        dateLabel: formatDate(e.startsAt || e.createdAt),
        statusLabel: e.status,
      };
    };

    const attention = attentionEvents.map((doc) => {
      const e = mapEvent(doc as SpaceEvent & { _id: ObjectId });
      const reason =
        e.status === "pending"
          ? "Awaiting admin approval."
          : e.status === "postponed"
            ? "Event postponed — needs follow-up."
            : e.reviewNote || "Requires attention.";
      return { ...e, reason };
    });

    const todayEvents = scheduledEvents
      .filter((doc) =>
        isEventToday(
          String((doc as SpaceEvent).startsAt || ""),
          String((doc as SpaceEvent).endsAt || ""),
        ),
      )
      .slice(0, 6)
      .map((doc) => {
        const e = mapEvent(doc as SpaceEvent & { _id: ObjectId });
        return {
          ...e,
          timeRemaining: formatTimeRemaining(e.endsAt, e.startsAt),
        };
      });

    const activityRows = (recentActivities as ActivityDoc[]).map((a) => ({
      type: a.type,
      actorEmail: a.actorEmail || "",
      actorName: a.actorName || a.actorEmail || "User",
      actorRole: a.actorRole || "",
      targetTitle: a.targetTitle || "",
      organization: a.organization || "",
      dateLabel: formatDate(a.createdAt),
      createdAt: a.createdAt,
      meta: a.meta || {},
    }));

    const charts = await buildDashboardCharts(db);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      stats: {
        totalEvents,
        ongoingEvents: liveEvents,
        totalUsers,
        certificatesGenerated,
        attendanceRate,
        feedbackReceived: feedbackCount,
        pendingEvents,
        approvedEvents,
        completedEvents,
        facultyUsers,
        newUsers,
        activeUsers: recentLogins,
      },
      attention,
      todayEvents,
      events: {
        pending: recentSubmitted.map((d) =>
          mapEvent(d as SpaceEvent & { _id: ObjectId }),
        ),
        approved: recentApproved.map((d) =>
          mapEvent(d as SpaceEvent & { _id: ObjectId }),
        ),
      },
      users: sanitizeUsers,
      activities: activityRows,
      attendance: recentAttendance.map((row) => ({
        participantName:
          String(row.participantName || row.userName || row.email || "Participant"),
        eventName: String(row.eventTitle || row.eventName || "Event"),
        time: formatDate(String(row.createdAt || row.scannedAt || "")),
        action: String(row.action || row.status || "Checked in"),
        status: String(row.status || "recorded"),
      })),
      feedback: recentFeedback.map((row) => ({
        type: String(row.type || row.category || "General"),
        eventName: String(row.eventTitle || row.eventName || "—"),
        submittedBy: String(row.userName || row.email || "User"),
        dateLabel: formatDate(String(row.createdAt || "")),
        rating: row.rating ?? "",
        comment: String(row.comment || row.message || ""),
      })),
      charts,
      window: { weekAgo, monthAgo },
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    console.error("[DC Space] Admin dashboard unavailable:", details);
    // Prefer zeros over fake prototype numbers when DB is down.
    return NextResponse.json(emptyDashboard(details));
  }
}
