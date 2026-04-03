import { NextResponse } from "next/server";
import { requireSiteAdmin } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sendApnsNotification } from "@/lib/apns";

export const runtime = "nodejs";

type TestPushRequest = {
  installationId?: string;
  title?: string;
  body?: string;
  path?: string;
  poolId?: string;
  destination?: string;
};

export async function POST(req: Request) {
  const auth = await requireSiteAdmin(req);
  if ("response" in auth) return auth.response;

  const supabaseAdmin = getSupabaseAdmin();

  let body: TestPushRequest = {};
  try {
    body = (await req.json()) as TestPushRequest;
  } catch {
    body = {};
  }

  let query = supabaseAdmin
    .from("push_devices")
    .select("installation_id,token,platform,enabled,last_registered_at")
    .eq("user_id", auth.userId)
    .eq("platform", "ios")
    .eq("enabled", true)
    .not("token", "is", null)
    .order("last_registered_at", { ascending: false })
    .limit(1);

  if (body.installationId?.trim()) {
    query = supabaseAdmin
      .from("push_devices")
      .select("installation_id,token,platform,enabled,last_registered_at")
      .eq("user_id", auth.userId)
      .eq("platform", "ios")
      .eq("enabled", true)
      .eq("installation_id", body.installationId.trim())
      .not("token", "is", null)
      .limit(1);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const device = (data ?? [])[0] as
    | {
        installation_id: string;
        token: string | null;
      }
    | undefined;

  if (!device?.token) {
    return NextResponse.json(
      { error: "No enabled iPhone push token found for your account yet." },
      { status: 404 },
    );
  }

  try {
    const result = await sendApnsNotification(device.token, {
      title: body.title?.trim() || "bracketball test",
      body: body.body?.trim() || "Push notifications are connected on this iPhone.",
      path: body.path?.trim() || "/profile",
      poolId: body.poolId?.trim() || null,
      destination: body.destination?.trim() || null,
    });

    return NextResponse.json({
      ok: true,
      installationId: device.installation_id,
      environment: result.environment,
      apnsId: result.apnsId,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to send test push.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
