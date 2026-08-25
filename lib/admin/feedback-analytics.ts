import type { Db } from "mongodb";
import { eventsCollection } from "@/lib/events/types";
import { feedbackCollection } from "@/lib/user-server/activity";
import { getUserDb } from "@/lib/user-server/get-user-db";
import { registrationsCollection } from "@/lib/user-server/portal";

export type FeedbackCategoryRating = {
  label: string;
  subtitle: string;
  avgRating: number;
  count: number;
};

export type FeedbackEventStatus = {
  eventId: string;
  title: string;
  status: string;
  responses: number;
  target: number;
  avgRating: number;
  progress: number;
  collectionStatus: "collecting" | "analysis_done" | "pending";
};

export type FeedbackAnalytics = {
  totalResponses: number;
  avgRating: number;
  responseRate: number;
  categories: FeedbackCategoryRating[];
  events: FeedbackEventStatus[];
  recent: Array<{
    id: string;
    type: string;
    eventId: string;
    eventName: string;
    submittedBy: string;
    dateLabel: string;
    rating: number;
    comment: string;
  }>;
};

type FeedbackDoc = {
  _id?: unknown;
  type?: unknown;
  rating?: unknown;
  comment?: unknown;
  eventId?: unknown;
  eventTitle?: unknown;
  eventName?: unknown;
  email?: unknown;
  userName?: unknown;
  createdAt?: unknown;
};

function formatDateLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso || "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function averageRating(rows: Array<{ rating?: unknown }>) {
  const ratings = rows
    .map((row) => Number(row.rating || 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (!ratings.length) return 0;
  return Number((ratings.reduce((sum, value) => sum + value, 0) / ratings.length).toFixed(1));
}

function collectionStatusForEvent(status: string, progress: number): FeedbackEventStatus["collectionStatus"] {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "completed") return "analysis_done";
  if (normalized === "live" || normalized === "approved") {
    return progress >= 100 ? "analysis_done" : "collecting";
  }
  return "pending";
}

export type FeedbackAnalyticsFilters = {
  period?: "today" | "week" | "month" | "year" | "all";
  date?: string;
  organization?: string;
  course?: string;
  eventId?: string;
};

function periodStart(period: FeedbackAnalyticsFilters["period"]) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  switch (period) {
    case "today":
      return start.toISOString();
    case "week":
      start.setDate(start.getDate() - 7);
      return start.toISOString();
    case "month":
      start.setDate(start.getDate() - 30);
      return start.toISOString();
    case "year":
      start.setDate(start.getDate() - 365);
      return start.toISOString();
    default:
      return "";
  }
}

function sameDay(iso: string, dayIso: string) {
  const date = new Date(iso);
  const day = new Date(dayIso);
  if (Number.isNaN(date.getTime()) || Number.isNaN(day.getTime())) return false;
  return (
    date.getFullYear() === day.getFullYear() &&
    date.getMonth() === day.getMonth() &&
    date.getDate() === day.getDate()
  );
}

function matchesPeriod(createdAt: string, filters: FeedbackAnalyticsFilters) {
  if (filters.date) {
    const day = new Date(filters.date);
    if (!Number.isNaN(day.getTime())) {
      return sameDay(createdAt, day.toISOString());
    }
  }
  const start = periodStart(filters.period || "all");
  if (!start) return true;
  const stamp = new Date(createdAt).getTime();
  return Number.isFinite(stamp) && stamp >= new Date(start).getTime();
}

