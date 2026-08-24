import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireAdminAuth } from "@/lib/admin-server/require-admin-auth";
import {
  bufferFromStoredBase64,
  isEventAttachmentKind,
  resolveEventAttachment,
} from "@/lib/events/files";
import { eventsCollection } from "@/lib/events/types";
import { getAdminDb } from "@/lib/db/get-db";
import { requireSessionActor } from "@/lib/user-server/session-auth";

type RouteContext = { params: Promise<{ id: string; kind: string }> };

export async function GET(request: Request, context: RouteContext) {
  const admin = await requireAdminAuth(request);
  const isAdmin = !("error" in admin);
  const actor = isAdmin ? null : await requireSessionActor(request);
  if (!isAdmin && actor && "error" in actor) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  const { id, kind } = await context.params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid event id." }, { status: 400 });
  }
  if (!isEventAttachmentKind(kind)) {
    return NextResponse.json({ error: "Unknown attachment." }, { status: 404 });
  }

  try {
    const db = await getAdminDb();
    const doc = await eventsCollection(db).findOne({ _id: new ObjectId(id) });
    if (!doc) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }

    const sessionActor = actor && !("error" in actor) ? actor : null;
    const owns =
      Boolean(sessionActor) &&
      (doc.organizerEmail === sessionActor?.email || doc.organizerId === sessionActor?.userId);

    if (!isAdmin && !owns) {
      const visible = ["approved", "live", "completed"].includes(doc.status);
      if (!visible) {
        return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      }
    }

    const file = resolveEventAttachment(doc, kind);
    if (file.organizerOnly && !isAdmin && !owns) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    if (!file.base64) {
      return NextResponse.json({ error: "File not found." }, { status: 404 });
    }

    const bytes = bufferFromStoredBase64(file.base64);
    if (!bytes.length) {
      return NextResponse.json({ error: "File not found." }, { status: 404 });
    }

    const fileName = file.name.replace(/["\r\n]/g, "") || "download";
    const cacheControl =
      kind === "poster"
        ? "private, max-age=86400, stale-while-revalidate=604800"
        : "private, max-age=3600";
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": file.mimeType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": cacheControl,
      },
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to load attachment.", details },
      { status: 500 },
    );
  }
}
