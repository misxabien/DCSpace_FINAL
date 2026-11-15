import { createHmac, timingSafeEqual } from "node:crypto";
import type { SessionUser } from "@/lib/auth/types";
import {
  SESSION_COOKIE,
  isAdminRole,
  normalizeSessionRole,
} from "@/lib/auth/types";

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  const base64 =
    typeof btoa === "function"
      ? btoa(binary)
      : Buffer.from(bytes).toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const base64 = padded + pad;
  const binary =
    typeof atob === "function"
      ? atob(base64)
      : Buffer.from(base64, "base64").toString("binary");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function sessionSecret(): string {
  const secret = (process.env.SESSION_SECRET || process.env.JWT_SECRET || "").trim();
  if (!secret) {
    throw new Error("Missing SESSION_SECRET (or JWT_SECRET) — session cookies cannot be signed.");
  }
  return secret;
}

function sign(payload: string): string {
  return toBase64Url(createHmac("sha256", sessionSecret()).update(payload).digest());
}

function signatureMatches(payload: string, signature: string): boolean {
  const expected = Buffer.from(sign(payload));
  const provided = Buffer.from(signature);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

/**
 * Cookie format: base64url(JSON) + "." + base64url(HMAC-SHA256).
 * The signature stops anyone from editing the cookie to impersonate
 * another user or an admin; `exp` bounds how long a cookie stays valid.
 */
export function encodeSession(user: SessionUser): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify({ ...user, exp })));
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(value: string | undefined | null): SessionUser | null {
  if (!value) return null;
  try {
    const dot = value.indexOf(".");
    if (dot <= 0) return null;
    const payload = value.slice(0, dot);
    const signature = value.slice(dot + 1);
    if (!signature || !signatureMatches(payload, signature)) return null;

    const json = new TextDecoder().decode(fromBase64Url(payload));
    const parsed = JSON.parse(json) as Partial<SessionUser> & { role?: string; exp?: number };
    if (!parsed?.email || !parsed?.role) return null;
    if (typeof parsed.exp !== "number" || parsed.exp * 1000 < Date.now()) return null;

    const role = normalizeSessionRole(parsed.role);
    const isAdmin = isAdminRole(role);
    const isOrganizer =
      Boolean(parsed.isOrganizer) ||
      role === "organizer" ||
      role === "faculty";

    return {
      email: parsed.email,
      name: parsed.name || (isAdmin ? "Admin" : "Student"),
      role,
      isOrganizer: isOrganizer && !isAdmin,
      isAdmin,
    };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(maxAgeSeconds = SESSION_MAX_AGE_SECONDS) {
  return {
    name: SESSION_COOKIE,
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: maxAgeSeconds,
  };
}
