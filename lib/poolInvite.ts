import { supabase } from "./supabaseClient";

export function getInvitePoolIdFromNextPath(nextPath: string | null | undefined): string | null {
  if (!nextPath || !nextPath.startsWith("/")) return null;
  const match = nextPath.match(/^\/pool\/([^/?#]+)/);
  return match?.[1] ?? null;
}

export function resolveInvitePoolId(searchParams: URLSearchParams): string | null {
  const invitePoolId = searchParams.get("invitePoolId");
  if (invitePoolId) return invitePoolId;
  return getInvitePoolIdFromNextPath(searchParams.get("next"));
}

function isDuplicateMembershipError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "23505") return true;
  const message = error.message?.toLowerCase() ?? "";
  return message.includes("duplicate key") && message.includes("pool_members");
}

export async function ensurePoolMembership(
  poolId: string | null | undefined,
  userId: string | null | undefined,
): Promise<string | null> {
  if (!poolId || !userId) return null;

  const { error } = await supabase.from("pool_members").insert({
    pool_id: poolId,
    user_id: userId,
  });

  if (!error || isDuplicateMembershipError(error)) {
    return null;
  }

  return error.message ?? "Failed to join invited pool.";
}
