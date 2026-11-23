import type { Db } from "mongodb";
import { parseDurationToMinutes } from "@/lib/certificates/duration";
import { attendanceCollection } from "@/lib/user-server/activity";

export type CertificateEligibility = {
  eligible: boolean;
  reason: string;
  attendanceMinutes: number;
  requiredMinutes: number;
  tappedOut: boolean;
};

function normalizeEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

export function resolveRequiredAttendanceMinutes(event: {
  attendanceRequiredMinutes?: number | null;
  attendanceRequired?: string | null;
}): number {
  const stored = Number(event.attendanceRequiredMinutes || 0);
  if (Number.isFinite(stored) && stored > 0) return Math.round(stored);
  const parsed = parseDurationToMinutes(String(event.attendanceRequired || ""));
  return parsed && parsed > 0 ? parsed : 0;
}

/**
 * Certificate rules: recipient must have tapped out and stayed at least the
 * event minimum attendance time.
 */
export async function getCertificateEligibility(input: {
  userDb: Db;
  eventId: string;
  email: string;
  requiredMinutes: number;
}): Promise<CertificateEligibility> {
  const email = normalizeEmail(input.email);
  const requiredMinutes = Math.max(0, Math.round(input.requiredMinutes || 0));
  if (!email) {
    return {
      eligible: false,
      reason: "Recipient email is required.",
      attendanceMinutes: 0,
      requiredMinutes,
      tappedOut: false,
    };
  }

  const rows = await attendanceCollection(input.userDb)
    .find({ eventId: input.eventId, email })
    .sort({ createdAt: 1 })
    .limit(40)
    .toArray();

  let bestMinutes = 0;
  let tappedOut = false;
  let qualifiedFlag = false;

  for (const row of rows) {
    const action = String(row.action || "");
    if (action === "out") {
      tappedOut = true;
      const minutes = Math.max(0, Number(row.attendanceMinutes || 0));
      if (minutes > bestMinutes) bestMinutes = minutes;
      if (row.qualifiedForCertificate) qualifiedFlag = true;
    }
  }

  if (!tappedOut) {
    return {
      eligible: false,
      reason: "Participant must tap out before a certificate can be issued.",
      attendanceMinutes: bestMinutes,
      requiredMinutes,
      tappedOut: false,
    };
  }

  if (requiredMinutes <= 0) {
    return {
      eligible: false,
      reason:
        "This event has no minimum attendance time. Set attendance required on the event first.",
      attendanceMinutes: bestMinutes,
      requiredMinutes,
      tappedOut: true,
    };
  }

  const meetsTime = bestMinutes >= requiredMinutes || qualifiedFlag;
  if (!meetsTime) {
    return {
      eligible: false,
      reason: `Participant stayed ${bestMinutes} min but needs at least ${requiredMinutes} min.`,
      attendanceMinutes: bestMinutes,
      requiredMinutes,
      tappedOut: true,
    };
  }

  return {
    eligible: true,
    reason: "Eligible",
    attendanceMinutes: bestMinutes,
    requiredMinutes,
    tappedOut: true,
  };
}
