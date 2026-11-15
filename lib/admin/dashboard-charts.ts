import type { Db } from "mongodb";
import { eventsCollection } from "@/lib/events/types";
import { attendanceCollection } from "@/lib/user-server/activity";
import { registrationsCollection } from "@/lib/user-server/portal";

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const TYPE_BUCKETS = [
  { key: "organization", label: "Organization events", color: "#f4be5e" },
  { key: "outreach", label: "Outreach Program", color: "#8ab6ff" },
  { key: "seminars", label: "Seminars", color: "#448aff" },
  { key: "festivals", label: "Festivals", color: "#156884" },
] as const;

export type DashboardCharts = {
  monthly: {
    labels: string[];
    counts: number[];
    peakIndex: number;
    peakLabel: string;
  };
  topAttendance: Array<{
    eventId: string;
    title: string;
    present: number;
    capacity: number | null;
    percent: number;
    detail: string;
  }>;
  eventTypes: Array<{
    key: string;
    label: string;
    color: string;
    count: number;
    percent: number;
  }>;
  range: "monthly";
};

function bucketCategory(raw?: string | null): (typeof TYPE_BUCKETS)[number]["key"] {
  const value = String(raw || "")
    .trim()
    .toLowerCase();
  if (!value) return "organization";
  if (/outreach/.test(value)) return "outreach";
  if (/festival|cultural|pageant|sports|fair|expo|party|social/.test(value)) {
    return "festivals";
  }
  if (
    /seminar|workshop|conference|academic|tech|career|character|orientation|program|booth/.test(
      value,
    )
  ) {
    return "seminars";
  }
  if (/organization|org |celebration|student activity/.test(value)) {
    return "organization";
  }
  return "organization";
}

function parseEventDate(startsAt?: string | null): Date | null {
  if (!startsAt) return null;
  const raw = String(startsAt).trim();
  if (!raw) return null;
  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct;
  // Organizer local values like "2026-08-23T06:15"
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) {
    const padded = new Date(`${raw}:00`);
    if (!Number.isNaN(padded.getTime())) return padded;
  }
  return null;
}

function emptyCharts(): DashboardCharts {
  return {
    monthly: {
      labels: [...MONTH_LABELS],
      counts: Array.from({ length: 12 }, () => 0),
      peakIndex: 0,
      peakLabel: "Jan",
    },
    topAttendance: [],
    eventTypes: TYPE_BUCKETS.map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      color: bucket.color,
      count: 0,
      percent: 0,
    })),
    range: "monthly",
  };
}

/** Build Quick Charts payload from events + attendance collections. */
export async function buildDashboardCharts(userDb: Db): Promise<DashboardCharts> {
  const charts = emptyCharts();
  const year = new Date().getFullYear();
  const adminName = process.env.MONGODB_ADMIN_DB_NAME?.trim();
  const adminDb =
    adminName && adminName !== userDb.databaseName
      ? userDb.client.db(adminName)
      : userDb;

  const [adminEvents, userEvents, attendanceDocs, registrationDocs] = await Promise.all([
    eventsCollection(adminDb)
      .find({})
      .project({ title: 1, category: 1, startsAt: 1, status: 1 })
      .limit(2000)
      .toArray(),
    adminDb === userDb
      ? Promise.resolve([])
      : eventsCollection(userDb)
          .find({})
          .project({ title: 1, category: 1, startsAt: 1, status: 1 })
          .limit(2000)
          .toArray(),
    attendanceCollection(userDb)
      .find({ action: { $in: ["in", "out"] } })
      .project({ eventId: 1, eventTitle: 1, email: 1, action: 1 })
      .limit(5000)
      .toArray(),
    registrationsCollection(userDb)
      .find({})
      .project({ eventId: 1 })
      .limit(5000)
      .toArray(),
  ]);

  const eventsById = new Map<string, { title: string; category: string; startsAt: string }>();
  for (const doc of [...userEvents, ...adminEvents]) {
    const id = String(doc._id);
    eventsById.set(id, {
      title: String(doc.title || "Event"),
      category: String(doc.category || ""),
      startsAt: String(doc.startsAt || ""),
    });
  }

  const monthlyCounts = Array.from({ length: 12 }, () => 0);
  const typeCounts: Record<string, number> = {
    organization: 0,
    outreach: 0,
    seminars: 0,
    festivals: 0,
  };

  for (const event of eventsById.values()) {
    const date = parseEventDate(event.startsAt);
    if (date && date.getFullYear() === year) {
      monthlyCounts[date.getMonth()] += 1;
    } else if (date && date.getFullYear() === year - 1) {
      // Include prior-year months lightly so charts aren't empty early in a year.
      monthlyCounts[date.getMonth()] += 1;
    }
    typeCounts[bucketCategory(event.category)] += 1;
  }

  const peakIndex = monthlyCounts.reduce(
    (best, count, index) => (count > monthlyCounts[best] ? index : best),
    0,
  );
  const peakCount = monthlyCounts[peakIndex] || 0;

  charts.monthly = {
    labels: [...MONTH_LABELS],
    counts: monthlyCounts,
    peakIndex: peakCount > 0 ? peakIndex : Math.max(0, new Date().getMonth()),
    peakLabel: MONTH_LABELS[peakCount > 0 ? peakIndex : Math.max(0, new Date().getMonth())],
  };

  const typeTotal = Object.values(typeCounts).reduce((sum, n) => sum + n, 0) || 1;
  charts.eventTypes = TYPE_BUCKETS.map((bucket) => {
    const count = typeCounts[bucket.key] || 0;
    return {
      key: bucket.key,
      label: bucket.label,
      color: bucket.color,
      count,
      percent: Math.round((count / typeTotal) * 100),
    };
  });

  const capacityByEvent = new Map<string, number>();
  for (const row of registrationDocs) {
    const eventId = String(row.eventId || "");
    if (!eventId) continue;
    capacityByEvent.set(eventId, (capacityByEvent.get(eventId) || 0) + 1);
  }

  const presentByEvent = new Map<
    string,
    { title: string; emails: Set<string> }
  >();
  for (const row of attendanceDocs) {
    const eventId = String(row.eventId || "");
    if (!eventId) continue;
    const email = String(row.email || "")
      .trim()
      .toLowerCase();
    if (!email) continue;
    const existing = presentByEvent.get(eventId) || {
      title:
        String(row.eventTitle || "") ||
        eventsById.get(eventId)?.title ||
        "Event",
      emails: new Set<string>(),
    };
    if (!existing.title || existing.title === "Event") {
      existing.title = eventsById.get(eventId)?.title || existing.title || "Event";
    }
    existing.emails.add(email);
    presentByEvent.set(eventId, existing);
  }

  const ranked = [...presentByEvent.entries()]
    .map(([eventId, value]) => {
      const present = value.emails.size;
      const capacity = capacityByEvent.get(eventId) || null;
      const denom = capacity && capacity > 0 ? capacity : Math.max(present, 1);
      const percent = Math.max(4, Math.min(100, Math.round((present / denom) * 100)));
      const detail =
        capacity && capacity > 0
          ? `${present} out of ${capacity} people`
          : `${present} people`;
      return {
        eventId,
        title: value.title,
        present,
        capacity,
        percent,
        detail,
      };
    })
    .sort((a, b) => b.present - a.present || b.percent - a.percent)
    .slice(0, 3);

  charts.topAttendance = ranked;
  return charts;
}
