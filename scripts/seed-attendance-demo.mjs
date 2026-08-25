/**
 * Seeds RFID tags + live event registrations for attendance testing.
 * Usage: node scripts/seed-attendance-demo.mjs
 */
import { MongoClient, ObjectId } from "mongodb";
import { loadEnv } from "./load-env.mjs";

loadEnv();

const uri = process.env.MONGODB_URI?.trim();
const dbName = process.env.MONGODB_DB_NAME?.trim();
if (!uri || !dbName) {
  console.error("Missing MONGODB_URI or MONGODB_DB_NAME.");
  process.exit(1);
}

const TEST_USERS = [
  {
    email: "ara.marqueses@sdca.edu.ph",
    rfidNumber: "RFID-ARA-001",
    firstName: "Ara",
    lastName: "Marqueses",
  },
  {
    email: "student@sdca.edu.ph",
    rfidNumber: "RFID-SAM-002",
    firstName: "Sam",
    lastName: "Student",
  },
];

const client = new MongoClient(uri);
try {
  await client.connect();
  const db = client.db(dbName);

  for (const user of TEST_USERS) {
    const result = await db.collection("users").updateOne(
      { email: { $regex: `^${user.email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } },
      {
        $set: {
          rfidNumber: user.rfidNumber,
          updatedAt: new Date().toISOString(),
        },
      },
    );
    console.log(
      result.matchedCount
        ? `RFID ${user.rfidNumber} → ${user.email}`
        : `User not found: ${user.email}`,
    );
  }

  let liveEvent = await db.collection("events").findOne({ status: "live" });
  if (!liveEvent) {
    const now = new Date();
    const startsAt = new Date(now);
    startsAt.setHours(8, 0, 0, 0);
    const endsAt = new Date(now);
    endsAt.setHours(17, 0, 0, 0);
    const insert = await db.collection("events").insertOne({
      title: "BSIT Week 2026 — Live Attendance Demo",
      description: "Live attendance testing event.",
      category: "Academic",
      location: "SDCA Main Hall",
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      attendanceRequired: "30 minutes",
      attendanceRequiredMinutes: 30,
      gracePeriod: "15 minutes",
      gracePeriodMinutes: 15,
      status: "live",
      organizerEmail: "misxabien.germino@sdca.edu.ph",
      organizerName: "Misxa Bien Germino",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    liveEvent = { _id: insert.insertedId, title: "BSIT Week 2026 — Live Attendance Demo" };
    console.log(`Created live event: ${liveEvent._id}`);
  } else {
    await db.collection("events").updateOne(
      { _id: liveEvent._id },
      { $set: { status: "live", updatedAt: new Date().toISOString() } },
    );
    console.log(`Using live event: ${liveEvent._id} (${liveEvent.title || "untitled"})`);
  }

  const eventId = String(liveEvent._id);
  for (const user of TEST_USERS) {
    const existing = await db.collection("event_registrations").findOne({
      eventId,
      email: { $regex: `^${user.email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
    });
    if (existing) {
      await db.collection("event_registrations").updateOne(
        { _id: existing._id },
        { $set: { status: "joined", updatedAt: new Date().toISOString() } },
      );
      console.log(`Registration exists: ${user.email}`);
      continue;
    }
    await db.collection("event_registrations").insertOne({
      eventId,
      email: user.email.toLowerCase(),
      userName: `${user.firstName} ${user.lastName}`,
      status: "joined",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    console.log(`Registered: ${user.email}`);
  }

  console.log("\n--- Attendance demo ready ---");
  console.log(`Event ID: ${eventId}`);
  console.log(`Admin RFID: /admin/rfid17?id=${eventId}`);
  console.log(`Student attendance: /attendance/details?id=${eventId}`);
  console.log("Test RFID tags:");
  for (const user of TEST_USERS) {
    console.log(`  ${user.rfidNumber} → ${user.email}`);
  }
} finally {
  await client.close();
}
