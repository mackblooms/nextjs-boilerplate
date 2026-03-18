export const OFFICIAL_DRAFT_LOCK_ISO = "2026-03-19T16:15:00.000Z";

function parseTimestamp(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function resolveDraftLockTime(poolLockTime: string | null | undefined): string {
  const official = parseTimestamp(OFFICIAL_DRAFT_LOCK_ISO);
  if (!official) {
    throw new Error("OFFICIAL_DRAFT_LOCK_ISO is invalid.");
  }

  const poolLock = parseTimestamp(poolLockTime);
  if (!poolLock) return official.toISOString();

  // Never allow a stale earlier timestamp (for example, old 8:00 AM seeds) to
  // override the official first-tip lock time.
  const effective = poolLock.getTime() > official.getTime() ? poolLock : official;
  return effective.toISOString();
}

export function isDraftLocked(poolLockTime: string | null | undefined, now: Date = new Date()): boolean {
  const resolved = parseTimestamp(resolveDraftLockTime(poolLockTime));
  if (!resolved) return false;
  return now.getTime() >= resolved.getTime();
}

export function formatDraftLockTimeET(poolLockTime: string | null | undefined): string {
  const resolved = parseTimestamp(resolveDraftLockTime(poolLockTime));
  if (!resolved) return "TBD (ET)";

  return (
    resolved.toLocaleString("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }) + " ET"
  );
}

export function isDraftLibraryLocked(now: Date = new Date()): boolean {
  return isDraftLocked(null, now);
}

export function draftLibraryLockMessage(): string {
  return `Draft editing is locked after first tip (${formatDraftLockTimeET(null)}).`;
}
