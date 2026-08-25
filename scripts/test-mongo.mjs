/**
 * Quick MongoDB connection test. Usage: npm run test:mongo
 */
import { MongoClient } from "mongodb";
import { loadEnv } from "./load-env.mjs";

loadEnv();

const uri = process.env.MONGODB_URI?.trim();
const dbName = process.env.MONGODB_DB_NAME?.trim();

if (!uri || !dbName) {
  console.error("Missing MONGODB_URI or MONGODB_DB_NAME.");
  console.error("Add them to .env.local (see .env.example), then run again.");
  process.exit(1);
}

const client = new MongoClient(uri, {
  serverSelectionTimeoutMS: 15_000,
  connectTimeoutMS: 15_000,
});

try {
  await client.connect();
  const db = client.db(dbName);
  await db.command({ ping: 1 });
  const collections = await db.listCollections().toArray();
  console.log("MongoDB connection OK");
  console.log(`Database: ${dbName}`);
  console.log(`Collections: ${collections.length ? collections.map((c) => c.name).join(", ") : "(none yet)"}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error("MongoDB connection FAILED");
  console.error(message);
  console.error("");
  console.error("Checklist:");
  console.error("  1. MONGODB_URI in .env.local is correct (password URL-encoded if it has special chars)");
  console.error("  2. Atlas → Network Access → your current IP is allowed");
  console.error("  3. Atlas → Database Access → user exists with read/write on the cluster");
  process.exit(1);
} finally {
  await client.close();
}
