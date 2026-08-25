import crypto from "crypto";
import type { Db } from "mongodb";
import { getUserDb } from "@/lib/user-server/get-user-db";
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

function normalizeCode(code: string) {
  return String(code || "")
    .trim()
    .replace(/\s/g, "");
}

function generateVerificationCode() {
  return String(crypto.randomInt(100000, 1000000));
}

async function isDatabaseAvailable() {
  try {
    await withTimeout(getUserDb(), MONGO_QUICK_TIMEOUT_MS, "MongoDB connect");
    return true;
  } catch {
    return false;
  }
}

async function getVerificationsCollection(db: Db) {
  const collection = db.collection("email_verifications");
  try {
    await collection.createIndex({ email: 1, purpose: 1 }, { unique: true });
  } catch {
    /* index may already exist */
  }
  try {
    await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  } catch {
    /* index may already exist */
  }
  return collection;
}

async function persistVerificationRecord({
  db,
  email,
  purpose,
  codeHash,
  expiresAt,
}: {
  db: Db | null;
  email: string;
  purpose: string;
  codeHash: string;
  expiresAt: Date;
}) {
  // Always keep a process-local copy so verify still works if Mongo hiccups.
  saveMemoryVerification({ email, codeHash, expiresAt, purpose });

  if (!db || shouldUseMemoryVerificationStore()) {
    return;
  }

  try {
    const verifications = await getVerificationsCollection(db);
    const now = new Date();
    await verifications.updateOne(
      { email, purpose },
      {
        $set: {
          email,
          purpose,
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
      "[DC Space] Could not persist verification code to Mongo — using in-memory copy.",
      error instanceof Error ? error.message : error,
    );
  }
}

type CheckResult =
  | { ok: true }
  | { ok: false; error: string };

function checkMemoryRecord(
  email: string,
  purpose: string,
  trimmedCode: string,
  options?: { bumpAttempts?: boolean },
): CheckResult | null {
  const record = readMemoryVerification(email, purpose);
  if (!record) return null;
  if (isMemoryVerificationExpired(record)) {
    deleteMemoryVerification(email, purpose);
    return { ok: false, error: "Verification code has expired. Please request a new code." };
  }
  if ((record.attempts || 0) >= MAX_ATTEMPTS) {
    deleteMemoryVerification(email, purpose);
    return { ok: false, error: "Too many failed attempts. Please request a new code." };
  }
  if (!verifyPassword(trimmedCode, record.codeHash)) {
    if (options?.bumpAttempts) {
      incrementMemoryAttempts(record);
    }
    return {
      ok: false,
      error:
        "Invalid or outdated verification code. Use the newest code from your email (request a new one if unsure).",
    };
  }
  return { ok: true };
}

async function checkDatabaseRecord(
  email: string,
  purpose: string,
  trimmedCode: string,
  options?: { bumpAttempts?: boolean },
): Promise<CheckResult | null> {
  if (!(await isDatabaseAvailable())) return null;
  try {
    const db = await getUserDb();
    const verifications = await getVerificationsCollection(db);
    const record = await verifications.findOne({ email, purpose });
    if (!record) return null;

    if (record.expiresAt && new Date(record.expiresAt).getTime() < Date.now()) {
      await verifications.deleteOne({ _id: record._id });
      return { ok: false, error: "Verification code has expired. Please request a new code." };
    }
    if (Number(record.attempts || 0) >= MAX_ATTEMPTS) {
      await verifications.deleteOne({ _id: record._id });
      return { ok: false, error: "Too many failed attempts. Please request a new code." };
    }
    if (!verifyPassword(trimmedCode, String(record.codeHash || ""))) {
      if (options?.bumpAttempts !== false) {
        await verifications.updateOne({ _id: record._id }, { $inc: { attempts: 1 } });
      }
      return {
        ok: false,
        error:
          "Invalid or outdated verification code. Use the newest code from your email (request a new one if unsure).",
      };
    }
    return { ok: true };
  } catch {
    return null;
  }
}

/** Peek-check (does not delete). Used on verify screens before continuing. */
export async function checkRegistrationCode(email: string, code: string): Promise<CheckResult> {
  const normalizedEmail = normalizeEmail(email);
  const trimmedCode = normalizeCode(code);

  if (!/^\d{6}$/.test(trimmedCode)) {
    return { ok: false, error: "Verification code must be a 6-digit number." };
  }

  // Prefer Mongo when available, then fall back to in-memory (same process).
  const dbResult = await checkDatabaseRecord(normalizedEmail, PURPOSE, trimmedCode, {
    bumpAttempts: false,
  });
  if (dbResult) return dbResult;

  const memoryResult = checkMemoryRecord(normalizedEmail, PURPOSE, trimmedCode, {
    bumpAttempts: false,
  });
  if (memoryResult) return memoryResult;

  return {
    ok: false,
    error: "No verification code found. Go back and tap Verify Account to send a new code.",
  };
}

export async function consumeRegistrationCode(email: string, code: string): Promise<CheckResult> {
  const checked = await checkRegistrationCode(email, code);
  if (!checked.ok) return checked;

  const normalizedEmail = normalizeEmail(email);
  try {
    if (await isDatabaseAvailable()) {
      const db = await getUserDb();
      const verifications = await getVerificationsCollection(db);
      await verifications.deleteOne({ email: normalizedEmail, purpose: PURPOSE });
    }
  } catch {
    /* ignore */
  }
  deleteMemoryVerification(normalizedEmail, PURPOSE);
  return { ok: true };
}

/** @deprecated Prefer check + consumeRegistrationCode after account insert. */
export async function verifyRegistrationCode(email: string, code: string) {
  return consumeRegistrationCode(email, code);
}

export async function issueRegistrationVerificationCode(
  email: string,
  options?: { db?: Db | null },
) {
  const normalizedEmail = normalizeEmail(email);
  const code = generateVerificationCode();
  const codeHash = hashPassword(code);
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  let db: Db | null = options?.db ?? null;
  if (options?.db === undefined) {
    try {
      db = (await isDatabaseAvailable()) ? await getUserDb() : null;
    } catch {
      db = null;
    }
  }

  if (!db) {
    console.warn(
      "[DC Space] MongoDB unavailable — using in-memory verification codes.",
    );
  }

  await persistVerificationRecord({
    db,
    email: normalizedEmail,
    purpose: PURPOSE,
    codeHash,
    expiresAt,
  });

  const sendResult = await sendVerificationEmail({
    email: normalizedEmail,
    code,
    purpose: "registration",
  });

  return {
    email: normalizedEmail,
    expiresAt: expiresAt.toISOString(),
    delivered: true,
    devMode: sendResult.devMode,
    code: sendResult.devMode ? code : undefined,
  };
}

export async function issuePasswordResetCode(email: string) {
  const normalizedEmail = normalizeEmail(email);
  let db: Db | null = null;
  try {
    db = await getUserDb();
  } catch {
    db = null;
  }

  if (db) {
    try {
      const user = await db.collection("users").findOne({ email: normalizedEmail });
      if (!user) {
        return {
          email: normalizedEmail,
          expiresAt: new Date(Date.now() + CODE_TTL_MS).toISOString(),
          delivered: true,
          hidden: true,
        };
      }
    } catch {
      /* If lookup fails, still issue a code so real users are not blocked. */
    }
  }

  const code = generateVerificationCode();
  const codeHash = hashPassword(code);
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  await persistVerificationRecord({
    db,
    email: normalizedEmail,
    purpose: RESET_PURPOSE,
    codeHash,
    expiresAt,
  });

  const sendResult = await sendVerificationEmail({
    email: normalizedEmail,
    code,
    purpose: "password-reset",
  });

  return {
    email: normalizedEmail,
    expiresAt: expiresAt.toISOString(),
    delivered: true,
    hidden: false,
    devMode: sendResult.devMode,
    code: sendResult.devMode ? code : undefined,
  };
}

export async function verifyPasswordResetCode(email: string, code: string): Promise<CheckResult> {
  const normalizedEmail = normalizeEmail(email);
  const trimmedCode = normalizeCode(code);
  if (!/^\d{6}$/.test(trimmedCode)) {
    return { ok: false, error: "Verification code must be a 6-digit number." };
  }

  const dbResult = await checkDatabaseRecord(normalizedEmail, RESET_PURPOSE, trimmedCode, {
    bumpAttempts: true,
  });
  if (dbResult) return dbResult;

  const memoryResult = checkMemoryRecord(normalizedEmail, RESET_PURPOSE, trimmedCode, {
    bumpAttempts: true,
  });
  if (memoryResult) return memoryResult;

  return { ok: false, error: "No verification code found. Please request a new code." };
}

export async function consumePasswordResetCode(email: string, code: string): Promise<CheckResult> {
  const verified = await verifyPasswordResetCode(email, code);
  if (!verified.ok) return verified;
  const normalizedEmail = normalizeEmail(email);
  try {
    if (await isDatabaseAvailable()) {
      const db = await getUserDb();
      const verifications = await getVerificationsCollection(db);
      await verifications.deleteOne({ email: normalizedEmail, purpose: RESET_PURPOSE });
    }
  } catch {
    /* ignore */
  }
  deleteMemoryVerification(normalizedEmail, RESET_PURPOSE);
  return { ok: true };
}
