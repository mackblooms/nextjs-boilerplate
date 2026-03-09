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
