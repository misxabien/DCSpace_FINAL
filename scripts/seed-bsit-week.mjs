/**
 * Seed BSIT Week 2026 as a live event for attendance testing.
 *
 * Usage: npm run seed:bsit-week
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { MongoClient, ObjectId } from "mongodb";

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function buildNonSrvFallbackUri(uri) {
  if (!uri.startsWith("mongodb+srv://")) return null;
  try {
    const parsed = new URL(uri);
    const auth = parsed.username
      ? `${encodeURIComponent(parsed.username)}:${encodeURIComponent(parsed.password)}@`
      : "";
    const dbPath = parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : "";
    const params = new URLSearchParams(parsed.search);
    if (!params.has("tls")) params.set("tls", "true");
    const query = params.toString();
    return `mongodb://${auth}${parsed.host}:27017${dbPath}${query ? `?${query}` : ""}`;
  } catch {
    return null;
  }
}

async function connectWithFallback(uri) {
  const options = { maxPoolSize: 5, serverSelectionTimeoutMS: 45_000, family: 4 };
  try {
    const client = new MongoClient(uri, options);
    await client.connect();
    return client;
  } catch (primaryError) {
    const fallbackUri = buildNonSrvFallbackUri(uri);
    if (!fallbackUri) throw primaryError;
    console.warn("Primary Mongo URI failed; trying non-SRV fallback…");
    const client = new MongoClient(fallbackUri, options);
    await client.connect();
    return client;
  }
}

function readBase64(path) {
  if (!existsSync(path)) {
    console.warn(`File not found: ${path}`);
    return "";
  }
  return readFileSync(path).toString("base64");
}

function todaySchedule(startHour = 8, endHour = 18) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const day = `${y}-${m}-${d}`;
  return {
    startsAt: `${day}T${String(startHour).padStart(2, "0")}:00:00`,
    endsAt: `${day}T${String(endHour).padStart(2, "0")}:00:00`,
  };
}

loadEnv();

const uri = process.env.MONGODB_URI?.trim();
const userDbName = process.env.MONGODB_DB_NAME?.trim();
const adminDbName = process.env.MONGODB_ADMIN_DB_NAME?.trim();
if (!uri || !userDbName || !adminDbName) {
  console.error("Missing MONGODB_URI, MONGODB_DB_NAME, or MONGODB_ADMIN_DB_NAME in .env");
  process.exit(1);
}

const ORGANIZER_EMAIL = "misxabien.germino@sdca.edu.ph";
const ORGANIZER_NAME = "Misxa Bien Germino";
const SEED_KEY = "bsit-week-2026-live";
const CONCEPT_PAPER_PATH = resolve(
  process.env.HOME || "",
  "Downloads/BSIT Week Concept Paper.docx.pdf",
);
const POSTER_PATH = resolve(
  process.env.HOME || "",
  ".cursor/projects/Users-rhamseymarqueses-Documents-DCSpace-FINAL/assets/IMG_4180-6ecc9b9d-a61f-4b00-b51d-69c3b1fdc54b.png",
);

const client = await connectWithFallback(uri);

try {
  const userDb = client.db(userDbName);
  const adminDb = client.db(adminDbName);
  const users = userDb.collection("users");
  const events = adminDb.collection("events");
  const registrations = userDb.collection("event_registrations");

  const organizer = await users.findOne({ email: ORGANIZER_EMAIL });
  if (!organizer) {
    console.error(`Organizer ${ORGANIZER_EMAIL} not found.`);
    process.exit(1);
  }

  await users.updateOne(
    { _id: organizer._id },
    {
      $set: {
        firstName: "Misxa",
        lastName: "Germino",
        organizationPart: "Domini Xode",
        organizationRole: "officer:President",
        course: "BSIT",
        school: "St. Dominic College of Asia",
        updatedAt: new Date().toISOString(),
      },
    },
  );
  console.log(`Updated organizer access for ${ORGANIZER_NAME}`);

  const templateSource = await events.findOne(
    { certificateTemplateBase64: { $exists: true, $ne: "" } },
    { projection: { certificateTemplateName: 1, certificateTemplateMimeType: 1, certificateTemplateBase64: 1 } },
  );

  const conceptPaperBase64 = readBase64(CONCEPT_PAPER_PATH);
  const posterImageBase64 = readBase64(POSTER_PATH);
  const { startsAt, endsAt } = todaySchedule(8, 18);
  const now = new Date().toISOString();

  const description = [
    "BSIT Week 2026 is a four-day celebration for BSIT students at the SDCA Main and Digital Campuses.",
    "",
    "The Domini Xode Organization believes that being a BSIT student is about more than just coding in a lab.",
    "We want to create a space where students can sharpen their technical skills and build friendships through",
    "esports, IT competitions, sports, career talks, booths, and team-building activities.",
    "",
    "Today's live session: Sports Elimination & Championship Round — Basketball and Volleyball at Skyline Gymnasium.",
  ].join("\n");

  const announcements = [
    "Wear your school ID and organization shirt.",
    "Doors open at 8:00 AM. Grace period for attendance is 15 minutes.",
    "Minimum attendance duration: 30 minutes to qualify for e-certificate.",
    "Sports teams must check in at the registration table before games begin.",
    "Food booths open throughout the day — support Domini Xode partner booths.",
  ].join("\n");

  const programActivities = [
    "BSIT Week Opening Ceremony",
    "Esports Elimination Round — Mobile Legends & Call of Duty",
    "IT Competition — Quiz Bee (IT-related questions)",
    "IT Competition — IT Skills (C, Java, Python)",
    "Sports Elimination Round — Basketball & Volleyball",
    "Sports Championship Round — Basketball & Volleyball",
    "Team Building Activities",
    "Awarding Ceremony",
    "Career Talk — Sustaining Success in IT: Advanced Strategies for Career Growth and Leadership",
    "Career Talk — Breaking Into IT: Practical Strategies for Fresh Graduates",
    "IT Tanghalan (Talent Show)",
    "Closing Ceremony",
    "Hooked on Cookies Booth",
    "Fusion Alley de Dominican Booth",
    "Java & Pop Beads Booth",
    "Cassiecakes Booth",
    "Cining Cinema Booth",
  ];

  const eventDoc = {
    seedKey: SEED_KEY,
    title: "BSIT Week 2026",
    description,
    category: "Organization Celebration",
    location: "SDCA Main Campus — Skyline Gymnasium",
    startsAt,
    endsAt,
    attendanceRequired: "30 minutes",
    attendanceRequiredMinutes: 30,
    gracePeriod: "15 minutes",
    gracePeriodMinutes: 15,
    venueType: "On Campus",
    announcements,
    allowedCourses: ["BSIT"],
    requiredFiles: ["Valid School ID", "Organization Shirt"],
    speakers: [
      "SDCA Alumni — IT Industry Professionals",
      "Recruitment Experts — Career Pathways Panel",
    ],
    collaboratingDepartments: [
      "Domini Xode — BSIT Student Council",
      "Department of Student Affairs and Services",
      "School of Communication, Multimedia, and Computer Studies",
    ],
    audienceSchools: [
      "College of Information Technology",
      "School of Communication, Multimedia, and Computer Studies",
    ],
    programActivities,
    department: "Domini Xode — BSIT Student Council",
    conceptPaperName: "BSIT Week Concept Paper.docx.pdf",
    conceptPaperMimeType: "application/pdf",
    conceptPaperBase64: conceptPaperBase64,
    posterImageBase64: posterImageBase64,
    posterImageMimeType: "image/png",
    certificateTemplateName: templateSource?.certificateTemplateName || "Ecert General Assembly.pdf",
    certificateTemplateMimeType: templateSource?.certificateTemplateMimeType || "application/pdf",
    certificateTemplateBase64: String(templateSource?.certificateTemplateBase64 || ""),
    programFileName: "BSIT Week 2026 Program Flow.pdf",
    programFileMimeType: "application/pdf",
    programFileVisibility: "everyone",
    status: "live",
    organizerId: String(organizer._id),
    organizerEmail: ORGANIZER_EMAIL,
    organizerName: ORGANIZER_NAME,
    submittedByPortal: "user",
    reviewedByEmail: "admin@sdca.edu.ph",
    reviewNote: "Approved for live attendance testing.",
    iroomStatus: "none",
    createdAt: now,
    updatedAt: now,
  };

  if (!eventDoc.conceptPaperBase64) {
    console.warn("Concept paper PDF not found — event will be created without it.");
    delete eventDoc.conceptPaperBase64;
    delete eventDoc.conceptPaperName;
    delete eventDoc.conceptPaperMimeType;
  }

  if (!eventDoc.posterImageBase64) {
    console.warn("Poster image not found — event will be created without poster.");
    delete eventDoc.posterImageBase64;
    delete eventDoc.posterImageMimeType;
  }

  const existing = await events.findOne({ seedKey: SEED_KEY });
  let eventId;
  if (existing) {
    await events.updateOne(
      { _id: existing._id },
      { $set: { ...eventDoc, createdAt: existing.createdAt || now } },
    );
    eventId = String(existing._id);
    console.log(`Updated live event: BSIT Week 2026 (${eventId})`);
  } else {
    const result = await events.insertOne(eventDoc);
    eventId = String(result.insertedId);
    console.log(`Created live event: BSIT Week 2026 (${eventId})`);
  }

  // Register test students so they can tap in from the student portal.
  const testStudents = [
    { email: "ara.marqueses@sdca.edu.ph", name: "Ara Marqueses", studentNumber: "STU-2026-001", course: "BSIT" },
    { email: "student@sdca.edu.ph", name: "Sam Student", studentNumber: "STU-1001", course: "BSIT" },
  ];

  for (const student of testStudents) {
    await registrations.updateOne(
      { email: student.email, eventId },
      {
        $set: {
          email: student.email,
          eventId,
          eventTitle: "BSIT Week 2026",
          userName: student.name,
          studentNumber: student.studentNumber,
          course: student.course,
          school: "St. Dominic College of Asia",
          organization: "Domini Xode",
          status: "joined",
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
  }
  console.log(`Registered ${testStudents.length} students for attendance testing.`);

  console.log("\nBSIT Week 2026 is LIVE now.");
  console.log(`Organizer: ${ORGANIZER_NAME} (${ORGANIZER_EMAIL})`);
  console.log(`Admin RFID attendance: /admin/rfid17?id=${eventId}`);
  console.log(`Admin live event: /admin/live16?id=${eventId}`);
  console.log("Student tap in/out: join the event, open Attendance, then tap In / Out.");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await client.close();
}
