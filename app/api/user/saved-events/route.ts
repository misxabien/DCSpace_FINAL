import { NextResponse } from "next/server";
import { getUserDb } from "@/lib/user-server/get-user-db";
import { savedEventsCollection } from "@/lib/db/user-collections";
import { requireSessionActor } from "@/lib/user-server/session-auth";
import { requireAdminAuth } from "@/lib/admin-server/require-admin-auth";

export async function GET(request: Request) {
  const admin = await requireAdminAuth(request);
  const isAdmin = !("error" in admin);
  const actor = isAdmin ? null : await requireSessionActor(request);
  if (!isAdmin && actor && "error" in actor) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  try {
    const db = await getUserDb();
    const emailParam = new URL(request.url).searchParams.get("email");
    const email =
      isAdmin && emailParam
        ? emailParam.trim().toLowerCase()
        : actor && !("error" in actor)
          ? actor.email.trim().toLowerCase()
          : "";
    if (!email) {
      return NextResponse.json({ eventIds: [] });
    }
    const doc = await savedEventsCollection(db).findOne({
      email: { $regex: `^${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
    });
    return NextResponse.json({
      eventIds: Array.isArray(doc?.eventIds) ? doc.eventIds.map(String) : [],
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to load saved events.", details },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const actor = await requireSessionActor(request);
  if ("error" in actor) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  let body: { eventIds?: string[]; eventId?: string; saved?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    const db = await getUserDb();
    const col = savedEventsCollection(db);
    const email = actor.email.trim().toLowerCase();
    const existing = await col.findOne({
      email: { $regex: `^${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
    });
    let ids: string[] = Array.isArray(existing?.eventIds)
      ? existing!.eventIds.map(String)
      : [];

    if (Array.isArray(body.eventIds)) {
      ids = body.eventIds.map(String);
    } else if (body.eventId) {
      const sid = String(body.eventId);
      const has = ids.includes(sid);
      if (body.saved === false || (body.saved === undefined && has)) {
        ids = ids.filter((id) => id !== sid);
      } else if (!has) {
        ids.push(sid);
      }
    }

    await col.updateOne(
      { email },
      {
        $set: {
          email,
          userId: actor.userId || "",
          eventIds: ids,
          updatedAt: new Date().toISOString(),
        },
        $setOnInsert: { createdAt: new Date().toISOString() },
      },
      { upsert: true },
    );

    return NextResponse.json({ eventIds: ids });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to save events.", details },
      { status: 500 },
    );
  }
}
