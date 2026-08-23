import crypto from "crypto";
import type { Db } from "mongodb";
import { getUserDb } from "@/lib/user-server/get-user-db";
import {
  emailVerificationsCollection,
  usersCollection,
} from "@/lib/db/user-collections";
import { hashPassword, verifyPassword } from "@/lib/user-server/password";
import { sendVerificationEmail } from "@/lib/user-server/mailer";
import {
  CODE_TTL_MS,
  MAX_ATTEMPTS,
  PURPOSE,
  RESET_PURPOSE,
  deleteMemoryVerification,
  incrementMemoryAttempts,
  isMemoryVerificationExpired,
  readMemoryVerification,
  saveMemoryVerification,
  shouldUseMemoryVerificationStore,
} from "@/lib/user-server/verification-store";
import {
  MONGO_QUICK_TIMEOUT_MS,
  withTimeout,
} from "@/lib/user-server/with-timeout";

function normalizeEmail(email: string) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function generateVerificationCode() {
  return String(crypto.randomInt(100000, 1000000));
}

async function isDatabaseAvailable() {
  try {
    await withTimeout(getUserDb(), MONGO_QUICK_TIMEOUT_MS, "MongoDB");
    return true;
  } catch {
    return false;
  }
}

async function getVerificationsCollection(db: Awaited<ReturnType<typeof getUserDb>>) {
  const collection = emailVerificationsCollection(db);
  await collection.createIndex({ email: 1, purpose: 1 }, { unique: true });
  await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  return collection;
}

async function clearDatabaseVerification(normalizedEmail: string) {
  try {
    const db = await withTimeout(getUserDb(), MONGO_QUICK_TIMEOUT_MS, "MongoDB");
    const verifications = await getVerificationsCollection(db);
    await verifications.deleteOne({ email: normalizedEmail, purpose: PURPOSE });
  } catch {
    /* ignore — memory already accepted the code */
  }
}

function memoryStatus(normalizedEmail: string, trimmedCode: string) {
  const record = readMemoryVerification(normalizedEmail);
  if (!record) return { kind: "missing" as const };
  if (isMemoryVerificationExpired(record)) {
    deleteMemoryVerification(normalizedEmail);
    return { kind: "expired" as const };
  }
  if ((record.attempts || 0) >= MAX_ATTEMPTS) {
    deleteMemoryVerification(normalizedEmail);
    return { kind: "locked" as const };
  }
  if (!verifyPassword(trimmedCode, record.codeHash)) {
    return { kind: "mismatch" as const, record };
  }
  return { kind: "match" as const, record };
}

export async function issueRegistrationVerificationCode(
  email: string,
  options?: { db?: Db | null },
) {
  const normalizedEmail = normalizeEmail(email);
  const code = generateVerificationCode();
  const codeHash = hashPassword(code);
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  let dbAvailable = false;
  let db: Db | null = options?.db ?? null;

  if (options?.db !== undefined) {
    dbAvailable = options.db !== null;
  } else {
    dbAvailable = await isDatabaseAvailable();
    if (dbAvailable) {
      db = await getUserDb();
    }
  }

  // Always keep a memory copy so verify still works if Mongo is down or indexes hiccup.
  // Final account creation still requires MongoDB.
  saveMemoryVerification({ email: normalizedEmail, codeHash, expiresAt });

  const forceMemory =
    shouldUseMemoryVerificationStore() ||
    process.env.FORCE_VERIFICATION_MEMORY === "true";

  if (dbAvailable && db && !forceMemory) {
    try {
      const verifications = await getVerificationsCollection(db);
      const now = new Date();
      await verifications.updateOne(
        { email: normalizedEmail, purpose: PURPOSE },
        {
          $set: {
            email: normalizedEmail,
            purpose: PURPOSE,
            codeHash,
            expiresAt,
            updatedAt: now,
            attempts: 0,
          },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true },
      );
    } catch (error) {
      console.warn(
        "[DC Space] Could not persist verification code to Mongo — using memory store:",
        error instanceof Error ? error.message : error,
      );
    }
  } else if (!dbAvailable) {
    console.warn(
      "[DC Space] Mongo unavailable — verification code stored in memory and sent by email.",
    );
  }

  const sendResult = await sendVerificationEmail({ email: normalizedEmail, code });

  return {
    email: normalizedEmail,
    expiresAt: expiresAt.toISOString(),
    delivered: true,
    devMode: sendResult.devMode,
    code: sendResult.devMode ? code : undefined,
  };
}

