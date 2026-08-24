import type { Db } from "mongodb";
import { connectMongo } from "@/lib/user-server/mongo-connect";

let connectPromise: Promise<{ userDb: Db; adminDb: Db }> | null = null;

async function resolveDbs(): Promise<{ userDb: Db; adminDb: Db }> {
  if (!connectPromise) {
    connectPromise = connectMongo()
      .then(({ userDb, adminDb }) => ({ userDb, adminDb }))
      .catch((error) => {
        connectPromise = null;
        throw error;
      });
  }

  return connectPromise;
}

/** Drop a failed/stale connect promise so the next call opens a fresh client. */
export function resetMongoConnection() {
  connectPromise = null;
}

/** Student / organizer portal database. */
export async function getUserDb(): Promise<Db> {
  const { userDb } = await resolveDbs();
  return userDb;
}

/** Admin / events lifecycle database. */
export async function getAdminDb(): Promise<Db> {
  const { adminDb } = await resolveDbs();
  return adminDb;
}

/** Warm the pool in the background so the first login is less likely to time out. */
export function warmMongoConnection() {
  void resolveDbs().catch(() => {
    /* first request will retry */
  });
}

warmMongoConnection();
