import crypto from "crypto";
import { getUserDb } from "@/lib/user-server/get-user-db";
import { hashPassword } from "@/lib/user-server/password";
import { isSchoolEmail } from "@/lib/user-server/auth-helpers";
import {
  AttendanceError,
  findUserByRfid,
  loadLiveEvent,
  profileFromUserDoc,
  recordRfidScan,
} from "@/lib/user-server/record-attendance";

/**
 * Quick Register on First Tap (RFID desk).
 *
 * A student taps a card that is not linked to any account. The volunteer types
 * name, student number and school email; in one step we create the account
 * (or link the card to their existing account), link the card, register them
 * for the event and record the tap-in. Tap-out and certificates then work as
 * usual. The student later signs in with "Forgot password" on their school email.
 */
export type QuickRegisterInput = {
  eventId: string;
  rfidNumber: string;
  firstName: string;
  lastName: string;
  studentNumber: string;
  email: string;
  privacyConsent: boolean;
  actor: { email: string; name: string; role: string };
};

function clean(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function titleCase(value: string) {
  // Volunteers type fast; "juan dela cruz" → "Juan Dela Cruz" for certificates.
  if (value !== value.toLowerCase() && value !== value.toUpperCase()) return value;
  return value
    .toLowerCase()
    .replace(/(^|[\s'-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

export async function quickRegisterAndTapIn(input: QuickRegisterInput) {
  const rfidNumber = clean(input.rfidNumber).replace(/\s+/g, "");
  const firstName = titleCase(clean(input.firstName));
  const lastName = titleCase(clean(input.lastName));
  const studentNumber = clean(input.studentNumber);
  const email = clean(input.email).toLowerCase();

  if (!rfidNumber) throw new AttendanceError("RFID card number is missing. Tap the card again.", 400, "missing_rfid");
  if (!firstName || !lastName) throw new AttendanceError("First name and last name are required.", 400, "invalid_input");
  if (!studentNumber) throw new AttendanceError("Student number is required.", 400, "invalid_input");
  if (!email || !isSchoolEmail(email)) {
    throw new AttendanceError("Use the student's school email address.", 400, "invalid_email");
  }
  if (input.privacyConsent !== true) {
    throw new AttendanceError(
      "The student must agree to the Data Privacy Notice before registering.",
      400,
      "privacy_consent_required",
    );
  }

  // Fail before creating anything if attendance is not open for this event.
  await loadLiveEvent(input.eventId);

  // The card may have been linked a moment ago (e.g. double submit).
  const cardOwner = await findUserByRfid(rfidNumber);
  if (cardOwner) {
    const owner = profileFromUserDoc(cardOwner as Record<string, unknown>);
    if (owner.email !== email) {
      throw new AttendanceError(
        `This card is already linked to ${owner.name || owner.email}. Tap it again to record attendance.`,
        409,
        "rfid_already_linked",
      );
    }
  }

  const db = await getUserDb();
  const users = db.collection("users");
  const now = new Date().toISOString();

  const byEmail = await users.findOne({
    email: { $regex: `^${escapeRegex(email)}$`, $options: "i" },
  });
  const byStudentNumber = await users.findOne({ studentNumber });

  if (byStudentNumber && (!byEmail || String(byStudentNumber._id) !== String(byEmail._id))) {
    throw new AttendanceError(
      `Student number ${studentNumber} already belongs to another account (${String(byStudentNumber.email || "")}). Check the student number or email.`,
      409,
      "student_number_taken",
    );
  }

  let created = false;
  if (byEmail) {
    // Existing account without this card: link the card instead of a new account.
    const existingCard = clean(byEmail.rfidNumber);
    if (existingCard && !cardOwner) {
      throw new AttendanceError(
        `${email} already has a different card linked (RFID ${existingCard}). Ask an admin to change the card on their account.`,
        409,
        "account_has_other_card",
      );
    }
    if (!cardOwner) {
      await users.updateOne(
        { _id: byEmail._id },
        {
          $set: {
            rfidNumber,
            rfidLinkedAt: now,
            rfidLinkedBy: input.actor.email,
            updatedAt: now,
          },
        },
      );
    }
  } else {
    await users.insertOne({
      firstName,
      lastName,
      studentNumber,
      email,
      rfidNumber,
      organizationPart: "",
      organizationRole: "",
      course: "",
      school: "",
      // Nobody knows this password; the student sets one via "Forgot password".
      passwordHash: hashPassword(crypto.randomBytes(24).toString("hex")),
      role: "student",
      dataPrivacyAcceptedAt: now,
      dataPrivacyAcceptedVia: "rfid-desk",
      quickRegisteredAt: now,
      quickRegisteredBy: input.actor.email,
      quickRegisteredEventId: input.eventId,
      rfidLinkedAt: now,
      rfidLinkedBy: input.actor.email,
      createdAt: now,
    });
    created = true;

    void import("@/lib/user-server/activity").then(({ logUserActivity }) =>
      logUserActivity({
        type: "user_registered",
        actorEmail: email,
        actorName: `${firstName} ${lastName}`,
        actorRole: "student",
        meta: { studentNumber, source: "rfid-desk", registeredBy: input.actor.email },
      }),
    );
  }

  // Same path as a normal desk tap: joins the event, then records the tap-in.
  const scan = await recordRfidScan({
    eventId: input.eventId,
    rfidNumber,
    action: "in",
    actor: input.actor,
  });

  return { created, scan };
}
