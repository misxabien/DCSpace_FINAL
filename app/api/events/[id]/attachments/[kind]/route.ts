import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireAdminAuth } from "@/lib/admin-server/require-admin-auth";
import {
  bufferFromStoredBase64,
  isEventAttachmentKind,
  resolveEventAttachment,
} from "@/lib/events/files";
import { findEventById } from "@/lib/events/find-event";
import { requireSessionActor } from "@/lib/user-server/session-auth";

type RouteContext = { params: Promise<{ id: string; kind: string }> };

export async function GET(request: Request, context: RouteContext) {
  const admin = await requireAdminAuth(request);
  const isAdmin = !("error" in admin);
  const actor = isAdmin ? null : await requireSessionActor(request);

  const { id, kind } = await context.params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid event id." }, { status: 400 });
  }
  if (!isEventAttachmentKind(kind)) {
    return NextResponse.json({ error: "Unknown attachment." }, { status: 404 });
  }

  try {
    // Events (and posters) live in admin DB; fall back to user DB for legacy rows.
    const { event: doc } = await findEventById(id);
    if (!doc) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }

    const sessionActor = actor && !("error" in actor) ? actor : null;
    const owns =
      Boolean(sessionActor) &&
      (doc.organizerEmail === sessionActor?.email ||
        doc.organizerId === sessionActor?.userId);
    const publiclyVisible = ["approved", "live", "completed"].includes(doc.status);

    // Event posters on public cards can load via <img> without a session cookie.
    const allowAnonymousPoster = kind === "poster" && publiclyVisible;
    if (!isAdmin && !sessionActor && !allowAnonymousPoster) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    if (!isAdmin && !owns && !publiclyVisible) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
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
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": file.mimeType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control":
          kind === "poster" && publiclyVisible
            ? "public, max-age=300"
            : "private, max-age=300",
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
