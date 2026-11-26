import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireAdminAuth } from "@/lib/admin-server/require-admin-auth";
import { requireAdminPermission } from "@/lib/admin-server/admin-permissions";
import { loadEventAiContext } from "@/lib/ai/context";
import { getUserDb } from "@/lib/user-server/get-user-db";

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

/**
 * Real attendance / certificate / feedback numbers for one event (no AI call).
 * Used by the report wizard's "Review Collected Event Data" step, which used to
 * show the design's sample numbers.
 */
export async function GET(request: Request, context: RouteContext) {
  const auth = await requireAdminAuth(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const viewDenied = await requireAdminPermission(auth, "view-reports");
  if (viewDenied) {
    return NextResponse.json({ error: viewDenied.error }, { status: viewDenied.status });
  }

  const { id } = await context.params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid event id." }, { status: 400 });
  }

  try {
    const eventContext = await loadEventAiContext(id);
    if (!eventContext) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }
    const stats = eventContext.stats as Record<string, unknown>;
    const db = await getUserDb();
    const [feedback, certificates, tapOuts] = await Promise.all([
      db.collection("feedback_entries").find({ eventId: id }, { projection: { phase: 1, rating: 1 } }).toArray(),
      db.collection("certificates").find({ eventId: id }, { projection: { status: 1 } }).toArray(),
      db
        .collection("attendance_records")
        .find({ eventId: id, action: "out" }, { projection: { email: 1, qualifiedForCertificate: 1 } })
        .toArray(),
    ]);

    const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
    const registrations = num(stats.registrations);

    // Per participant: met the minimum on any tap-out, or tapped out without meeting it.
    const metByEmail = new Map<string, boolean>();
    for (const row of tapOuts) {
      const email = String(row.email || "").toLowerCase();
      if (!email) continue;
      metByEmail.set(email, Boolean(metByEmail.get(email)) || Boolean(row.qualifiedForCertificate));
    }
    const metRequirement = [...metByEmail.values()].filter(Boolean).length;
    const belowRequirement = metByEmail.size - metRequirement;

    const phaseStats = (phase: string) => {
      const rows = feedback.filter((row) => String(row.phase || "") === phase);
      const ratings = rows.map((row) => Number(row.rating)).filter((value) => Number.isFinite(value) && value > 0);
      const average = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
      return {
        responses: rows.length,
        averageRating: average ? Math.round(average * 10) / 10 : null,
        responseRate: registrations ? Math.min(100, Math.round((rows.length / registrations) * 100)) : null,
      };
    };

    return NextResponse.json({
      eventId: id,
      registrations,
      attendees: num(stats.uniqueTapIns) || num(stats.uniqueParticipants),
      tapIns: num(stats.tapIn),
      tapOuts: num(stats.tapOut),
      averageDuration: String(stats.avgDurationLabel || "—"),
      peakPeriod: String(stats.peakPeriod || ""),
      peakCount: num(stats.peakHourCount),
      metRequirement,
      belowRequirement,
      eligible: num(stats.qualifiedForCertificate) || metRequirement,
      certificatesIssued: certificates.length,
      certificatesDistributed: certificates.filter((row) => String(row.status || "") === "distributed").length,
      midEvent: phaseStats("mid-event"),
      postEvent: phaseStats("post-event"),
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Failed to load event stats.", details }, { status: 500 });
  }
}
