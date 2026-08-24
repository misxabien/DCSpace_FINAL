import { Resolver } from "dns/promises";
import { MongoClient, type Db, type MongoClientOptions } from "mongodb";

const CONNECT_TIMEOUT_MS = 20_000;

const baseClientOptions: MongoClientOptions = {
  maxPoolSize: 10,
  minPoolSize: 1,
  // Cold Atlas + school networks often need longer than 8s for first SRV/TLS handshake.
  serverSelectionTimeoutMS: CONNECT_TIMEOUT_MS,
  connectTimeoutMS: CONNECT_TIMEOUT_MS,
  socketTimeoutMS: 45_000,
};

export function getMongoConfig() {
  const uri = process.env.MONGODB_URI?.trim();
  const userDbName = process.env.MONGODB_DB_NAME?.trim();
  const adminDbName = process.env.MONGODB_ADMIN_DB_NAME?.trim() || "dcspace_admin";

  if (!uri || !userDbName) {
    throw new Error("Missing MONGODB_URI or MONGODB_DB_NAME in environment variables.");
  }

  return { uri, userDbName, adminDbName };
}

function shouldTryFallback(error: unknown) {
  const message = String(error instanceof Error ? error.message : error);
  return (
    message.includes("querySrv") ||
    message.includes("ENOTFOUND") ||
    message.includes("ECONNREFUSED") ||
    /ssl|tls|alert internal error/i.test(message) ||
    /timed out|Server selection|MongoServerSelectionError|secureConnect/i.test(message)
  );
}

function atlasFriendlyError(error: unknown): Error {
  const message = String(error instanceof Error ? error.message : error);
  if (
    /tlsv1 alert internal error|SSL alert number 80|ENOTFOUND|querySrv|ECONNREFUSED|timed out|Server selection/i.test(
      message,
    )
  ) {
    return new Error(
      "Could not connect to MongoDB Atlas. In Atlas → Network Access, allow your current IP " +
        "(or 0.0.0.0/0 for school/dev), confirm the cluster is running, then restart npm run dev.",
    );
  }
  return error instanceof Error ? error : new Error(message);
}

async function tryConnect(uri: string, options: MongoClientOptions) {
  const client = new MongoClient(uri, options);
  await client.connect();
  await client.db("admin").command({ ping: 1 });
  return client;
}

async function resolveSrvWithFallback(hostname: string) {
  const name = `_mongodb._tcp.${hostname}`;
  try {
    return await new Resolver().resolveSrv(name);
  } catch {
    const resolver = new Resolver();
    resolver.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4"]);
    return resolver.resolveSrv(name);
  }
}

async function resolveTxtWithFallback(hostname: string) {
  try {
    return await new Resolver().resolveTxt(hostname);
  } catch {
    try {
      const resolver = new Resolver();
      resolver.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4"]);
      return await resolver.resolveTxt(hostname);
    } catch {
      return [] as string[][];
    }
  }
}

/** Build mongodb:// URI from SRV + TXT (replica set hosts) when mongodb+srv fails. */
async function buildSrvResolvedFallbackUri(uri: string): Promise<string | null> {
  if (!uri.startsWith("mongodb+srv://")) {
    return null;
  }

  try {
    const parsed = new URL(uri);
    const host = parsed.hostname;
    const [srvRecords, txtRecords] = await Promise.all([
      resolveSrvWithFallback(host),
      resolveTxtWithFallback(host),
    ]);

    if (!srvRecords.length) {
      return null;
    }

    const hosts = srvRecords
      .map((record) => `${record.name.replace(/\.$/, "")}:${record.port || 27017}`)
      .join(",");

    const txt = txtRecords.map((parts) => parts.join("")).join("&");
    const txtParams = new URLSearchParams(txt.replace(/^authSource=/, "authSource="));
    const params = new URLSearchParams(parsed.search);

    if (!params.has("tls")) params.set("tls", "true");
    if (!params.has("authSource") && txtParams.get("authSource")) {
      params.set("authSource", txtParams.get("authSource")!);
    }
    if (!params.has("replicaSet") && txtParams.get("replicaSet")) {
      params.set("replicaSet", txtParams.get("replicaSet")!);
    }
    if (!params.has("retryWrites")) params.set("retryWrites", "true");
    if (!params.has("w")) params.set("w", "majority");

    const auth = parsed.username
      ? `${encodeURIComponent(parsed.username)}:${encodeURIComponent(parsed.password)}@`
      : "";

    return `mongodb://${auth}${hosts}/?${params.toString()}`;
  } catch {
    return null;
  }
}

async function connectOnce(uri: string): Promise<{
  client: MongoClient;
  userDb: Db;
  adminDb: Db;
}> {
  const { userDbName, adminDbName } = getMongoConfig();

  const optionSets: MongoClientOptions[] = [
    { ...baseClientOptions, family: 4 },
    { ...baseClientOptions },
  ];

  let lastError: unknown;
  for (const options of optionSets) {
    try {
      const client = await tryConnect(uri, options);
      return {
        client,
        userDb: client.db(userDbName),
        adminDb: client.db(adminDbName),
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function connectMongo(): Promise<{
  client: MongoClient;
  userDb: Db;
  adminDb: Db;
}> {
  const { uri } = getMongoConfig();
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await connectOnce(uri);
    } catch (primaryError) {
      lastError = primaryError;
      if (!shouldTryFallback(primaryError)) {
        break;
      }

      const fallbackUri = await buildSrvResolvedFallbackUri(uri);
      if (fallbackUri) {
        try {
          return await connectOnce(fallbackUri);
        } catch (fallbackError) {
          lastError = fallbackError;
        }
      }

      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
      }
    }
  }

  throw atlasFriendlyError(lastError);
}

/** @deprecated Use connectMongo() — kept for scripts that expect a single db handle. */
export async function connectUserMongo(): Promise<{ db: Db; client: MongoClient }> {
  const { client, userDb } = await connectMongo();
  return { client, db: userDb };
}
