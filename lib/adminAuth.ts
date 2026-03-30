import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export function getSiteAdminUserIds(): Set<string> {
  const raw =
    process.env.POOL_SITE_ADMIN_USER_IDS ??
    process.env.POOL_ADMIN_USER_IDS ??
    process.env.ADMIN_USER_IDS ??
    "";

  return new Set(
    raw
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
  );
}

export function isSiteAdminUserId(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return getSiteAdminUserIds().has(userId);
}

export function getBearerToken(req: Request): string | null {
  const authHeader = getAuthorizationHeader(req);
  if (!authHeader) return null;

  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

export function getAuthorizationHeader(req: Request): string | null {
  return req.headers.get("authorization");
}

export function getCronSecret(): string | null {
  const secret = process.env.CRON_SECRET?.trim();
  return secret ? secret : null;
}

export function getCronAuthorizationHeader(): string | null {
  const secret = getCronSecret();
  return secret ? `Bearer ${secret}` : null;
}

export function isCronAuthorized(req: Request): boolean {
  const secret = getCronSecret();
  if (!secret) return false;

  const authHeader = getAuthorizationHeader(req);
  if (authHeader === `Bearer ${secret}`) return true;

  const cronHeader = req.headers.get("x-cron-secret");
  return cronHeader === secret;
}

export async function requireSiteAdmin(
  req: Request
): Promise<{ userId: string } | { response: NextResponse }> {
  const supabaseAdmin = getSupabaseAdmin();
  const token = getBearerToken(req);

  if (!token) {
    return {
      response: NextResponse.json({ error: "Missing authorization token." }, { status: 401 }),
    };
  }

  const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !authData.user) {
    return {
      response: NextResponse.json(
        { error: authErr?.message ?? "Unauthorized." },
        { status: 401 }
      ),
    };
  }

  const userId = authData.user.id;
  if (!isSiteAdminUserId(userId)) {
    return {
      response: NextResponse.json({ error: "not authorized" }, { status: 403 }),
    };
  }

  return { userId };
}

export async function requireSiteAdminOrCron(
  req: Request
): Promise<{ userId: string | null; viaCron: boolean } | { response: NextResponse }> {
  if (isCronAuthorized(req)) {
    return { userId: null, viaCron: true };
  }

  const auth = await requireSiteAdmin(req);
  if ("response" in auth) return auth;
  return { userId: auth.userId, viaCron: false };
}
