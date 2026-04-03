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

export function getCanonicalAppOrigin(): string {
  if (typeof window === "undefined") return "https://www.bracketball.io";

  const currentOrigin = window.location.origin;
  if (currentOrigin === "https://bracketball.io") return "https://www.bracketball.io";
  return currentOrigin;
}

export function buildPoolInviteUrl(poolId: string): string {
  return `${getCanonicalAppOrigin()}/?invite=${encodeURIComponent(poolId)}`;
}

export function buildPoolInviteShareData(
  poolId: string,
  poolName?: string | null,
  isPrivate?: boolean | null,
) {
  const url = buildPoolInviteUrl(poolId);
  const trimmedName = poolName?.trim() ?? "";
  const title = trimmedName ? `${trimmedName} on bracketball` : "Join my bracketball pool";
  const privacyTag = isPrivate ? "Private pool." : "Public pool.";
  const text = trimmedName
    ? `${privacyTag} Join my bracketball pool, ${trimmedName}, and make your picks in the app.`
    : `${privacyTag} Join my bracketball pool and make your picks in the app.`;

  return {
    url,
    title,
    text,
    copyLabel: trimmedName ? `Invite link copied for ${trimmedName}.` : "Invite link copied.",
  };
}
