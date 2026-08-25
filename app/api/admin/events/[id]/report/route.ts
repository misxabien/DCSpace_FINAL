import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireAdminAuth } from "@/lib/admin-server/require-admin-auth";
import {
  generateAndStoreEventReport,
  getLatestEventReport,
} from "@/lib/admin/event-report";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireAdminAuth(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid event id." }, { status: 400 });
  }

  try {
    const report = await getLatestEventReport(id);
    if (!report) {
      return NextResponse.json({ report: null });
    }
    return NextResponse.json({ report });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to load event report.", details },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireAdminAuth(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid event id." }, { status: 400 });
  }

  try {
    const report = await generateAndStoreEventReport({
      eventId: id,
      generatedByEmail: auth.session.email,
      generatedByName: auth.session.name,
      trigger: "manual",
    });
    return NextResponse.json({ report });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    const status = details.includes("not found") ? 404 : 500;
    return NextResponse.json(
      { error: "Failed to generate event report.", details },
      { status },
    );
  }
}
