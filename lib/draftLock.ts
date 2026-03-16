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

  const earliest = poolLock.getTime() < official.getTime() ? poolLock : official;
  return earliest.toISOString();
}

export function isDraftLocked(poolLockTime: string | null | undefined, now: Date = new Date()): boolean {
  const resolved = parseTimestamp(resolveDraftLockTime(poolLockTime));
  if (!resolved) return false;
  return now.getTime() >= resolved.getTime();
}
