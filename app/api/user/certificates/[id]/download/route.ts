import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getUserDb } from "@/lib/user-server/get-user-db";
import { certificatesCollection } from "@/lib/db/user-collections";
import { requireSessionActor } from "@/lib/user-server/session-auth";
import { requireAdminAuth } from "@/lib/admin-server/require-admin-auth";
import { resolveCertificatePdf } from "@/lib/user-server/certificates";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const admin = await requireAdminAuth(request);
  const isAdmin = !("error" in admin);
  const actor = isAdmin ? null : await requireSessionActor(request);
  if (!isAdmin && actor && "error" in actor) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  const { id } = await context.params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid certificate id." }, { status: 400 });
  }

  try {
    const db = await getUserDb();
    const cert = await certificatesCollection(db).findOne({ _id: new ObjectId(id) });
    if (!cert) {
      return NextResponse.json({ error: "Certificate not found." }, { status: 404 });
    }

    if (!isAdmin && actor && !("error" in actor)) {
      const email = String(cert.email || "").trim().toLowerCase();
      if (email !== actor.email.trim().toLowerCase()) {
        return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      }
    }

    const resolved = await resolveCertificatePdf(db, cert);
    if (!resolved?.base64) {
      return NextResponse.json(
        { error: "Certificate file is unavailable." },
        { status: 404 },
      );
    }

    const bytes = Buffer.from(resolved.base64, "base64");
    const fileName = resolved.fileName;
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": resolved.mimeType,
        "Content-Disposition": `inline; filename="${fileName.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to download certificate.", details },
      { status: 500 },
    );
  }
}
