import type { CollationOptions, Db, IndexDirection } from "mongodb";

/**
 * Case-insensitive match that can use an index (emails, "Juan@…" == "juan@…").
 * Queries that pass this collation use the "_ci" indexes below; a
 * case-insensitive $regex would instead test every entry in the collection.
 */
export const CASE_INSENSITIVE: CollationOptions = { locale: "en", strength: 2 };

type IndexSpec = { key: Record<string, IndexDirection>; ci?: boolean };

/** Lookups the app makes on every page; without these each one scans the whole collection. */
const USER_DB_INDEXES: Record<string, IndexSpec[]> = {
  users: [{ key: { email: 1 } }, { key: { email: 1 }, ci: true }, { key: { role: 1, createdAt: -1 } }, { key: { rfidNumber: 1 } }, { key: { studentNumber: 1 } }],
  notifications: [{ key: { email: 1, createdAt: -1 }, ci: true }],
  event_registrations: [{ key: { eventId: 1, email: 1 } }, { key: { email: 1, createdAt: -1 }, ci: true }, { key: { createdAt: -1 } }],
  event_invitations: [{ key: { eventId: 1, email: 1 } }, { key: { email: 1, createdAt: -1 }, ci: true }],
  attendance_records: [
    { key: { eventId: 1, email: 1, scannedAt: -1 } },
    { key: { email: 1, scannedAt: -1, createdAt: -1 }, ci: true },
    { key: { eventId: 1, scannedAt: -1 } },
    { key: { eventId: 1, createdAt: 1 } },
    { key: { email: 1, createdAt: 1 } },
    { key: { scannedAt: -1, createdAt: -1 } },
    { key: { createdAt: -1 } },
  ],
  feedback_entries: [{ key: { eventId: 1, phase: 1 } }, { key: { email: 1, createdAt: -1 } }, { key: { createdAt: -1 } }],
  certificates: [{ key: { email: 1, createdAt: -1 } }, { key: { eventId: 1, email: 1 } }, { key: { createdAt: -1 } }],
  saved_events: [{ key: { email: 1 }, ci: true }, { key: { eventIds: 1 } }],
  event_gallery: [{ key: { eventId: 1, createdAt: -1 } }],
  user_activities: [{ key: { createdAt: -1 } }, { key: { actorEmail: 1, createdAt: -1 }, ci: true }],
  admin_reports: [{ key: { generatedAt: -1 } }, { key: { source: 1, eventId: 1 } }],
  event_reports: [{ key: { eventId: 1 } }],
  reservationStatuses: [{ key: { eventId: 1 } }],
  attendance_security_events: [{ key: { eventId: 1, createdAt: -1 } }],
  events: [{ key: { status: 1, startsAt: 1 } }, { key: { updatedAt: -1 } }, { key: { createdAt: -1 } }, { key: { organizerEmail: 1 } }],
};

const ADMIN_DB_INDEXES: Record<string, IndexSpec[]> = {
  events: [{ key: { status: 1, startsAt: 1 } }, { key: { updatedAt: -1 } }, { key: { createdAt: -1 } }, { key: { organizerEmail: 1 } }],
  user_activities: [{ key: { createdAt: -1 } }, { key: { actorEmail: 1, createdAt: -1 }, ci: true }],
  event_reports: [{ key: { eventId: 1 } }],
  reservationStatuses: [{ key: { eventId: 1 } }],
};

async function ensureFor(db: Db, specs: Record<string, IndexSpec[]>) {
  // Only collections that exist — never create empty collections.
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  for (const [name, list] of Object.entries(specs)) {
    if (!existing.has(name)) continue;
    const col = db.collection(name);
    // One listIndexes per collection; only missing indexes are created, so a
    // fresh server instance adds almost no work once everything exists.
    const have = new Set((await col.indexes().catch(() => [])).map((ix) => String(ix.name)));
    for (const spec of list) {
      const keyName = Object.entries(spec.key).map(([k, v]) => `${k}_${v}`).join("_");
      if (have.has(spec.ci ? `${keyName}_ci` : keyName)) continue;
      try {
        await col.createIndex(spec.key, {
          name: spec.ci ? `${keyName}_ci` : keyName,
          ...(spec.ci ? { collation: CASE_INSENSITIVE } : {}),
        });
      } catch (error) {
        // An equivalent index under another name already exists, etc. — fine.
        const details = error instanceof Error ? error.message : String(error);
        if (!/already exists|IndexOptionsConflict|IndexKeySpecsConflict/i.test(details)) {
          console.warn(`[DC Space] Could not create index on ${name}:`, details);
        }
      }
    }
  }
}

let started: Promise<void> | null = null;

/** Create the indexes once per server start (idempotent; runs in the background). */
export function ensureIndexes(userDb: Db, adminDb: Db) {
  if (!started) {
    started = (async () => {
      await ensureFor(userDb, USER_DB_INDEXES);
      if (adminDb.databaseName !== userDb.databaseName) await ensureFor(adminDb, ADMIN_DB_INDEXES);
    })().catch((error) => {
      console.warn("[DC Space] Index setup failed:", error instanceof Error ? error.message : error);
    });
  }
  return started;
}
