import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getUserDb } from "@/lib/user-server/get-user-db";
import { getAdminDb } from "@/lib/db/get-db";
import { requireSessionActor } from "@/lib/user-server/session-auth";
import { requireAdminAuth } from "@/lib/admin-server/require-admin-auth";
import { eventsCollection } from "@/lib/events/types";
import { buildCertificatePdfFromTemplate } from "@/lib/certificates/template";
import { contentDisposition } from "@/lib/http/content-disposition";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const admin = await requireAdminAuth(request);
  const isAdmin = !("error" in admin);
  const actor = isAdmin ? null : await requireSessionActor(request);
  if (!isAdmin) {
    if (!actor || "error" in actor) {
      return NextResponse.json(
        { error: (actor && "error" in actor && actor.error) || "Authentication required." },
        { status: (actor && "error" in actor && actor.status) || 401 },
      );
    }
  }

  const { id } = await context.params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid certificate id." }, { status: 400 });
  }

  try {
    const db = await getUserDb();
    const cert = await db.collection("certificates").findOne({ _id: new ObjectId(id) });
    if (!cert) {
      return NextResponse.json({ error: "Certificate not found." }, { status: 404 });
    }

    const certEmail = String(cert.email || "").trim().toLowerCase();
    if (!isAdmin) {
      const actorEmail =
        actor && !("error" in actor) ? actor.email.trim().toLowerCase() : "";
      if (!actorEmail || !certEmail || certEmail !== actorEmail) {
        return NextResponse.json(
          { error: "You can only download your own certificates." },
          { status: 403 },
        );
      }
    }

    let base64 = String(cert.generatedPdfBase64 || "");
    const recipientName = String(cert.userName || "").trim();
    const eventId = String(cert.eventId || "").trim();
    const dateIssued = String(cert.dateIssued || "");
    const layoutVersion = Number(cert.layoutVersion || 0);

    // Rebuild once from the live event template so older certificates pick up
    // the corrected name placement, then cache the result.
    if (
      layoutVersion < 2 &&
      recipientName &&
      eventId &&
      ObjectId.isValid(eventId)
    ) {
      try {
        const adminDb = await getAdminDb();
        const event = await eventsCollection(adminDb).findOne(
          { _id: new ObjectId(eventId) },
          { projection: { certificateTemplateBase64: 1, title: 1 } },
        );
        const templateBase64 = String(event?.certificateTemplateBase64 || "");
        if (templateBase64) {
          base64 = await buildCertificatePdfFromTemplate({
            templateBase64,
            recipientName,
            eventName: String(cert.eventName || event?.title || ""),
            dateIssued,
          });
          await db.collection("certificates").updateOne(
            { _id: cert._id },
            {
              $set: {
                generatedPdfBase64: base64,
                generatedPdfMimeType: "application/pdf",
                layoutVersion: 2,
              },
            },
          );
        }
      } catch {
        // Fall through to the stored PDF if rebuild fails.
      }
    }

    if (!base64) {
      return NextResponse.json(
        { error: "Certificate file is unavailable." },
        { status: 404 },
      );
    }

    const bytes = Buffer.from(base64, "base64");
    const fileName = String(cert.generatedPdfFileName || "certificate.pdf");
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": String(cert.generatedPdfMimeType || "application/pdf"),
        "Content-Disposition": contentDisposition("inline", fileName, "certificate.pdf"),
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
