import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireAdminAuth } from "@/lib/admin-server/require-admin-auth";
import { getUserDb } from "@/lib/user-server/get-user-db";

/** The signed-in admin's own System Permissions (used to hide sidebar links). */
export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (auth.session.role === "super-admin") {
    return NextResponse.json({ role: "super-admin", adminPermissions: null });
  }
  const db = await getUserDb();
  const filter =
    auth.userId && ObjectId.isValid(auth.userId)
      ? { _id: new ObjectId(auth.userId) }
      : { email: auth.session.email };
  const user = await db.collection("users").findOne(filter, { projection: { adminPermissions: 1 } });
  return NextResponse.json({
    role: auth.session.role,
    adminPermissions: (user?.adminPermissions || null) as Record<string, boolean> | null,
  });
}
