const DEFAULT_PURPOSE = "registration";
export const PURPOSE = DEFAULT_PURPOSE;
export const RESET_PURPOSE = "password-reset";
export const CODE_TTL_MS = 15 * 60 * 1000;
export const MAX_ATTEMPTS = 5;

type MemoryRecord = {
  email: string;
  purpose: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  updatedAt: Date;
};

const globalStore = globalThis as typeof globalThis & {
  __dcEmailVerifications?: Map<string, MemoryRecord>;
};

if (!globalStore.__dcEmailVerifications) {
  globalStore.__dcEmailVerifications = new Map();
}

function normalizeEmail(email: string) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function memoryKey(email: string, purpose = DEFAULT_PURPOSE) {
  return `${purpose}:${normalizeEmail(email)}`;
}

export function shouldUseMemoryVerificationStore() {
  return process.env.VERIFICATION_USE_MEMORY === "true";
}

export function saveMemoryVerification({
  email,
  codeHash,
  expiresAt,
  purpose = DEFAULT_PURPOSE,
}: {
  email: string;
  codeHash: string;
  expiresAt: Date;
  purpose?: string;
}) {
  const normalizedEmail = normalizeEmail(email);
  globalStore.__dcEmailVerifications!.set(memoryKey(normalizedEmail, purpose), {
    email: normalizedEmail,
    purpose,
    codeHash,
    expiresAt,
    attempts: 0,
    updatedAt: new Date(),
  });
}

export function readMemoryVerification(email: string, purpose = DEFAULT_PURPOSE) {
  return globalStore.__dcEmailVerifications!.get(memoryKey(email, purpose)) || null;
}

export function deleteMemoryVerification(email: string, purpose = DEFAULT_PURPOSE) {
  globalStore.__dcEmailVerifications!.delete(memoryKey(email, purpose));
}

export function incrementMemoryAttempts(record: MemoryRecord) {
  record.attempts = (record.attempts || 0) + 1;
  if (record.attempts >= MAX_ATTEMPTS) {
    deleteMemoryVerification(record.email, record.purpose);
  }
}

export function isMemoryVerificationExpired(record: MemoryRecord) {
  return record.expiresAt && new Date(record.expiresAt).getTime() < Date.now();
}
