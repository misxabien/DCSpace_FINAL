import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-server/require-admin-auth";
import { getUserDb } from "@/lib/user-server/get-user-db";
import { activitiesCollection } from "@/lib/user-server/activity";
import { adminReportsCollection } from "@/lib/admin/admin-reports";
import { CASE_INSENSITIVE } from "@/lib/db/indexes";

export const dynamic = "force-dynamic";

/** The signed-in admin's own "Account Summary" (profile page) — real counts. */
export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const email = auth.session.email.trim().toLowerCase();
  // Exact match + case-insensitive collation → indexed lookups.
  const ci = { collation: CASE_INSENSITIVE };
  try {
    const db = await getUserDb();
    const [eventsApproved, usersAdded, reportsExported, me] = await Promise.all([
      activitiesCollection(db).countDocuments({ type: "event_approved", actorEmail: email }, ci),
      db.collection("users").countDocuments({ createdByEmail: email }, ci),
      adminReportsCollection(db).countDocuments({ generatedByEmail: email }, ci),
      db.collection("users").findOne({ email }, { projection: { passwordChangedAt: 1 }, ...ci }),
    ]);
    return NextResponse.json({
      eventsApproved,
      usersAdded,
      reportsExported,
      passwordChangedAt: String(me?.passwordChangedAt || ""),
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Failed to load summary.", details }, { status: 500 });
  }
}
