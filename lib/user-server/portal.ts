import type { Db } from "mongodb";
import { getUserDb } from "@/lib/user-server/get-user-db";

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

export async function notifyUser(input: Omit<NotificationDoc, "read" | "createdAt"> & {
  read?: boolean;
  createdAt?: string;
}) {
  try {
    const db = await getUserDb();
    await notificationsCollection(db).insertOne({
      ...input,
      read: input.read ?? false,
      archived: input.archived ?? false,
      createdAt: input.createdAt || new Date().toISOString(),
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    console.warn("[DC Space] Failed to create notification:", details);
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
