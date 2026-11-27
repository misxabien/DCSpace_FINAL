import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import {
  attendanceCollection,
  certificatesCollection,
} from "@/lib/user-server/activity";
import { getAdminDb, getUserDb } from "@/lib/db/get-db";
import { requireSessionActor } from "@/lib/user-server/session-auth";
import { requireAdminAuth } from "@/lib/admin-server/require-admin-auth";
import { requireAdminPermission } from "@/lib/admin-server/admin-permissions";
import { eventsCollection } from "@/lib/events/types";
import {
  createCertificateDoc,
  certificateDownloadUrl,
} from "@/lib/user-server/certificates";
import {
  getCertificateEligibility,
  resolveRequiredAttendanceMinutes,
} from "@/lib/user-server/certificate-eligibility";

export async function GET(request: Request) {
  const admin = await requireAdminAuth(request);
  const isAdmin = !("error" in admin);
  if (!("error" in admin)) {
    const viewDenied = await requireAdminPermission(admin, "view-certificates");
    if (viewDenied) {
      return NextResponse.json({ error: viewDenied.error }, { status: viewDenied.status });
    }
  }
  const actor = isAdmin ? null : await requireSessionActor(request);
  if (!isAdmin) {
    if (!actor || "error" in actor) {
      return NextResponse.json(
        { error: (actor && "error" in actor && actor.error) || "Authentication required." },
        { status: (actor && "error" in actor && actor.status) || 401 },
      );
    }
  }

  try {
    const db = await getUserDb();
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get("eventId");
    const email = searchParams.get("email");
    const filter: Record<string, unknown> = {};
    if (eventId) filter.eventId = eventId;
    // Students only ever see their own certificates.
    if (!isAdmin && actor && !("error" in actor)) {
      filter.email = actor.email.trim().toLowerCase();
    } else if (isAdmin && email) {
      filter.email = email.trim().toLowerCase();
    }

    // Never materialize generatedPdfBase64 in list queries — each PDF is
    // ~200KB+ and loading them made /api/user/certificates take 10–16s.
    const docs = await certificatesCollection(db)
      .find(filter, {
        projection: {
          name: 1,
          eventId: 1,
          eventName: 1,
          eventTitle: 1,
          email: 1,
          userName: 1,
          studentNumber: 1,
          course: 1,
          school: 1,
          dateIssued: 1,
          createdAt: 1,
          status: 1,
          category: 1,
          distributedAt: 1,
          qualificationSource: 1,
        },
      })
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();

    return NextResponse.json({
      certificates: docs.map((doc) => ({
        id: String(doc._id),
        name: String(doc.name || "Certificate of Participation"),
        eventId: String(doc.eventId || ""),
        eventName: String(doc.eventName || doc.eventTitle || ""),
        email: String(doc.email || ""),
        userName: String(doc.userName || ""),
        studentNumber: String(doc.studentNumber || ""),
        course: String(doc.course || ""),
        school: String(doc.school || ""),
        dateIssued: String(doc.dateIssued || doc.createdAt || ""),
        status: String(doc.status || "generated"),
        category: String(doc.category || "cert-month"),
        distributedAt: String(doc.distributedAt || ""),
        qualificationSource: String(doc.qualificationSource || ""),
        downloadUrl: certificateDownloadUrl(String(doc._id)),
      })),
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to load certificates.", details },
      { status: 500 },
    );
  }
}

type IssueTarget = {
  email: string;
  userName: string;
  studentNumber?: string;
  course?: string;
  school?: string;
};

/** Admin issues certificates for an event template — one user or selected/all attendees. */
export async function POST(request: Request) {
  const auth = await requireAdminAuth(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const permissionDenied = await requireAdminPermission(auth, "generate-certificates");
  if (permissionDenied) {
    return NextResponse.json({ error: permissionDenied.error }, { status: permissionDenied.status });
  }

  let body: {
    eventId?: string;
    email?: string;
    name?: string;
    emails?: string[];
    regenerate?: boolean;
    /**
     * Admin exception: issue even when the participant didn't tap out / meet
     * the minimum time (e.g. they attended but never tapped out). The admin
     * confirms this in the UI; the certificate is marked "admin-override".
     */
    override?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const eventId = String(body.eventId || "").trim();
  if (!eventId) {
    return NextResponse.json({ error: "eventId is required." }, { status: 400 });
  }
  if (!ObjectId.isValid(eventId)) {
    return NextResponse.json({ error: "Invalid event id." }, { status: 400 });
  }

  try {
    const userDb = await getUserDb();
    const adminDb = await getAdminDb();
    const event = await eventsCollection(adminDb).findOne({ _id: new ObjectId(eventId) });
    if (!event) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }
    if (!event.certificateTemplateBase64) {
      return NextResponse.json(
        {
          error:
            "This event has no certificate template. Upload an e-certificate template on the event first.",
        },
        { status: 400 },
      );
    }

    const regenerate = Boolean(body.regenerate);
    const override = body.override === true;
    const requiredMinutes = resolveRequiredAttendanceMinutes(event);
    const requestedEmails = Array.isArray(body.emails)
      ? body.emails.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean)
      : [];
    const singleEmail = String(body.email || "").trim().toLowerCase();
    if (singleEmail) requestedEmails.unshift(singleEmail);

    const uniqueRequested = [...new Set(requestedEmails)];
    const targets: IssueTarget[] = [];

    if (uniqueRequested.length) {
      for (const email of uniqueRequested) {
        const user = await userDb.collection("users").findOne({ email });
        const attendance = await attendanceCollection(userDb)
          .find({ eventId, email })
          .sort({ createdAt: -1 })
          .limit(5)
          .toArray();
        const fromAttendance = attendance.find((row) => row.participantName || row.userName);
        const fullName = user
          ? `${user.firstName || ""} ${user.lastName || ""}`.trim()
          : "";
        const explicitName =
          uniqueRequested.length === 1 ? String(body.name || "").trim() : "";
        targets.push({
          email,
          userName:
            explicitName ||
            fullName ||
            String(fromAttendance?.participantName || fromAttendance?.userName || "") ||
            email,
          studentNumber: String(user?.studentNumber || fromAttendance?.studentNumber || ""),
          course: String(user?.course || fromAttendance?.course || ""),
          school: String(user?.school || ""),
        });
      }
    } else {
      // Bulk: only participants who already tapped out (eligibility checked below).
      const attendees = await attendanceCollection(userDb)
        .find({ eventId, action: "out" })
        .sort({ createdAt: 1 })
        .toArray();
      const seen = new Set<string>();
      for (const row of attendees) {
        const email = String(row.email || "").toLowerCase();
        if (!email || seen.has(email)) continue;
        seen.add(email);
        const user = await userDb.collection("users").findOne({ email });
        const fullName = user
          ? `${user.firstName || ""} ${user.lastName || ""}`.trim()
          : "";
        targets.push({
          email,
          userName:
            fullName ||
            String(row.participantName || row.userName || email),
          studentNumber: String(user?.studentNumber || row.studentNumber || ""),
          course: String(user?.course || row.course || ""),
          school: String(user?.school || ""),
        });
      }
    }

    if (!targets.length) {
      return NextResponse.json(
        {
          error:
            "No recipients found. Select a participant who has tapped out, or record attendance first.",
        },
        { status: 400 },
      );
    }

    const created = [];
    const skipped = [];
    const ineligible = [];
    let exceptions = 0;
    for (const target of targets) {
      const eligibility = await getCertificateEligibility({
        userDb,
        eventId,
        email: target.email,
        requiredMinutes,
      });
      const asException = !eligibility.eligible && override;
      if (!eligibility.eligible && !asException) {
        ineligible.push({
          email: target.email,
          userName: target.userName,
          reason: eligibility.reason,
        });
        continue;
      }

      const existing = await certificatesCollection(userDb).findOne({
        eventId,
        email: target.email,
      });
      if (existing && !regenerate) {
        // Keep already-generated certs visible as Issued (never leave a blank status).
        const existingStatus = String(existing.status || "").toLowerCase();
        if (!existingStatus || existingStatus === "pending" || existingStatus === "not issued") {
          await certificatesCollection(userDb).updateOne(
            { _id: existing._id },
            { $set: { status: "generated" } },
          );
        }
        skipped.push({
          email: target.email,
          userName: target.userName,
          id: String(existing._id),
          status: existingStatus === "distributed" ? "distributed" : "generated",
          downloadUrl: certificateDownloadUrl(String(existing._id)),
        });
        continue;
      }
      if (existing && regenerate) {
        await certificatesCollection(userDb).deleteOne({ _id: existing._id });
      }

      const doc = await createCertificateDoc({
        db: userDb,
        event: {
          id: eventId,
          title: String(event.title || ""),
          startsAt: String(event.startsAt || ""),
          certificateTemplateBase64: String(event.certificateTemplateBase64 || ""),
        },
        recipient: {
          email: target.email,
          userName: target.userName,
        },
        generatedBy: auth.session,
        qualificationSource: asException ? "admin-override" : "admin",
        attendanceMinutes: eligibility.attendanceMinutes,
      });
      if (asException) exceptions += 1;

      // Enrich stored certificate with school identity fields for admin tables.
      await certificatesCollection(userDb).updateOne(
        { _id: new ObjectId(doc.id) },
        {
          $set: {
            studentNumber: target.studentNumber || "",
            course: target.course || "",
            school: target.school || "",
            ...(asException
              ? {
                  overrideReason: eligibility.reason,
                  overrideBy: auth.session.email,
                  overrideAt: new Date().toISOString(),
                }
              : {}),
          },
        },
      );

      created.push({
        ...doc,
        studentNumber: target.studentNumber || "",
        course: target.course || "",
        school: target.school || "",
      });
    }

    const parts = [
      `Issued ${created.length} certificate(s) for "${event.title}".`,
    ];
    if (exceptions) parts.push(`${exceptions} issued as an admin exception.`);
    if (skipped.length) parts.push(`${skipped.length} already had a certificate.`);
    if (ineligible.length) {
      parts.push(
        `${ineligible.length} skipped (need tap-out + minimum ${requiredMinutes || "—"} min).`,
      );
    }

    return NextResponse.json(
      {
        certificates: created,
        skipped,
        ineligible,
        message: parts.join(" "),
      },
      { status: created.length ? 201 : 200 },
    );
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to generate certificates.", details },
      { status: 500 },
    );
  }
}