async function verifyFromMemory(normalizedEmail: string, trimmedCode: string) {
  const status = memoryStatus(normalizedEmail, trimmedCode);
  if (status.kind === "missing") {
    return {
      ok: false as const,
      error: "No verification code found. Go back and tap Verify Account to send a new code.",
    };
  }
  if (status.kind === "expired") {
    return { ok: false as const, error: "Verification code has expired. Please request a new code." };
  }
  if (status.kind === "locked") {
    return { ok: false as const, error: "Too many failed attempts. Please request a new code." };
  }
  if (status.kind === "mismatch") {
    incrementMemoryAttempts(status.record);
    return {
      ok: false as const,
      error:
        "Invalid or outdated verification code. Use the newest code from your email (request a new one if unsure).",
    };
  }
  deleteMemoryVerification(normalizedEmail);
  return { ok: true as const };
}

async function verifyFromDatabase(normalizedEmail: string, trimmedCode: string) {
  const db = await getUserDb();
  const verifications = await getVerificationsCollection(db);
  const record = await verifications.findOne({ email: normalizedEmail, purpose: PURPOSE });

  if (!record) {
    return null;
  }
  if (record.expiresAt && new Date(record.expiresAt).getTime() < Date.now()) {
    await verifications.deleteOne({ _id: record._id });
    return { ok: false as const, error: "Verification code has expired. Please request a new code." };
  }
  if ((record.attempts || 0) >= MAX_ATTEMPTS) {
    await verifications.deleteOne({ _id: record._id });
    return { ok: false as const, error: "Too many failed attempts. Please request a new code." };
  }
  if (!verifyPassword(trimmedCode, String(record.codeHash || ""))) {
    await verifications.updateOne({ _id: record._id }, { $inc: { attempts: 1 } });
    return {
      ok: false as const,
      error:
        "Invalid or outdated verification code. Use the newest code from your email (request a new one if unsure).",
    };
  }

  await verifications.deleteOne({ _id: record._id });
  return { ok: true as const };
}

export async function verifyRegistrationCode(email: string, code: string) {
  const normalizedEmail = normalizeEmail(email);
  const trimmedCode = String(code || "")
    .trim()
    .replace(/\s/g, "");

  if (!/^\d{6}$/.test(trimmedCode)) {
    return { ok: false as const, error: "Verification code must be a 6-digit number." };
  }

  // Memory holds the most recently emailed code (even when Mongo is down).
  // Check it first so a stale Mongo row cannot reject a valid new code.
  const memory = memoryStatus(normalizedEmail, trimmedCode);
  if (memory.kind === "match") {
    deleteMemoryVerification(normalizedEmail);
    void clearDatabaseVerification(normalizedEmail);
    return { ok: true as const };
  }

  if (await isDatabaseAvailable()) {
    const dbResult = await verifyFromDatabase(normalizedEmail, trimmedCode);
    if (dbResult?.ok) {
      deleteMemoryVerification(normalizedEmail);
      return { ok: true as const };
    }
    // Stale/wrong Mongo record — still allow a matching memory code to win above.
    // If memory has a mismatch/expired, prefer that message (latest issue).
    if (memory.kind === "mismatch" || memory.kind === "expired" || memory.kind === "locked") {
      return verifyFromMemory(normalizedEmail, trimmedCode);
    }
    if (dbResult) {
      return dbResult.ok ? { ok: true as const } : dbResult;
    }
  }

  if (memory.kind !== "missing") {
    return verifyFromMemory(normalizedEmail, trimmedCode);
  }

  return {
    ok: false as const,
    error: "No verification code found. Go back and tap Verify Account to send a new code.",
  };
}

