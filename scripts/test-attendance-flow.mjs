/**
 * End-to-end attendance API smoke test (no browser).
 * Usage: node scripts/test-attendance-flow.mjs
 */
import { MongoClient } from "mongodb";
import { loadEnv } from "./load-env.mjs";

loadEnv();

const base = process.env.NEXTAUTH_URL || "http://localhost:3000";
const uri = process.env.MONGODB_URI?.trim();
const dbName = process.env.MONGODB_DB_NAME?.trim();

async function login(email, password) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, portal: "user" }),
  });
  const data = await res.json().catch(() => ({}));
  const cookie = res.headers.getSetCookie?.()?.[0] || "";
  return { ok: res.ok, data, cookie };
}

async function adminLogin() {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.DEV_ADMIN_EMAIL || "admin@sdca.edu.ph",
      password: process.env.DEV_ADMIN_PASSWORD || "Admin@123",
      portal: "admin",
    }),
  });
  const data = await res.json().catch(() => ({}));
  const cookie = res.headers.getSetCookie?.()?.[0] || "";
  return { ok: res.ok, data, cookie };
}

function cookieHeader(setCookie) {
  if (!setCookie) return "";
  return setCookie.split(";")[0];
}

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);
const liveEvent = await db.collection("events").findOne({ status: "live" });
if (!liveEvent) {
  console.error("No live event found. Run: node scripts/seed-attendance-demo.mjs");
  process.exit(1);
}
const eventId = String(liveEvent._id);
await client.close();

console.log(`Testing event ${eventId} (${liveEvent.title})`);

const admin = await adminLogin();
if (!admin.ok) {
  console.error("Admin login failed:", admin.data);
  process.exit(1);
}
const adminCookie = cookieHeader(admin.cookie);

const liveRes = await fetch(
  `${base}/api/admin/attendance/live?eventId=${encodeURIComponent(eventId)}`,
  { headers: { Cookie: adminCookie }, cache: "no-store" },
);
const live = await liveRes.json();
console.log("Live feed:", liveRes.status, live.stats || live.error);

const scanIn = await fetch(`${base}/api/admin/attendance/scan`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: adminCookie },
  body: JSON.stringify({ eventId, rfidNumber: "RFID-ARA-001" }),
});
const scanInData = await scanIn.json();
console.log("Scan tap-in:", scanIn.status, scanInData.message || scanInData.error);

const student = await login("ara.marqueses@sdca.edu.ph", "password");
if (!student.ok) {
  console.error("Student login failed:", student.data);
  process.exit(1);
}
const studentCookie = cookieHeader(student.cookie);

const attendRes = await fetch(
  `${base}/api/user/attendance?eventId=${encodeURIComponent(eventId)}`,
  { headers: { Cookie: studentCookie }, cache: "no-store" },
);
const attend = await attendRes.json();
console.log(
  "Student attendance:",
  attendRes.status,
  (attend.attendance || []).map((r) => `${r.action} @ ${r.scannedAt}`),
);

const badScan = await fetch(`${base}/api/admin/attendance/scan`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: adminCookie },
  body: JSON.stringify({ eventId, rfidNumber: "UNKNOWN-TAG-999" }),
});
const badData = await badScan.json();
console.log("Unknown RFID (expect 404):", badScan.status, badData.error);

console.log("\nDone.");
