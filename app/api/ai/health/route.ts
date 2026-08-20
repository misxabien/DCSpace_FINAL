import { NextResponse } from "next/server";
import { getGeminiModel, isGeminiConfigured } from "@/lib/ai/gemini";
import { requireAdminAuth } from "@/lib/admin-server/require-admin-auth";
import { requireSessionActor } from "@/lib/user-server/session-auth";

/** Lightweight status for admin/organizer AI panels. Never returns the API key. */
export async function GET(request: Request) {
  const admin = await requireAdminAuth(request);
  const actor = "error" in admin ? await requireSessionActor(request) : null;
  if ("error" in admin && actor && "error" in actor) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  const configured = isGeminiConfigured();
  return NextResponse.json({
    configured,
    model: configured ? getGeminiModel() : null,
    provider: "gemini",
  });
}
