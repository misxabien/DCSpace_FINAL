import { NextResponse } from "next/server";
import { getGeminiModel, isAiConfigured, isGeminiConfigured } from "@/lib/ai/gemini";
import { getBackupAiInfo } from "@/lib/ai/backup-ai";
import { requireAdminAuth } from "@/lib/admin-server/require-admin-auth";
import { requireSessionActor } from "@/lib/user-server/session-auth";

/** Lightweight status for admin/organizer AI panels. Never returns the API key. */
export async function GET(request: Request) {
  const admin = await requireAdminAuth(request);
  const actor = "error" in admin ? await requireSessionActor(request) : null;
  if ("error" in admin && actor && "error" in actor) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  const gemini = isGeminiConfigured();
  const backup = getBackupAiInfo();
  return NextResponse.json({
    configured: isAiConfigured(),
    model: gemini ? getGeminiModel() : null,
    provider: "gemini",
    backup: { configured: backup.configured, provider: backup.provider || null, model: backup.model },
  });
}
