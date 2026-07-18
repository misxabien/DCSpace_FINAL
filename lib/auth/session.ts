import type { SessionUser } from "@/lib/auth/types";
import { SESSION_COOKIE } from "@/lib/auth/types";

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

export function encodeSession(user: SessionUser): string {
  const json = JSON.stringify(user);
  return toBase64Url(new TextEncoder().encode(json));
}

export function decodeSession(value: string | undefined | null): SessionUser | null {
  if (!value) return null;
  try {
    const json = new TextDecoder().decode(fromBase64Url(value));
    const parsed = JSON.parse(json) as SessionUser;
    if (!parsed?.email || !parsed?.role) return null;
    return {
      email: parsed.email,
      name: parsed.name || "Student",
      role: parsed.role === "organizer" ? "organizer" : "student",
      isOrganizer: parsed.role === "organizer",
    };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(maxAgeSeconds = 60 * 60 * 24 * 7) {
  return {
    name: SESSION_COOKIE,
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: maxAgeSeconds,
  };
}
