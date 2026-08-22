import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireAdminAuth } from "@/lib/admin-server/require-admin-auth";
import { bufferFromStoredBase64 } from "@/lib/events/files";
import { eventsCollection } from "@/lib/events/types";
import { getUserDb } from "@/lib/user-server/get-user-db";
import { registrationsCollection } from "@/lib/user-server/portal";
import { requireSessionActor } from "@/lib/user-server/session-auth";

type RouteContext = {
  params: Promise<{ id: string; registrationId: string; fileId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const admin = await requireAdminAuth(request);
  const isAdmin = !("error" in admin);
  const actor = isAdmin ? null : await requireSessionActor(request);
  if (!isAdmin && actor && "error" in actor) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  const { id, registrationId, fileId } = await context.params;
  if (!ObjectId.isValid(id) || !ObjectId.isValid(registrationId)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  try {
    const db = await getUserDb();
    const event = await eventsCollection(db).findOne({ _id: new ObjectId(id) });
    if (!event) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }
    const sessionActor = actor && !("error" in actor) ? actor : null;
    const owns =
      Boolean(sessionActor) &&
      (event.organizerEmail === sessionActor?.email ||
        event.organizerId === sessionActor?.userId);
    if (!isAdmin && !owns) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const registration = await registrationsCollection(db).findOne({
      _id: new ObjectId(registrationId),
      eventId: id,
    });
    if (!registration) {
      return NextResponse.json({ error: "Registration not found." }, { status: 404 });
    }

    const files = Array.isArray(registration.files) ? registration.files : [];
    const file = files.find((item) => {
      const row = item as Record<string, unknown>;
      return String(row.id || "") === fileId;
    }) as Record<string, unknown> | undefined;
    if (!file || !file.base64) {
      return NextResponse.json({ error: "File not found." }, { status: 404 });
    }

    const mimeType = String(file.mimeType || "application/octet-stream");
    const fileName = String(file.fileName || file.name || "file");
    const base64 = String(file.base64 || "");
    const bytes = bufferFromStoredBase64(base64);
    const download = new URL(request.url).searchParams.get("download") === "1";

    if (download) {
      return new NextResponse(new Uint8Array(bytes), {
        headers: {
          "Content-Type": mimeType,
          "Content-Disposition": `inline; filename="${fileName.replace(/["\r\n]/g, "")}"`,
          "Cache-Control": "private, no-store",
        },
      });
    }

    const dataUrl = base64.startsWith("data:")
      ? base64
      : `data:${mimeType};base64,${base64}`;

    return NextResponse.json({
      file: {
        id: fileId,
        name: String(file.name || fileName),
        fileName,
        mimeType,
        dataUrl,
      },
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Failed to load file.", details }, { status: 500 });
  }
}