/** Non-consuming check used on the /verify screen before continuing. */
export async function checkRegistrationCode(email: string, code: string) {
  const normalizedEmail = normalizeEmail(email);
  const trimmedCode = String(code || "")
    .trim()
    .replace(/\s/g, "");

  if (!/^\d{6}$/.test(trimmedCode)) {
    return { ok: false as const, error: "Verification code must be a 6-digit number." };
  }

  const memory = memoryStatus(normalizedEmail, trimmedCode);
  if (memory.kind === "match") {
    return { ok: true as const };
  }
  if (memory.kind === "mismatch") {
    return {
      ok: false as const,
      error:
        "Invalid or outdated verification code. Use the newest code from your email (request a new one if unsure).",
    };
  }
  if (memory.kind === "expired") {
    return { ok: false as const, error: "Verification code has expired. Please request a new code." };
  }
  if (memory.kind === "locked") {
    return { ok: false as const, error: "Too many failed attempts. Please request a new code." };
  }

  if (await isDatabaseAvailable()) {
    try {
      const db = await getUserDb();
      const verifications = await getVerificationsCollection(db);
      const record = await verifications.findOne({ email: normalizedEmail, purpose: PURPOSE });
      if (!record) {
        return {
          ok: false as const,
          error: "No verification code found. Go back and tap Verify Account to send a new code.",
        };
      }
      if (record.expiresAt && new Date(record.expiresAt).getTime() < Date.now()) {
        return { ok: false as const, error: "Verification code has expired. Please request a new code." };
      }
      if (!verifyPassword(trimmedCode, String(record.codeHash || ""))) {
        return {
          ok: false as const,
          error:
            "Invalid or outdated verification code. Use the newest code from your email (request a new one if unsure).",
        };
      }
      return { ok: true as const };
    } catch {
      /* fall through */
    }
  }

  return {
    ok: false as const,
    error: "No verification code found. Go back and tap Verify Account to send a new code.",
  };
}

export async function issuePasswordResetCode(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const db = await getUserDb();
  const user = await usersCollection(db).findOne({ email: normalizedEmail });
  if (!user) {
    return {
      email: normalizedEmail,
      expiresAt: new Date(Date.now() + CODE_TTL_MS).toISOString(),
      delivered: true,
      hidden: true,
    };
  }

  const code = generateVerificationCode();
  const codeHash = hashPassword(code);
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  saveMemoryVerification({
    email: normalizedEmail,
    codeHash,
    expiresAt,
    purpose: RESET_PURPOSE,
  });

  const verifications = await getVerificationsCollection(db);
  const now = new Date();
  await verifications.updateOne(
    { email: normalizedEmail, purpose: RESET_PURPOSE },
    {
      $set: {
        email: normalizedEmail,
        purpose: RESET_PURPOSE,
        codeHash,
        expiresAt,
        updatedAt: now,
        attempts: 0,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );

  const sendResult = await sendVerificationEmail({ email: normalizedEmail, code });
  return {
    email: normalizedEmail,
    expiresAt: expiresAt.toISOString(),
    delivered: true,
    devMode: sendResult.devMode,
    code: sendResult.devMode ? code : undefined,
  };
}

export async function verifyPasswordResetCode(email: string, code: string) {
  const normalizedEmail = normalizeEmail(email);
  const trimmedCode = String(code || "")
    .trim()
    .replace(/\s/g, "");
  if (!/^\d{6}$/.test(trimmedCode)) {
    return { ok: false as const, error: "Verification code must be a 6-digit number." };
  }

  const db = await getUserDb();
  const verifications = await getVerificationsCollection(db);
  const record = await verifications.findOne({
    email: normalizedEmail,
    purpose: RESET_PURPOSE,
  });
  if (record) {
    if (record.expiresAt && new Date(record.expiresAt).getTime() < Date.now()) {
      return { ok: false as const, error: "Verification code has expired. Please request a new code." };
    }
    if (!verifyPassword(trimmedCode, String(record.codeHash || ""))) {
      await verifications.updateOne({ _id: record._id }, { $inc: { attempts: 1 } });
      return { ok: false as const, error: "Invalid verification code." };
    }
    return { ok: true as const };
  }

  const memory = readMemoryVerification(normalizedEmail, RESET_PURPOSE);
  if (!memory) {
    return { ok: false as const, error: "No verification code found. Please request a new code." };
  }
  if (isMemoryVerificationExpired(memory)) {
    deleteMemoryVerification(normalizedEmail, RESET_PURPOSE);
    return { ok: false as const, error: "Verification code has expired. Please request a new code." };
  }
  if (!verifyPassword(trimmedCode, memory.codeHash)) {
    incrementMemoryAttempts(memory);
    return { ok: false as const, error: "Invalid verification code." };
  }
  return { ok: true as const };
}

export async function consumePasswordResetCode(email: string, code: string) {
  const verified = await verifyPasswordResetCode(email, code);
  if (!verified.ok) return verified;
  const normalizedEmail = normalizeEmail(email);
  try {
    const db = await getUserDb();
    const verifications = await getVerificationsCollection(db);
    await verifications.deleteOne({ email: normalizedEmail, purpose: RESET_PURPOSE });
  } catch {
    /* ignore */
  }
  deleteMemoryVerification(normalizedEmail, RESET_PURPOSE);
  return { ok: true as const };
}
