/**
 * Seed sample events across student browse/joined categories and admin statuses.
 *
 * Usage: npm run seed:events
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { MongoClient } from "mongodb";

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
  const options = {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 30_000,
    family: 4,
  };
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

function dayOffset(days) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function schedule(offsetDays, startHour = 9, endHour = 16) {
  const day = dayOffset(offsetDays);
  return {
    startsAt: `${day}T${String(startHour).padStart(2, "0")}:00:00`,
    endsAt: `${day}T${String(endHour).padStart(2, "0")}:00:00`,
  };
}

function baseEvent(input) {
  const now = new Date().toISOString();
  const { startsAt, endsAt } = schedule(input.dayOffset ?? 0, input.startHour, input.endHour);
  return {
    seedKey: input.seedKey,
    title: input.title,
    description: input.description,
    announcements: input.announcements,
    category: input.category,
    location: input.location,
    startsAt,
    endsAt,
    attendanceRequired: "30 minutes",
    gracePeriod: "15 minutes",
    venueType: input.venueType || "On Campus",
    allowedCourses: input.allowedCourses || [],
    requiredFiles: input.requiredFiles || [],
    speakers: input.speakers || [],
    collaboratingDepartments: input.collaboratingDepartments || [],
    audienceSchools: input.audienceSchools || [],
    programActivities: input.programActivities || [],
    department: input.department,
    status: input.status,
    organizerEmail: input.organizerEmail,
    organizerName: input.organizerName,
    organizerId: input.organizerId,
    submittedByPortal: "user",
    reviewNote: input.reviewNote || "",
    reviewedByEmail: input.reviewedByEmail || "",
    createdAt: now,
    updatedAt: now,
  };
}

loadEnv();

const uri = process.env.MONGODB_URI?.trim();
const userDbName = process.env.MONGODB_DB_NAME?.trim();
const adminDbName = process.env.MONGODB_ADMIN_DB_NAME?.trim() || "dcspace_admin";

if (!uri || !userDbName) {
  console.error("Missing MONGODB_URI or MONGODB_DB_NAME in .env");
  process.exit(1);
}

const ORGANIZER_EMAIL = "organizer@sdca.edu.ph";
const ADMIN_EMAIL = "admin@sdca.edu.ph";

/** Student browse/joined + admin workflow samples. */
const EVENT_SEEDS = [
  // Happening now (live today)
  {
    seedKey: "sample-live-bsit-ga",
    title: "BSIT Domini Xode General Assembly 2026",
    status: "live",
    dayOffset: 0,
    category: "Organization Celebration",
    department: "College of Information Technology",
    allowedCourses: ["BSIT"],
    audienceSchools: ["College of Information Technology"],
    location: "SDCA Main Auditorium",
    description:
      "Annual general assembly for BSIT students and Domini Xode officers.\nAgenda includes officer reports, upcoming activities, and open forum.",
    announcements:
      "Doors open at 8:30 AM.\nBring your school ID and wear your organization shirt.",
    speakers: ["Engr. Maria Santos", "Domini Xode President"],
    programActivities: ["Opening Remarks", "Officer Reports", "Open Forum", "Closing"],
    collaboratingDepartments: ["Student Affairs Office"],
  },
  {
    seedKey: "sample-live-bsn-skills",
    title: "BSN Clinical Skills Showcase",
    status: "live",
    dayOffset: 0,
    startHour: 13,
    endHour: 17,
    category: "Academic Seminar",
    department: "College of Nursing",
    allowedCourses: ["BSN"],
    audienceSchools: ["College of Nursing"],
    location: "Nursing Skills Laboratory",
    description:
      "Live demonstration of fundamental nursing procedures for BSN students.\nFaculty will evaluate student performance stations.",
    announcements: "Wear your clinical uniform. Late entry after the grace period will be marked absent.",
    speakers: ["Prof. Ana Reyes, RN"],
    programActivities: ["Vital Signs Station", "Wound Care Demo", "Medication Prep", "Debrief"],
  },

  // Upcoming (approved, future dates)
  {
    seedKey: "sample-upcoming-bshm-expo",
    title: "BSHM Culinary Expo 2026",
    status: "approved",
    dayOffset: 10,
    category: "Social Event / Party",
    department: "College of Hospitality Management",
    allowedCourses: ["BSHM", "BSHM-CLO", "BSHM-CAKO"],
    audienceSchools: ["College of Hospitality Management"],
    location: "HM Training Kitchen",
    description: "Showcase of student culinary creations and HM program highlights.",
    announcements: "Registration opens one week before the event.",
    programActivities: ["Appetizer Round", "Main Course Showcase", "Dessert Tasting"],
  },
  {
    seedKey: "sample-upcoming-bsba-forum",
    title: "BSBA Marketing Innovation Forum",
    status: "approved",
    dayOffset: 14,
    category: "Academic Conference",
    department: "College of Business Administration",
    allowedCourses: ["BSBA", "BSBA-MM", "BSBA-HRDM"],
    audienceSchools: ["College of Business Administration"],
    location: "Business Hall Room 301",
    description: "Industry speakers and student pitches on digital marketing trends.",
    announcements: "Business casual attire required.",
    speakers: ["Mr. Carlo Mendoza, Marketing Director"],
  },
  {
    seedKey: "sample-upcoming-tech-workshop",
    title: "TechConnect AI Workshop 2026",
    status: "approved",
    dayOffset: 7,
    category: "Technology Workshop",
    department: "College of Information Technology",
    allowedCourses: ["BSIT", "BMMA"],
    audienceSchools: ["College of Information Technology"],
    location: "Computer Laboratory 2",
    description: "Hands-on workshop on practical AI tools for campus projects.",
    announcements: "Bring your laptop with Node.js installed.",
    speakers: ["Engr. Luis Tan"],
    programActivities: ["AI Basics", "Prompt Engineering Lab", "Project Clinic"],
  },
  {
    seedKey: "sample-upcoming-bsed-symposium",
    title: "BSED Research Symposium",
    status: "approved",
    dayOffset: 5,
    category: "Academic Seminar",
    department: "College of Education",
    allowedCourses: ["BSED", "BEED"],
    audienceSchools: ["College of Education"],
    location: "Education Building AVR",
    description: "Student teachers present action research and classroom innovation studies.",
    announcements: "Poster presenters must arrive 30 minutes early for setup.",
    programActivities: ["Poster Viewing", "Panel Presentations", "Awards"],
  },
  {
    seedKey: "sample-upcoming-domini-induction",
    title: "Domini Xode Induction 2026",
    status: "approved",
    dayOffset: 6,
    category: "Organization Social",
    department: "College of Information Technology",
    allowedCourses: ["BSIT"],
    audienceSchools: ["College of Information Technology"],
    location: "SDCA Covered Court",
    description: "Induction ceremony for newly accepted Domini Xode associate members.",
    announcements: "Invite is required for non-members.",
  },

  // Past (completed)
  {
    seedKey: "sample-past-beed-literacy",
    title: "BEED Literacy Week 2025",
    status: "completed",
    dayOffset: -45,
    category: "Academic Program",
    department: "College of Education",
    allowedCourses: ["BEED"],
    audienceSchools: ["College of Education"],
    location: "Elementary Education Hub",
    description: "Week-long literacy activities and community reading sessions.",
    announcements: "Event completed — certificates released to qualified participants.",
    reviewedByEmail: ADMIN_EMAIL,
  },
  {
    seedKey: "sample-past-bsit-party",
    title: "BSIT Year-End Party 2025",
    status: "completed",
    dayOffset: -30,
    category: "Organization Celebration",
    department: "College of Information Technology",
    allowedCourses: ["BSIT"],
    audienceSchools: ["College of Information Technology"],
    location: "SDCA Covered Court",
    description: "Year-end celebration for BSIT students and organization members.",
    announcements: "Thank you to all participants!",
    reviewedByEmail: ADMIN_EMAIL,
  },
  {
    seedKey: "sample-past-bmma-fest",
    title: "BMMA Digital Media Fest 2025",
    status: "completed",
    dayOffset: -20,
    category: "Technology Expo",
    department: "College of Arts and Sciences",
    allowedCourses: ["BMMA"],
    audienceSchools: ["College of Arts and Sciences"],
    location: "Media Arts Studio",
    description: "Showcase of student films, motion graphics, and digital portfolios.",
    reviewedByEmail: ADMIN_EMAIL,
  },

  // Admin — pending approval queue
  {
    seedKey: "sample-pending-bstm-fair",
    title: "BSTM Travel & Tourism Fair",
    status: "pending",
    dayOffset: 21,
    category: "Academic Fair",
    department: "College of Business Administration",
    allowedCourses: ["BSTM"],
    audienceSchools: ["College of Business Administration"],
    location: "Business Hall Lobby",
    description: "Tourism students exhibit destination packages and travel planning projects.",
    announcements: "Awaiting admin approval before publishing to students.",
  },
  {
    seedKey: "sample-pending-bsn-health",
    title: "BSN Community Health Drive",
    status: "pending",
    dayOffset: 12,
    category: "Academic Outreach",
    department: "College of Nursing",
    allowedCourses: ["BSN"],
    audienceSchools: ["College of Nursing"],
    location: "Barangay Health Center Partner Site",
    description: "Community immersion activity for BSN students.",
    venueType: "Off Campus",
  },
  {
    seedKey: "sample-pending-bsed-demo",
    title: "BSED Teaching Demo Day",
    status: "pending",
    dayOffset: 8,
    category: "Academic Workshop",
    department: "College of Education",
    allowedCourses: ["BSED"],
    audienceSchools: ["College of Education"],
    location: "Micro-Teaching Room",
    description: "Practice teaching demonstrations for BSED pre-service teachers.",
  },

  // Admin — inactive (rejected / postponed / cancelled)
  {
    seedKey: "sample-rejected-bshm-gala",
    title: "BSHM Gala Night (Rejected Sample)",
    status: "rejected",
    dayOffset: 30,
    category: "Social Event",
    department: "College of Hospitality Management",
    allowedCourses: ["BSHM"],
    audienceSchools: ["College of Hospitality Management"],
    location: "Off-campus venue (TBA)",
    description: "Formal gala proposal — rejected due to incomplete concept paper.",
    reviewNote: "Concept paper missing budget breakdown and safety plan.",
    reviewedByEmail: ADMIN_EMAIL,
  },
  {
    seedKey: "sample-postponed-bsba-finance",
    title: "BSBA Finance Summit (Postponed Sample)",
    status: "postponed",
    dayOffset: 18,
    category: "Academic Conference",
    department: "College of Business Administration",
    allowedCourses: ["BSBA-FM"],
    audienceSchools: ["College of Business Administration"],
    location: "Business Hall Room 401",
    description: "Finance summit postponed pending speaker confirmation.",
    reviewNote: "Postponed until keynote speaker contract is finalized.",
    reviewedByEmail: ADMIN_EMAIL,
  },
  {
    seedKey: "sample-cancelled-bsit-hackathon",
    title: "BSIT Hackathon (Cancelled Sample)",
    status: "cancelled",
    dayOffset: 25,
    category: "Technology Workshop",
    department: "College of Information Technology",
    allowedCourses: ["BSIT"],
    audienceSchools: ["College of Information Technology"],
    location: "Computer Laboratory 1",
    description: "24-hour hackathon cancelled due to scheduling conflict with campus exams.",
    reviewNote: "Cancelled — conflicts with midterm examination week.",
    reviewedByEmail: ADMIN_EMAIL,
  },

  // Extra approved (admin approved tab)
  {
    seedKey: "sample-approved-bsn-orientation",
    title: "BSN Freshmen Orientation 2026",
    status: "approved",
    dayOffset: 3,
    category: "Academic Orientation",
    department: "College of Nursing",
    allowedCourses: ["BSN"],
    audienceSchools: ["College of Nursing"],
    location: "Nursing Lecture Hall",
    description: "Orientation for incoming BSN freshmen and transferees.",
    announcements: "Parents/guardians may attend the morning session.",
  },
];

