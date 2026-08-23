#!/usr/bin/env node
/**
 * Move admin-owned collections from dcspace_user → dcspace_admin.
 *
 * Usage:
 *   node scripts/migrate-db-organize.mjs
 *   node scripts/migrate-db-organize.mjs --drop-legacy
 */
import fs from "fs";
import { MongoClient } from "mongodb";

const USER_DB_COLLECTIONS = {
  notifications: "notifications",
};

const ADMIN_DB_COLLECTIONS = {
  events: "events",
  activities: "user_activities",
  eventReports: "event_reports",
};

const LEGACY_ADMIN_IN_USER_DB = Object.values(ADMIN_DB_COLLECTIONS);
const LEGACY_USER_DB_COLLECTIONS = ["bookmarks", "user_notifications"];

function loadEnv() {
  const envPath = new URL("../.env", import.meta.url);
  if (!fs.existsSync(envPath)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(envPath, "utf8")
      .split("\n")
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const idx = line.indexOf("=");
        if (idx === -1) return null;
        return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
      })
      .filter(Boolean),
  );
}

const env = loadEnv();
const uri = env.MONGODB_URI || process.env.MONGODB_URI;
const userDbName = env.MONGODB_DB_NAME || process.env.MONGODB_DB_NAME || "dcspace_user";
const adminDbName =
  env.MONGODB_ADMIN_DB_NAME || process.env.MONGODB_ADMIN_DB_NAME || "dcspace_admin";
const dropLegacy = process.argv.includes("--drop-legacy");

if (!uri) {
  console.error("Missing MONGODB_URI");
  process.exit(1);
}

const adminCollections = Object.values(ADMIN_DB_COLLECTIONS);
const userCollections = [
  "users",
  "saved_events",
  "event_registrations",
  "event_invitations",
  "notifications",
  "attendance_records",
  "feedback_entries",
  "certificates",
  "email_verifications",
  "event_gallery",
];

async function copyCollection(sourceDb, targetDb, name) {
  const source = sourceDb.collection(name);
  const target = targetDb.collection(name);
  const count = await source.countDocuments();
  if (!count) {
    console.log(`  skip ${name} (empty in source)`);
    return 0;
  }

  const docs = await source.find({}).toArray();
  let copied = 0;
  for (const doc of docs) {
    await target.replaceOne({ _id: doc._id }, doc, { upsert: true });
    copied += 1;
  }
  console.log(`  copied ${name}: ${copied} docs`);
  return copied;
}

async function mergeNotifications(userDb) {
  const legacy = userDb.collection("user_notifications");
  const target = userDb.collection(USER_DB_COLLECTIONS.notifications);
  const legacyCount = await legacy.countDocuments();
  if (!legacyCount) return 0;

  const docs = await legacy.find({}).toArray();
  for (const doc of docs) {
    await target.replaceOne({ _id: doc._id }, doc, { upsert: true });
  }
  console.log(`  merged user_notifications → notifications: ${legacyCount} docs`);
  return legacyCount;
}

async function main() {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 20000 });
  await client.connect();

  const userDb = client.db(userDbName);
  const adminDb = client.db(adminDbName);

  console.log(`User DB:  ${userDbName}`);
  console.log(`Admin DB: ${adminDbName}`);
  console.log("");

  console.log("Admin collections (user → admin):");
  for (const name of adminCollections) {
    await copyCollection(userDb, adminDb, name);
  }

  console.log("");
  console.log("User DB housekeeping:");
  await mergeNotifications(userDb);

  if (dropLegacy) {
    console.log("");
    console.log("Dropping legacy collections from user DB:");
    for (const name of [...LEGACY_ADMIN_IN_USER_DB, ...LEGACY_USER_DB_COLLECTIONS]) {
      const exists = await userDb.listCollections({ name }).hasNext();
      if (!exists) continue;
      await userDb.collection(name).drop();
      console.log(`  dropped ${name}`);
    }
  } else {
    console.log("");
    console.log("Legacy collections left in place. Re-run with --drop-legacy to remove:");
    for (const name of [...LEGACY_ADMIN_IN_USER_DB, ...LEGACY_USER_DB_COLLECTIONS]) {
      const exists = await userDb.listCollections({ name }).hasNext();
      if (exists) console.log(`  - ${name}`);
    }
  }

  console.log("");
  console.log("Final layout:");
  for (const [label, db, names] of [
    ["user", userDb, userCollections],
    ["admin", adminDb, adminCollections],
  ]) {
    console.log(`  ${label} (${db.databaseName}):`);
    for (const name of names) {
      const count = await db.collection(name).countDocuments().catch(() => 0);
      console.log(`    ${name}: ${count}`);
    }
  }

  await client.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
