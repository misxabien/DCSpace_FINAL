import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireAdminAuth } from "@/lib/admin-server/require-admin-auth";
import {
  eventsCollection,
  sanitizeEvent,
  type SpaceEvent,
} from "@/lib/events/types";
import { getAdminDb, getUserDb } from "@/lib/db/get-db";
import {
  usersCollection,
  attendanceCollection,
  feedbackCollection,
  certificatesCollection,
} from "@/lib/db/user-collections";
import { activitiesCollection } from "@/lib/db/admin-collections";
import type { ActivityDoc } from "@/lib/user-server/activity";
import { sanitizeUser } from "@/lib/user-server/sanitize-user";
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
    events: { pending: [], approved: [] },
    users: [],
    activities: [],
    attendance: [],
    feedback: [],
    window: { weekAgo: "", monthAgo: "" },
  };
}

function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
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
    const userDb = await withTimeout(getUserDb(), DASHBOARD_TIMEOUT_MS, "MongoDB connect");
    const adminDb = await getAdminDb();

    const usersCol = usersCollection(userDb);
    const eventsCol = eventsCollection(adminDb);
    const activitiesCol = activitiesCollection(adminDb);
    const attendanceCol = attendanceCollection(userDb);
    const feedbackCol = feedbackCollection(userDb);
    const certificatesCol = certificatesCollection(userDb);

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
        .limit(50)
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
        .limit(50)
        .toArray(),
      eventsCol
        .find({ status: { $in: ["approved", "live", "completed"] } })
        .sort({ startsAt: 1, updatedAt: -1 })
        .limit(50)
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
      window: { weekAgo, monthAgo },
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    console.error("[DC Space] Admin dashboard unavailable:", details);
    // Prefer zeros over fake prototype numbers when DB is down.
    return NextResponse.json(emptyDashboard(details));
  }
}