/** Public sample events — visible in explore for every authenticated user. */
const PUBLIC_STATUSES = new Set(["approved", "live", "completed"]);

/** All public sample events get a registration for every portal user. */
const REGISTRATION_SEEDS = EVENT_SEEDS.filter((row) => PUBLIC_STATUSES.has(row.status)).map(
  (row) => ({ seedKey: row.seedKey, status: "joined" }),
);

const INVITATION_SEEDS = [{ seedKey: "sample-upcoming-bsba-forum", status: "pending" }];

/** Student + faculty accounts that use the user portal (exclude admin consoles). */
const PORTAL_USER_ROLES = new Set(["student", "faculty"]);

const client = await connectWithFallback(uri);

try {
  const userDb = client.db(userDbName);
  const adminDb = client.db(adminDbName);
  const events = adminDb.collection("events");
  const registrations = userDb.collection("event_registrations");
  const invitations = userDb.collection("event_invitations");
  const users = userDb.collection("users");

  const organizer = await users.findOne({ email: ORGANIZER_EMAIL });
  if (!organizer) {
    console.warn(`Organizer ${ORGANIZER_EMAIL} not found — run npm run seed:admins first.`);
  }

  const portalUsers = await users
    .find({ role: { $in: [...PORTAL_USER_ROLES] } })
    .project({
      email: 1,
      firstName: 1,
      lastName: 1,
      studentNumber: 1,
      course: 1,
      school: 1,
      organizationPart: 1,
      organizationRole: 1,
      role: 1,
    })
    .toArray();

  if (!portalUsers.length) {
    console.warn("No portal users found — run npm run seed:admins or register accounts first.");
  } else {
    console.log(`Portal users to sync: ${portalUsers.length}`);
  }

  const organizerId = organizer ? String(organizer._id) : "";
  const organizerName =
    organizer
      ? `${organizer.firstName || ""} ${organizer.lastName || ""}`.trim() || "Event Organizer"
      : "Alex Organizer";

  const eventIdBySeed = new Map();

  for (const seed of EVENT_SEEDS) {
    const doc = baseEvent({
      ...seed,
      organizerEmail: ORGANIZER_EMAIL,
      organizerName,
      organizerId,
    });

    const existing = await events.findOne({ seedKey: seed.seedKey });
    if (existing) {
      await events.updateOne(
        { _id: existing._id },
        {
          $set: {
            ...doc,
            createdAt: existing.createdAt || doc.createdAt,
          },
        },
      );
      eventIdBySeed.set(seed.seedKey, String(existing._id));
      console.log(`Updated event: ${seed.title} [${seed.status}]`);
    } else {
      const result = await events.insertOne(doc);
      eventIdBySeed.set(seed.seedKey, String(result.insertedId));
      console.log(`Created event: ${seed.title} [${seed.status}]`);
    }
  }

  if (portalUsers.length) {
    const now = new Date().toISOString();
    let registrationCount = 0;
    let invitationCount = 0;

    for (const account of portalUsers) {
      const email = String(account.email || "").trim().toLowerCase();
      if (!email) continue;

      const userName =
        `${account.firstName || ""} ${account.lastName || ""}`.trim() || email;

      for (const reg of REGISTRATION_SEEDS) {
        const eventId = eventIdBySeed.get(reg.seedKey);
        const event = EVENT_SEEDS.find((row) => row.seedKey === reg.seedKey);
        if (!eventId || !event) continue;

        await registrations.updateOne(
          { email, eventId },
          {
            $set: {
              email,
              eventId,
              eventTitle: event.title,
              userName,
              studentNumber: String(account.studentNumber || ""),
              course: String(account.course || event.allowedCourses?.[0] || ""),
              school: String(account.school || "St. Dominic College of Asia"),
              organization: String(account.organizationPart || ""),
              organizationRole: String(account.organizationRole || ""),
              status: reg.status,
              updatedAt: now,
            },
            $setOnInsert: { createdAt: now },
          },
          { upsert: true },
        );
        registrationCount += 1;
      }

      for (const invite of INVITATION_SEEDS) {
        const eventId = eventIdBySeed.get(invite.seedKey);
        const event = EVENT_SEEDS.find((row) => row.seedKey === invite.seedKey);
        if (!eventId || !event) continue;

        await invitations.updateOne(
          { email, eventId },
          {
            $set: {
              email,
              eventId,
              eventTitle: event.title,
              userName,
              course: String(account.course || ""),
              organization: String(account.organizationPart || ""),
              status: invite.status,
              updatedAt: now,
            },
            $setOnInsert: { createdAt: now },
          },
          { upsert: true },
        );
        invitationCount += 1;
      }
    }

    console.log(
      `Synced ${registrationCount} registrations and ${invitationCount} invitations across ${portalUsers.length} portal users.`,
    );
  }

  console.log("\nSeed complete.");
  console.log("Every student/faculty account now sees public events in Explore and Events Joined.");
  console.log("Admin: pending, approved, live/ongoing, completed, inactive (rejected/postponed/cancelled)");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await client.close();
}
