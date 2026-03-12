import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type TrackEventRequest = {
  eventName?: string;
  path?: string | null;
  sessionId?: string | null;
  userId?: string | null;
  poolId?: string | null;
  entryId?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
};

function isValidUuid(value: string | null | undefined) {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeEventName(value: string | undefined) {
  const eventName = value?.trim() ?? "";
  if (!eventName) return null;
  if (eventName.length > 64) return null;
  if (!/^[a-z0-9._-]+$/i.test(eventName)) return null;
  return eventName.toLowerCase();
}

function safeMetadata(
  metadata: Record<string, string | number | boolean | null> | undefined,
  req: Request
) {
  const base: Record<string, string | number | boolean | null> = {
    user_agent: req.headers.get("user-agent"),
  };

  if (!metadata) return base;

  // Keep payload tight to avoid oversized event rows.
  const merged = { ...base, ...metadata };
  const trimmedKeys = Object.keys(merged).slice(0, 30);
  const out: Record<string, string | number | boolean | null> = {};
  for (const key of trimmedKeys) {
    const value = merged[key];
    if (typeof value === "string" && value.length > 300) {
      out[key] = value.slice(0, 300);
      continue;
    }
    out[key] = value;
  }
  return out;
}

function tryGetSupabaseAdmin() {
  try {
    return getSupabaseAdmin();
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const supabaseAdmin = tryGetSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: true, skipped: "analytics-disabled" });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as TrackEventRequest;
    const eventName = normalizeEventName(body.eventName);
    if (!eventName) {
      return NextResponse.json({ error: "Invalid eventName." }, { status: 400 });
    }

    const path = body.path?.trim() || null;
    const sessionId = body.sessionId?.trim() || null;
    const userId = isValidUuid(body.userId) ? body.userId : null;
    const poolId = isValidUuid(body.poolId) ? body.poolId : null;
    const entryId = isValidUuid(body.entryId) ? body.entryId : null;
    const metadata = safeMetadata(body.metadata, req);

    const { error } = await supabaseAdmin.from("analytics_events").insert({
      event_name: eventName,
      event_source: "web",
      path,
      session_id: sessionId,
      user_id: userId,
      pool_id: poolId,
      entry_id: entryId,
      metadata,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error." },
      { status: 500 },
    );
  }
}
