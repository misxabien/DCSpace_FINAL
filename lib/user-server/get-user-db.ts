import type { Db } from "mongodb";
import { connectUserMongo } from "@/lib/user-server/mongo-connect";

let connectPromise: Promise<Db> | null = null;

export async function getUserDb(): Promise<Db> {
  if (!connectPromise) {
    connectPromise = connectUserMongo()
      .then(({ db }) => db)
      .catch((error) => {
        connectPromise = null;
        throw error;
      });
  }

  return connectPromise;
}

/** Warm the Mongo pool so the first page load is less likely to stall. */
export function warmUserMongoConnection() {
  void getUserDb().catch(() => {
    /* first real request will retry */
  });
}

warmUserMongoConnection();