/** Aggregate real user feedback from MongoDB for admin analysis panels. */
export async function loadFeedbackAnalytics(
  filters: FeedbackAnalyticsFilters = {},
  db?: Db,
): Promise<FeedbackAnalytics> {
  const database = db || (await getUserDb());
  const [feedbackDocsRaw, registrationDocsRaw, eventDocs, users] = await Promise.all([
    feedbackCollection(database).find({}).sort({ createdAt: -1 }).limit(1000).toArray() as Promise<
      FeedbackDoc[]
    >,
    registrationsCollection(database)
      .find({ status: { $in: ["joined", "approved"] } })
      .limit(5000)
      .toArray(),
    eventsCollection(database)
      .find({ status: { $in: ["approved", "live", "completed"] } })
      .sort({ updatedAt: -1 })
      .limit(200)
      .toArray(),
    database
      .collection("users")
      .find({ role: { $nin: ["admin", "super-admin"] } })
      .project({ email: 1, course: 1, organizationPart: 1 })
      .toArray(),
  ]);

  const userByEmail = new Map(
    users.map((user) => [
      String(user.email || "").trim().toLowerCase(),
      {
        course: String(user.course || "").trim(),
        organization: String(user.organizationPart || "").trim(),
      },
    ]),
  );

  let feedbackDocs = feedbackDocsRaw.filter((row) =>
    matchesPeriod(String(row.createdAt || ""), filters),
  );

  if (filters.organization) {
    const org = filters.organization.toLowerCase();
    feedbackDocs = feedbackDocs.filter((row) => {
      const email = String(row.email || "").trim().toLowerCase();
      const profile = userByEmail.get(email);
      return profile?.organization?.toLowerCase().includes(org);
    });
  }

  if (filters.course) {
    const course = filters.course.toLowerCase();
    feedbackDocs = feedbackDocs.filter((row) => {
      const email = String(row.email || "").trim().toLowerCase();
      const profile = userByEmail.get(email);
      return profile?.course?.toLowerCase().includes(course);
    });
  }

  if (filters.eventId) {
    feedbackDocs = feedbackDocs.filter(
      (row) => String(row.eventId || "").trim() === filters.eventId,
    );
  }

  const registrationDocs = filters.eventId
    ? registrationDocsRaw.filter((row) => String(row.eventId || "").trim() === filters.eventId)
    : registrationDocsRaw;

  const totalResponses = feedbackDocs.length;
  const avgRating = averageRating(feedbackDocs);

  const feedbackByEvent = new Map<string, typeof feedbackDocs>();
  for (const row of feedbackDocs) {
    const eventId = String(row.eventId || "").trim();
    if (!eventId) continue;
    const bucket = feedbackByEvent.get(eventId) || [];
    bucket.push(row);
    feedbackByEvent.set(eventId, bucket);
  }

  const registrationsByEvent = new Map<string, typeof registrationDocs>();
  for (const row of registrationDocs) {
    const eventId = String(row.eventId || "").trim();
    if (!eventId) continue;
    const bucket = registrationsByEvent.get(eventId) || [];
    bucket.push(row);
    registrationsByEvent.set(eventId, bucket);
  }

  const feedbackEmails = new Set(
    feedbackDocs.map((row) => String(row.email || "").trim().toLowerCase()).filter(Boolean),
  );
  const registeredEmails = new Set(
    registrationDocs.map((row) => String(row.email || "").trim().toLowerCase()).filter(Boolean),
  );
  const responseRate =
    registeredEmails.size > 0
      ? Math.min(100, Math.round((feedbackEmails.size / registeredEmails.size) * 100))
      : totalResponses > 0
        ? 100
        : 0;

  const byType = new Map<string, typeof feedbackDocs>();
  for (const row of feedbackDocs) {
    const type = String(row.type || "General Feedback").trim() || "General Feedback";
    const bucket = byType.get(type) || [];
    bucket.push(row);
    byType.set(type, bucket);
  }

  const categories: FeedbackCategoryRating[] = [...byType.entries()]
    .map(([type, rows]) => ({
      label: type.toUpperCase(),
      subtitle: `${rows.length} response${rows.length === 1 ? "" : "s"}`,
      avgRating: averageRating(rows),
      count: rows.length,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const eventTitleById = new Map(
    eventDocs.map((event) => [String(event._id), String(event.title || "Event")]),
  );
  const eventStatusById = new Map(
    eventDocs.map((event) => [String(event._id), String(event.status || "")]),
  );

  const eventIds = new Set<string>([
    ...feedbackByEvent.keys(),
    ...(filters.eventId ? [filters.eventId] : eventDocs.map((event) => String(event._id))),
  ]);

  const events: FeedbackEventStatus[] = [...eventIds]
    .map((eventId) => {
      const rows = feedbackByEvent.get(eventId) || [];
      const registrations = registrationsByEvent.get(eventId) || [];
      const target = Math.max(registrations.length, rows.length, 1);
      const responses = rows.length;
      const progress = Math.min(100, Math.round((responses / target) * 100));
      const status = eventStatusById.get(eventId) || (responses > 0 ? "completed" : "approved");
      return {
        eventId,
        title:
          eventTitleById.get(eventId) ||
          String(rows[0]?.eventTitle || rows[0]?.eventName || "Event"),
        status,
        responses,
        target: registrations.length || target,
        avgRating: averageRating(rows),
        progress,
        collectionStatus: collectionStatusForEvent(status, progress),
      };
    })
    .filter((event) => event.responses > 0 || ["live", "approved", "completed"].includes(event.status))
    .sort((a, b) => {
      if (b.responses !== a.responses) return b.responses - a.responses;
      return b.progress - a.progress;
    })
    .slice(0, 12);

  return {
    totalResponses,
    avgRating,
    responseRate,
    categories,
    events,
    recent: feedbackDocs.slice(0, 20).map((row) => ({
      id: String(row._id || ""),
      type: String(row.type || "General Feedback"),
      eventId: String(row.eventId || ""),
      eventName: String(row.eventTitle || row.eventName || "—"),
      submittedBy: String(row.userName || row.email || "User"),
      dateLabel: formatDateLabel(String(row.createdAt || "")),
      rating: Number(row.rating || 0),
      comment: String(row.comment || ""),
    })),
  };
}
