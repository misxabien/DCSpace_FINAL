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
