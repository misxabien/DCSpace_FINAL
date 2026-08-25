/**
 * Seeds a representative set of events across all statuses for admin panel testing.
 * Usage: node scripts/seed-events-admin.mjs
 */
import { MongoClient } from "mongodb";
import { loadEnv } from "./load-env.mjs";

loadEnv();

const uri = process.env.MONGODB_URI?.trim();
const dbName = process.env.MONGODB_DB_NAME?.trim();
if (!uri || !dbName) {
  console.error("Missing MONGODB_URI or MONGODB_DB_NAME.");
  process.exit(1);
}

function daysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

const now = new Date().toISOString();

const EVENTS = [
  // --- Pending ---
  {
    title: "BSIT Seminar on Cloud Computing",
    description: "A seminar exploring modern cloud computing platforms for IT students.",
    category: "Academic",
    location: "Room 201, SDCA Main Building",
    startsAt: daysFromNow(10),
    endsAt: daysFromNow(10),
    attendanceRequired: "30 minutes",
    attendanceRequiredMinutes: 30,
    status: "pending",
    organizerEmail: "organizer@sdca.edu.ph",
    organizerName: "Alex Organizer",
  },
  {
    title: "Leadership and Values Formation Seminar",
    description: "A seminar on student leadership and values formation for SDCA students.",
    category: "Character Formation",
    location: "SDCA Gymnasium",
    startsAt: daysFromNow(14),
    endsAt: daysFromNow(14),
    attendanceRequired: "60 minutes",
    attendanceRequiredMinutes: 60,
    status: "pending",
    organizerEmail: "organizer@sdca.edu.ph",
    organizerName: "Alex Organizer",
  },
  // --- Approved ---
  {
    title: "BSIT General Assembly 2026",
    description: "Annual general assembly for all BSIT students. Attendance required.",
    category: "Academic",
    location: "SDCA Auditorium",
    startsAt: daysFromNow(7),
    endsAt: daysFromNow(7),
    attendanceRequired: "45 minutes",
    attendanceRequiredMinutes: 45,
    gracePeriod: "15 minutes",
    gracePeriodMinutes: 15,
    status: "approved",
    organizerEmail: "misxabien.germino@sdca.edu.ph",
    organizerName: "Misxa Bien Germino",
    reviewedByEmail: "admin@sdca.edu.ph",
  },
  {
    title: "Career Expo 2026",
    description: "Annual career fair with companies from IT, BPO, and engineering sectors.",
    category: "Career Development",
    location: "SDCA Gymnasium",
    startsAt: daysFromNow(20),
    endsAt: daysFromNow(20),
    attendanceRequired: "60 minutes",
    attendanceRequiredMinutes: 60,
    status: "approved",
    organizerEmail: "organizer@sdca.edu.ph",
    organizerName: "Alex Organizer",
    reviewedByEmail: "admin@sdca.edu.ph",
  },
  {
    title: "Tech Talk: Artificial Intelligence in Practice",
    description: "An industry speaker session on applied AI and machine learning.",
    category: "Tech",
    location: "SDCA Seminar Hall",
    startsAt: daysFromNow(5),
    endsAt: daysFromNow(5),
    attendanceRequired: "30 minutes",
    attendanceRequiredMinutes: 30,
    status: "approved",
    organizerEmail: "organizer@sdca.edu.ph",
    organizerName: "Alex Organizer",
    reviewedByEmail: "admin@sdca.edu.ph",
  },
  {
    title: "Sports Fest 2026",
    description: "Inter-department sports competition open to all SDCA students.",
    category: "Sports",
    location: "SDCA Sports Complex",
    startsAt: daysFromNow(30),
    endsAt: daysFromNow(31),
    status: "approved",
    organizerEmail: "organizer@sdca.edu.ph",
    organizerName: "Alex Organizer",
    reviewedByEmail: "admin@sdca.edu.ph",
  },
  // --- Completed ---
  {
    title: "Orientation Day 2026",
    description: "Welcome orientation for new SDCA students.",
    category: "Academic",
    location: "SDCA Auditorium",
    startsAt: daysFromNow(-60),
    endsAt: daysFromNow(-60),
    status: "completed",
    organizerEmail: "admin@sdca.edu.ph",
    organizerName: "Casey Admin",
    reviewedByEmail: "admin@sdca.edu.ph",
  },
  {
    title: "Freshmen Night 2025",
    description: "Annual freshmen welcome night.",
    category: "Student Activity",
    location: "SDCA Gymnasium",
    startsAt: daysFromNow(-45),
    endsAt: daysFromNow(-45),
    status: "completed",
    organizerEmail: "organizer@sdca.edu.ph",
    organizerName: "Alex Organizer",
    reviewedByEmail: "admin@sdca.edu.ph",
  },
  // --- Rejected ---
  {
    title: "Off-Campus Field Trip (Unapproved Venue)",
    description: "A proposed field trip that did not meet venue safety requirements.",
    category: "Academic",
    location: "External Venue",
    startsAt: daysFromNow(-10),
    status: "rejected",
    organizerEmail: "organizer@sdca.edu.ph",
    organizerName: "Alex Organizer",
    reviewNote: "Venue does not meet safety requirements. Please resubmit with an approved venue.",
    reviewedByEmail: "admin@sdca.edu.ph",
  },
  // --- Postponed ---
  {
    title: "End-of-Year Celebration (Postponed)",
    description: "Year-end celebration postponed due to scheduling conflict.",
    category: "Student Activity",
    location: "SDCA Gymnasium",
    startsAt: daysFromNow(-5),
    status: "postponed",
    organizerEmail: "organizer@sdca.edu.ph",
    organizerName: "Alex Organizer",
    reviewNote: "Rescheduled — new date TBA.",
    reviewedByEmail: "admin@sdca.edu.ph",
  },
];

const client = new MongoClient(uri);
try {
  await client.connect();
  const db = client.db(dbName);
  const col = db.collection("events");

  let inserted = 0;
  let skipped = 0;
  for (const event of EVENTS) {
    const exists = await col.findOne({ title: event.title });
    if (exists) {
      skipped++;
      console.log(`  skip  ${event.status} | ${event.title}`);
      continue;
    }
    await col.insertOne({
      ...event,
      createdAt: now,
      updatedAt: now,
    });
    inserted++;
    console.log(`  added ${event.status} | ${event.title}`);
  }
  console.log(`\nDone. Inserted: ${inserted}, Skipped: ${skipped}`);
} finally {
  await client.close();
}