/** Mark generated certificates as distributed (released to participants). */
export async function PATCH(request: Request) {
  const auth = await requireAdminAuth(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  // Accept either distribute or generate permission — both roles manage release.
  const distributeDenied = await requireAdminPermission(auth, "distribute-certificates");
  const generateDenied = await requireAdminPermission(auth, "generate-certificates");
  if (distributeDenied && generateDenied) {
    return NextResponse.json(
      { error: distributeDenied.error },
      { status: distributeDenied.status },
    );
  }

  let body: {
    eventId?: string;
    email?: string;
    emails?: string[];
    action?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const action = String(body.action || "distribute").trim().toLowerCase();
  if (action !== "distribute") {
    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  }

  const eventId = String(body.eventId || "").trim();
  if (!eventId || !ObjectId.isValid(eventId)) {
    return NextResponse.json({ error: "Valid eventId is required." }, { status: 400 });
  }

  const emails = [
    ...(Array.isArray(body.emails) ? body.emails : []),
    body.email || "",
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
  const uniqueEmails = [...new Set(emails)];
  if (!uniqueEmails.length) {
    return NextResponse.json(
      { error: "Select at least one participant with a generated certificate." },
      { status: 400 },
    );
  }

  try {
    const userDb = await getUserDb();
    const now = new Date().toISOString();
    const filter = {
      eventId,
      email: { $in: uniqueEmails },
      status: { $ne: "distributed" },
    };
    const existing = await certificatesCollection(userDb)
      .find(filter, { projection: { _id: 1, email: 1, userName: 1, eventName: 1, eventTitle: 1 } })
      .limit(500)
      .toArray();

    if (!existing.length) {
      const already = await certificatesCollection(userDb).countDocuments({
        eventId,
        email: { $in: uniqueEmails },
        status: "distributed",
      });
      const missing = uniqueEmails.length - already;
      return NextResponse.json({
        distributed: 0,
        alreadyDistributed: already,
        missing,
        message:
          already > 0
            ? `${already} certificate(s) were already distributed.`
            : "No generated certificates found for the selected participants. Generate first.",
      });
    }

    const result = await certificatesCollection(userDb).updateMany(
      { _id: { $in: existing.map((doc) => doc._id) } },
      {
        $set: {
          status: "distributed",
          distributedAt: now,
          distributedBy: auth.session.email,
        },
      },
    );

    const { notifyUser } = await import("@/lib/user-server/portal");
    await Promise.all(
      existing.map((doc) =>
        notifyUser({
          email: String(doc.email || ""),
          title: "Certificate distributed",
          body: `Your certificate for ${String(doc.eventName || doc.eventTitle || "the event")} has been released.`,
          type: "certificate",
          eventId,
          eventTitle: String(doc.eventName || doc.eventTitle || ""),
        }).catch(() => undefined),
      ),
    );

    return NextResponse.json({
      distributed: result.modifiedCount,
      message: `Distributed ${result.modifiedCount} certificate(s).`,
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to distribute certificates.", details },
      { status: 500 },
    );
  }
}
