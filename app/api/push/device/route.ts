import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getPushPlatform,
  normalizePushPermissionState,
  type PushPlatform,
} from "@/lib/pushNotifications";

type PushDevicePayload = {
  installationId?: unknown;
  token?: unknown;
  platform?: unknown;
  enabled?: unknown;
  permissionState?: unknown;
  lastError?: unknown;
};

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return null;

  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

function normalizeInstallationId(value: unknown) {
  const installationId = typeof value === "string" ? value.trim() : "";
  return installationId.length > 0 && installationId.length <= 200 ? installationId : null;
}

function normalizeToken(value: unknown) {
  const token = typeof value === "string" ? value.trim() : "";
  return token.length > 0 ? token : null;
}

function normalizePlatform(value: unknown): PushPlatform {
  if (value === "ios" || value === "android" || value === "web") return value;
  return getPushPlatform();
}

function normalizeEnabled(value: unknown, fallback = true) {
  return typeof value === "boolean" ? value : fallback;
}

async function authenticate(req: Request) {
  const supabaseAdmin = getSupabaseAdmin();
  const token = getBearerToken(req);
  if (!token) {
    return { error: NextResponse.json({ error: "Missing authorization token." }, { status: 401 }) };
  }

  const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !authData.user) {
    return {
      error: NextResponse.json(
        { error: authErr?.message ?? "Unauthorized." },
        { status: 401 },
      ),
    };
  }

  return { supabaseAdmin, user: authData.user };
}

export async function GET(req: Request) {
  const auth = await authenticate(req);
  if ("error" in auth) return auth.error;

  const installationId = normalizeInstallationId(new URL(req.url).searchParams.get("installationId"));
  if (!installationId) {
    return NextResponse.json({ error: "installationId is required." }, { status: 400 });
  }

  const { data, error } = await auth.supabaseAdmin
    .from("push_devices")
    .select("enabled,permission_state,platform,token,last_registered_at,last_error")
    .eq("user_id", auth.user.id)
    .eq("installation_id", installationId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const row = data as {
    enabled?: boolean | null;
    permission_state?: string | null;
    platform?: PushPlatform | null;
    token?: string | null;
    last_registered_at?: string | null;
    last_error?: string | null;
  } | null;

  return NextResponse.json({
    ok: true,
    device: row
      ? {
          enabled: row.enabled !== false,
          permissionState: normalizePushPermissionState(row.permission_state),
          platform: row.platform ?? null,
          tokenPresent: Boolean(row.token),
          lastRegisteredAt: row.last_registered_at ?? null,
          lastError: row.last_error ?? null,
        }
      : null,
  });
}

export async function POST(req: Request) {
  const auth = await authenticate(req);
  if ("error" in auth) return auth.error;

  let body: PushDevicePayload;
  try {
    body = (await req.json()) as PushDevicePayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const installationId = normalizeInstallationId(body.installationId);
  if (!installationId) {
    return NextResponse.json({ error: "installationId is required." }, { status: 400 });
  }

  const token = normalizeToken(body.token);
  const enabled = normalizeEnabled(body.enabled, true);
  const permissionState = normalizePushPermissionState(
    typeof body.permissionState === "string" ? body.permissionState : null,
  );
  const platform = normalizePlatform(body.platform);
  const now = new Date().toISOString();

  const payload = {
    user_id: auth.user.id,
    installation_id: installationId,
    platform,
    token,
    enabled,
    permission_state: permissionState,
    last_registered_at: token ? now : null,
    last_seen_at: now,
    last_error: typeof body.lastError === "string" ? body.lastError.slice(0, 500) : null,
    updated_at: now,
  };

  const { error } = await auth.supabaseAdmin
    .from("push_devices")
    .upsert(payload, { onConflict: "installation_id" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    device: {
      enabled,
      permissionState,
      platform,
      tokenPresent: Boolean(token),
    },
  });
}

export async function DELETE(req: Request) {
  const auth = await authenticate(req);
  if ("error" in auth) return auth.error;

  let installationId = normalizeInstallationId(new URL(req.url).searchParams.get("installationId"));
  if (!installationId) {
    try {
      const body = (await req.json()) as PushDevicePayload;
      installationId = normalizeInstallationId(body.installationId);
    } catch {
      installationId = null;
    }
  }

  if (!installationId) {
    return NextResponse.json({ error: "installationId is required." }, { status: 400 });
  }

  const { error } = await auth.supabaseAdmin
    .from("push_devices")
    .update({
      enabled: false,
      token: null,
      updated_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("user_id", auth.user.id)
    .eq("installation_id", installationId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

