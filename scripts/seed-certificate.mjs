/**
 * Issue a sample certificate for a portal user from an event with a PDF template.
 *
 * Usage:
 *   npm run seed:certificate
 *   npm run seed:certificate -- --email ara.marqueses@sdca.edu.ph --name "Ara Marqueses"
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import crypto from "node:crypto";
import { MongoClient } from "mongodb";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

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

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    email: "ara.marqueses@sdca.edu.ph",
    name: "Ara Marqueses",
    eventTitle: "BSIT General Assembly 2026",
    eventId: "",
  };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--email" && args[i + 1]) out.email = args[++i].trim().toLowerCase();
    if (args[i] === "--name" && args[i + 1]) out.name = args[++i].trim();
    if (args[i] === "--event" && args[i + 1]) out.eventTitle = args[++i].trim();
    if (args[i] === "--event-id" && args[i + 1]) out.eventId = args[++i].trim();
  }
  return out;
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
    serverSelectionTimeoutMS: 45_000,
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

function inferCertificateCategory(dateIso) {
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return "cert-month";
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) return "cert-today";
  const day = date.getDay();
  if (day === 0 || day === 6) return "cert-weekend";
  return "cert-month";
}

async function buildBlankCertificateTemplate() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([792, 612]);
  const { width, height } = page.getSize();
  const titleFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const bodyFont = await pdf.embedFont(StandardFonts.Helvetica);

  page.drawRectangle({
    x: 24,
    y: 24,
    width: width - 48,
    height: height - 48,
    borderColor: rgb(0.27, 0.54, 1),
    borderWidth: 3,
    color: rgb(0.98, 0.99, 1),
  });

  const heading = "Certificate of Participation";
  const headingSize = 28;
  const headingWidth = titleFont.widthOfTextAtSize(heading, headingSize);
  page.drawText(heading, {
    x: (width - headingWidth) / 2,
    y: height * 0.72,
    size: headingSize,
    font: titleFont,
    color: rgb(0.13, 0.2, 0.34),
  });

  const subtitle = "St. Dominic College of Asia · DC Space";
  const subtitleSize = 14;
  const subtitleWidth = bodyFont.widthOfTextAtSize(subtitle, subtitleSize);
  page.drawText(subtitle, {
    x: (width - subtitleWidth) / 2,
    y: height * 0.64,
    size: subtitleSize,
    font: bodyFont,
    color: rgb(0.35, 0.4, 0.48),
  });

  const bytes = await pdf.save();
  return Buffer.from(bytes).toString("base64");
}

async function buildCertificatePdfFromTemplate(input) {
  const normalized = input.templateBase64.replace(/^data:application\/pdf;base64,/, "").trim();
  const pdf = await PDFDocument.load(Uint8Array.from(Buffer.from(normalized, "base64")));
  const page = pdf.getPages()[0];
  if (!page) throw new Error("Certificate template PDF has no pages.");

  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const subFont = await pdf.embedFont(StandardFonts.Helvetica);
  const { width, height } = page.getSize();
  const name = input.recipientName.trim() || "Participant";
  const title = input.eventName.trim() || "Event";
  const nameSize = Math.max(24, Math.min(34, width / 18));
  const metaSize = Math.max(12, Math.min(16, width / 42));

  const nameWidth = font.widthOfTextAtSize(name, nameSize);
  page.drawText(name, {
    x: Math.max(36, (width - nameWidth) / 2),
    y: height * 0.38,
    size: nameSize,
    font,
    color: rgb(0.13, 0.2, 0.34),
  });

  const subtitle = `For completing the attendance requirement for ${title}`;
  const subtitleWidth = subFont.widthOfTextAtSize(subtitle, metaSize);
  page.drawText(subtitle, {
    x: Math.max(36, (width - subtitleWidth) / 2),
    y: height * 0.31,
    size: metaSize,
    font: subFont,
    color: rgb(0.23, 0.27, 0.33),
  });

  const issued = `Issued ${input.dateIssued}`;
  const issuedWidth = subFont.widthOfTextAtSize(issued, metaSize);
  page.drawText(issued, {
    x: Math.max(36, (width - issuedWidth) / 2),
    y: height * 0.25,
    size: metaSize,
    font: subFont,
    color: rgb(0.23, 0.27, 0.33),
  });

  const bytes = await pdf.save();
  return Buffer.from(bytes).toString("base64");
}

loadEnv();

const uri = process.env.MONGODB_URI?.trim();
const userDbName = process.env.MONGODB_DB_NAME?.trim();
const adminDbName = process.env.MONGODB_ADMIN_DB_NAME?.trim();
if (!uri || !userDbName || !adminDbName) {
  console.error("Missing MONGODB_URI, MONGODB_DB_NAME, or MONGODB_ADMIN_DB_NAME in .env");
  process.exit(1);
}

const { email, name, eventTitle, eventId: eventIdArg } = parseArgs();
const FALLBACK_SEED_KEY = "sample-connectivity-check-cert";
const ORGANIZER_EMAIL = "organizer@sdca.edu.ph";

const client = await connectWithFallback(uri);

try {
  const userDb = client.db(userDbName);
  const adminDb = client.db(adminDbName);
  const users = userDb.collection("users");
  const events = adminDb.collection("events");
  const certificates = userDb.collection("certificates");

  let user = await users.findOne({ email });
  if (!user) {
    const [firstName, ...rest] = name.split(/\s+/);
    const doc = {
      firstName: firstName || "Ara",
      lastName: rest.join(" ") || "Marqueses",
      studentNumber: "STU-2026-001",
      email,
      passwordHash: hashPassword("password"),
      role: "student",
      course: "BSIT",
      school: "St. Dominic College of Asia",
      organizationPart: "",
      organizationRole: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      dataPrivacyAcceptedAt: new Date().toISOString(),
    };
    const result = await users.insertOne(doc);
    user = { ...doc, _id: result.insertedId };
    console.log(`Created portal user ${email} (${name}) — password: password`);
  } else {
    await users.updateOne(
      { _id: user._id },
      {
        $set: {
          firstName: name.split(/\s+/)[0] || user.firstName,
          lastName: name.split(/\s+/).slice(1).join(" ") || user.lastName,
          updatedAt: new Date().toISOString(),
        },
      },
    );
    console.log(`Using existing user ${email}`);
  }

  const now = new Date().toISOString();
  let event = null;

  if (eventIdArg) {
    const { ObjectId } = await import("mongodb");
    if (ObjectId.isValid(eventIdArg)) {
      event = await events.findOne({ _id: new ObjectId(eventIdArg) });
    }
  }

  if (!event && eventTitle) {
    const titlePattern = eventTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = await events
      .find({ title: { $regex: titlePattern, $options: "i" } })
      .sort({ updatedAt: -1 })
      .limit(10)
      .toArray();
    event =
      matches.find((row) => String(row.certificateTemplateBase64 || "").length > 100) ||
      matches[0] ||
      null;
  }

  if (event && String(event.certificateTemplateBase64 || "").length < 100) {
    const full = await events.findOne(
      { _id: event._id },
      { projection: { certificateTemplateBase64: 1 } },
    );
    if (full?.certificateTemplateBase64) {
      event = { ...event, certificateTemplateBase64: full.certificateTemplateBase64 };
    }
  }

  if (!event || !String(event.certificateTemplateBase64 || "").length) {
    console.warn(
      `No event with certificate template found for "${eventTitle}". Creating fallback sample event.`,
    );
    const organizer = await users.findOne({ email: ORGANIZER_EMAIL });
    const organizerId = organizer ? String(organizer._id) : "";
    const organizerName = organizer
      ? `${organizer.firstName || ""} ${organizer.lastName || ""}`.trim() || "Alex Organizer"
      : "Alex Organizer";
    const eventDate = new Date();
    eventDate.setDate(eventDate.getDate() - 7);
    eventDate.setHours(12, 0, 0, 0);
    const startsAt = eventDate.toISOString().slice(0, 10);
    const templateBase64 = await buildBlankCertificateTemplate();
    const eventDoc = {
      seedKey: FALLBACK_SEED_KEY,
      title: eventTitle || "Connectivity Check Event",
      description:
        "Sample completed event with an e-certificate template for DC Space connectivity testing.",
      status: "completed",
      venueType: "On Campus",
      venue: "SDCA Main Auditorium",
      startsAt,
      endsAt: startsAt,
      startTime: "9:00 AM",
      endTime: "4:00 PM",
      organizerEmail: ORGANIZER_EMAIL,
      organizerName,
      organizerId,
      hasCertificateTemplate: true,
      certificateTemplateName: "connectivity-check-certificate-template.pdf",
      certificateTemplateMimeType: "application/pdf",
      certificateTemplateBase64: templateBase64,
      eCertificateEnabled: true,
      attendanceDuration: "4 hours",
      updatedAt: now,
    };
    const existing = await events.findOne({ seedKey: FALLBACK_SEED_KEY });
    if (existing) {
      await events.updateOne(
        { _id: existing._id },
        { $set: { ...eventDoc, createdAt: existing.createdAt || now } },
      );
      event = { ...existing, ...eventDoc };
    } else {
      const result = await events.insertOne({ ...eventDoc, createdAt: now });
      event = { ...eventDoc, _id: result.insertedId };
    }
  } else {
    console.log(
      `Using event: ${event.title} (template: ${event.certificateTemplateName || "uploaded PDF"})`,
    );
  }

  const resolvedTitle = String(event.title || eventTitle);
  const templateBase64 = String(event.certificateTemplateBase64 || "");
  const startsAt = String(event.startsAt || now);
  const eventId = String(event._id);
  const dateIssued = new Date(now).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const generatedPdfBase64 = await buildCertificatePdfFromTemplate({
    templateBase64,
    recipientName: name,
    eventName: resolvedTitle,
    dateIssued,
  });

  const certDoc = {
    name: "Certificate of Participation",
    eventId,
    eventName: resolvedTitle,
    email,
    userName: name,
    studentNumber: String(user.studentNumber || ""),
    course: String(user.course || ""),
    school: String(user.school || "St. Dominic College of Asia"),
    dateIssued,
    status: "generated",
    category: inferCertificateCategory(startsAt),
    createdAt: now,
    updatedAt: now,
    generatedBy: ORGANIZER_EMAIL,
    generatedPdfBase64,
    generatedPdfMimeType: "application/pdf",
    generatedPdfFileName: `${resolvedTitle} - ${name}.pdf`,
    qualificationSource: "admin",
    attendanceMinutes: 240,
  };

  const existing = await certificates.findOne({ eventId, email });
  if (existing) {
    await certificates.updateOne({ _id: existing._id }, { $set: certDoc });
    console.log(`Updated certificate ${String(existing._id)} for ${name}`);
    console.log(`Download path: /api/user/certificates/${String(existing._id)}/download`);
  } else {
    const result = await certificates.insertOne(certDoc);
    console.log(`Created certificate ${String(result.insertedId)} for ${name}`);
    console.log(`Download path: /api/user/certificates/${String(result.insertedId)}/download`);
  }

  console.log("\nCertificate ready.");
  console.log(`Event: ${resolvedTitle}`);
  console.log(`Recipient: ${name} (${email})`);
  console.log(`Sign in and open /certificates to view and download.`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await client.close();
}
