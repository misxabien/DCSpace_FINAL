import dns from "dns/promises";
import { MongoClient, type Db, type MongoClientOptions } from "mongodb";

const clientOptions: MongoClientOptions = {
  maxPoolSize: 10,
  minPoolSize: 1,
  // Keep auth/registration snappy — long waits cause browser "Request timed out".
  serverSelectionTimeoutMS: 8_000,
  connectTimeoutMS: 8_000,
  socketTimeoutMS: 45_000,
  family: 4,
};

export function getMongoConfig() {
  const uri = process.env.MONGODB_URI?.trim();
  const dbName = process.env.MONGODB_DB_NAME?.trim();

  if (!uri || !dbName) {
    throw new Error("Missing MONGODB_URI or MONGODB_DB_NAME in environment variables.");
  }

  return { uri, dbName };
}

function shouldTryFallback(error: unknown) {
  const message = String(error instanceof Error ? error.message : error);
  return (
    message.includes("querySrv") ||
    message.includes("ENOTFOUND") ||
    message.includes("ECONNREFUSED") ||
    /ssl|tls|alert internal error/i.test(message)
  );
}

function atlasFriendlyError(error: unknown): Error {
  const message = String(error instanceof Error ? error.message : error);
  if (/tlsv1 alert internal error|SSL alert number 80|ENOTFOUND|querySrv|ECONNREFUSED/i.test(message)) {
    return new Error(
      "Could not connect to MongoDB Atlas. In Atlas → Network Access, allow your current IP " +
        "(or 0.0.0.0/0 for school/dev), confirm the cluster is running, then restart npm run dev.",
    );
  }
  return error instanceof Error ? error : new Error(message);
}

async function tryConnect(uri: string) {
  const client = new MongoClient(uri, clientOptions);
  await client.connect();
  return client;
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
      dns.resolveSrv(`_mongodb._tcp.${host}`),
      dns.resolveTxt(host).catch(() => [] as string[][]),
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

export async function connectUserMongo(): Promise<{ db: Db; client: MongoClient }> {
  const { uri, dbName } = getMongoConfig();

  try {
    const client = await tryConnect(uri);
    return { client, db: client.db(dbName) };
  } catch (primaryError) {
    if (!shouldTryFallback(primaryError)) {
      throw atlasFriendlyError(primaryError);
    }

    const fallbackUri = await buildSrvResolvedFallbackUri(uri);
    if (!fallbackUri) {
      throw atlasFriendlyError(primaryError);
    }

    try {
      const client = await tryConnect(fallbackUri);
      return { client, db: client.db(dbName) };
    } catch (fallbackError) {
      throw atlasFriendlyError(fallbackError);
    }
  }
}
