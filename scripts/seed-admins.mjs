/**
 * Upsert demo + DEV_ADMIN accounts into MongoDB so admin/user portals share identity.
 *
 * Usage: npm run seed:admins
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import crypto from "node:crypto";
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

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

loadEnv();

const uri = process.env.MONGODB_URI?.trim();
const dbName = process.env.MONGODB_DB_NAME?.trim();
if (!uri || !dbName) {
  console.error("Missing MONGODB_URI or MONGODB_DB_NAME in .env");
  process.exit(1);
}

const SEEDS = [
  {
    email: "admin@sdca.edu.ph",
    password: "password",
    firstName: "Casey",
    lastName: "Admin",
    studentNumber: "ADMIN-001",
    role: "admin",
  },
  {
    email: "superadmin@sdca.edu.ph",
    password: "password",
    firstName: "Riley",
    lastName: "Super",
    studentNumber: "SADMIN-001",
    role: "super-admin",
  },
  {
    email: "student@sdca.edu.ph",
    password: "password",
    firstName: "Sam",
    lastName: "Student",
    studentNumber: "STU-1001",
    role: "student",
  },
  {
    email: "organizer@sdca.edu.ph",
    password: "password",
    firstName: "Alex",
    lastName: "Organizer",
    studentNumber: "ORG-1001",
    role: "faculty",
  },
];

const envEmail = process.env.DEV_ADMIN_EMAIL?.trim().toLowerCase();
const envPassword = process.env.DEV_ADMIN_PASSWORD?.trim();
const envName = process.env.DEV_ADMIN_NAME?.trim() || "Dev Admin";
if (envEmail && envPassword) {
  const [firstName, ...rest] = envName.split(/\s+/);
  SEEDS.push({
    email: envEmail,
    password: envPassword,
    firstName: firstName || "Dev",
    lastName: rest.join(" ") || "Admin",
    studentNumber: "DEV-ADMIN",
    role: "super-admin",
  });
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

const client = await connectWithFallback(uri);

try {
  const users = client.db(dbName).collection("users");

  for (const seed of SEEDS) {
    const email = seed.email.toLowerCase();
    const existing = await users.findOne({ email });
    const doc = {
      firstName: seed.firstName,
      lastName: seed.lastName,
      studentNumber: seed.studentNumber,
      email,
      passwordHash: hashPassword(seed.password),
      role: seed.role,
      organizationPart: seed.role === "faculty" ? "DC Space" : "",
      organizationRole: seed.role === "faculty" ? "organizer" : "",
      course: "",
      school: "St. Dominic College of Asia",
      updatedAt: new Date().toISOString(),
    };

    if (existing) {
      await users.updateOne({ email }, { $set: doc });
      console.log(`Updated ${email} (${seed.role})`);
    } else {
      await users.insertOne({
        ...doc,
        createdAt: new Date().toISOString(),
        dataPrivacyAcceptedAt: new Date().toISOString(),
      });
      console.log(`Created ${email} (${seed.role})`);
    }
  }

  console.log("Seed complete. Admin and user portals share the users collection.");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await client.close();
}
