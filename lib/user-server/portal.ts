import type { Db } from "mongodb";
import { getUserDb } from "@/lib/user-server/get-user-db";
import { usersCollection } from "@/lib/db/user-collections";
import { escapeRegex } from "@/lib/events/ownership";

export type NotificationDoc = {
  email: string;
  userId?: string;
  title: string;
  body: string;
  type: string;
  eventId?: string;
  eventTitle?: string;
  read: boolean;
  archived?: boolean;
  createdAt: string;
};

export function registrationsCollection(db: Db) {
  return db.collection("event_registrations");
}

export function invitationsCollection(db: Db) {
  return db.collection("event_invitations");
}

export function notificationsCollection(db: Db) {
  return db.collection<NotificationDoc>("notifications");
}

function normalizeEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

const ensureStudentNotificationsCache = new Map<string, number>();

export async function notifyUser(
  input: Omit<NotificationDoc, "read" | "createdAt"> & {
    read?: boolean;
    createdAt?: string;
  },
) {
  try {
    const email = normalizeEmail(input.email);
    if (!email) return;

    const db = await getUserDb();
    const col = notificationsCollection(db);

    // Avoid duplicate invitation / status spam for the same event + type.
    if (input.eventId && input.type) {
      const existing = await col.findOne({
        email,
        eventId: String(input.eventId),
        type: String(input.type),
        archived: { $ne: true },
      });
      if (existing) return;
    }

    await col.insertOne({
      ...input,
      email,
      read: input.read ?? false,
      archived: input.archived ?? false,
      createdAt: input.createdAt || new Date().toISOString(),
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    console.warn("[DC Space] Failed to create notification:", details);
  }
}

/** Notify many emails (deduped, lowercased). */
export async function notifyUsers(
  emails: string[],
  input: Omit<NotificationDoc, "email" | "userId" | "read" | "createdAt"> & {
    userId?: string;
  },
) {
  const unique = [
    ...new Set(emails.map(normalizeEmail).filter(Boolean)),
  ];
  await Promise.all(unique.map((email) => notifyUser({ ...input, email })));
}

/** Notify students/faculty in an organization about a published event. */
export async function notifyOrganizationMembers(
  organization: string,
  input: Omit<NotificationDoc, "email" | "userId" | "read" | "createdAt">,
) {
  const org = String(organization || "").trim();
  if (!org) return;
  try {
    const db = await getUserDb();
    const members = await usersCollection(db)
      .find({
        organizationPart: { $regex: `^${escapeRegex(org)}$`, $options: "i" },
        role: { $nin: ["admin", "super-admin"] },
      })
      .project({ email: 1 })
      .limit(500)
      .toArray();
    await notifyUsers(
      members.map((user) => String(user.email || "")),
      input,
    );
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    console.warn("[DC Space] Failed to notify organization:", details);
  }
}

/**
 * Ensure invitation / certificate rows also appear as notifications
 * (covers older data created before notifyUser was wired everywhere).
 * Also surfaces already-approved org events so the inbox isn't empty.
 */
export async function ensureStudentNotifications(email: string) {
  const normalized = normalizeEmail(email);
  if (!normalized) return;

  // Avoid hammering Mongo on the badge poll (every few seconds).
  const cacheKey = `dc_notif_backfill:${normalized}`;
  const now = Date.now();
  const cachedAt = ensureStudentNotificationsCache.get(cacheKey) || 0;
  if (now - cachedAt < 120_000) return;
  ensureStudentNotificationsCache.set(cacheKey, now);

  const db = await getUserDb();
  const emailFilter = {
    $regex: `^${escapeRegex(normalized)}$`,
    $options: "i",
  };
  const col = notificationsCollection(db);

  const [invites, user, existing] = await Promise.all([
    invitationsCollection(db)
      .find({ email: emailFilter })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray(),
    usersCollection(db).findOne(
      { email: emailFilter },
      { projection: { organizationPart: 1, email: 1 } },
    ),
    col
      .find({ email: emailFilter })
      .project({ eventId: 1, type: 1 })
      .limit(300)
      .toArray(),
  ]);

  const seen = new Set(
    existing.map((doc) => `${String(doc.type || "")}:${String(doc.eventId || "")}`),
  );

  for (const invite of invites) {
    const eventId = String(invite.eventId || "");
    const key = `invitation:${eventId}`;
    if (!eventId || seen.has(key)) continue;
    seen.add(key);
    const title = String(invite.eventTitle || "an event");
    await col.insertOne({
      email: normalized,
      userId: String(invite.userId || ""),
      title: "You're invited to an event",
      body: `You were invited to ${title}.`,
      type: "invitation",
      eventId,
      eventTitle: title,
      read: false,
      archived: false,
      createdAt: String(invite.createdAt || new Date().toISOString()),
    });
  }

  const org = String(user?.organizationPart || "").trim();
  if (!org) return;

  try {
    const { getAdminDb } = await import("@/lib/db/get-db");
    const { eventsCollection } = await import("@/lib/events/types");
    const adminDb = await getAdminDb();

    const orgMembers = await usersCollection(db)
      .find({
        organizationPart: { $regex: `^${escapeRegex(org)}$`, $options: "i" },
      })
      .project({ email: 1 })
      .limit(200)
      .toArray();
    const orgEmails = orgMembers
      .map((row) => normalizeEmail(String(row.email || "")))
      .filter(Boolean);

    const orgEvents = await eventsCollection(adminDb)
      .find({
        status: { $in: ["approved", "live"] },
        $or: [
          { department: { $regex: `^${escapeRegex(org)}$`, $options: "i" } },
          ...(orgEmails.length
            ? [{ organizerEmail: { $in: orgEmails } }]
            : []),
        ],
      })
      .project({ title: 1, status: 1, updatedAt: 1, createdAt: 1 })
      .sort({ updatedAt: -1 })
      .limit(40)
      .toArray();

    for (const event of orgEvents) {
      const eventId = String(event._id);
      const type = event.status === "live" ? "event-live" : "event-new";
      const key = `${type}:${eventId}`;
      if (
        seen.has(key) ||
        seen.has(`event-new:${eventId}`) ||
        seen.has(`event-live:${eventId}`)
      ) {
        continue;
      }
      seen.add(key);
      const title = String(event.title || "Event");
      await col.insertOne({
        email: normalized,
        title: event.status === "live" ? "Event is live" : "New Event Available",
        body:
          event.status === "live"
            ? `${title} is now live.`
            : `A new event, ${title}, has been posted.`,
        type,
        eventId,
        eventTitle: title,
        read: false,
        archived: false,
        createdAt: String(event.updatedAt || event.createdAt || new Date().toISOString()),
      });
    }
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    console.warn("[DC Space] Failed to backfill org event notifications:", details);
  }
}

/** Notify every admin / super-admin account (event submissions, etc.). */
export async function notifyAdmins(
  input: Omit<NotificationDoc, "email" | "userId" | "read" | "createdAt"> & {
    userId?: string;
  },
) {
  try {
    const db = await getUserDb();
    const admins = await db
      .collection("users")
      .find({ role: { $in: ["admin", "super-admin"] } })
      .project({ email: 1 })
      .toArray();
    await Promise.all(
      admins.map((admin) =>
        notifyUser({
          ...input,
          email: String(admin.email || ""),
          userId: String(admin._id || ""),
        }),
      ),
    );
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    console.warn("[DC Space] Failed to notify admins:", details);
  }
}
