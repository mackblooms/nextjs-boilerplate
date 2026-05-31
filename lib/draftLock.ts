import { getCompetition, normalizeCompetitionSlug, type CompetitionSlug } from "@/lib/competitions";

export const OFFICIAL_DRAFT_LOCK_ISO = getCompetition("march-madness").draftLockIso;

function parseTimestamp(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function resolveDraftLockTime(
  poolLockTime: string | null | undefined,
  competitionSlug: CompetitionSlug = "march-madness",
): string {
  const official = parseTimestamp(getCompetition(competitionSlug).draftLockIso);
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

export function isDraftLocked(
  poolLockTime: string | null | undefined,
  now: Date = new Date(),
  competitionSlug: CompetitionSlug = "march-madness",
): boolean {
  const resolved = parseTimestamp(resolveDraftLockTime(poolLockTime, competitionSlug));
  if (!resolved) return false;
  return now.getTime() >= resolved.getTime();
}

export function formatDraftLockTimeET(
  poolLockTime: string | null | undefined,
  competitionSlug: CompetitionSlug = "march-madness",
): string {
  const resolved = parseTimestamp(resolveDraftLockTime(poolLockTime, competitionSlug));
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

export function isDraftLibraryLocked(
  competitionSlug: CompetitionSlug = "march-madness",
  now: Date = new Date(),
): boolean {
  return isDraftLocked(null, now, competitionSlug);
}

export function draftLibraryLockMessage(competitionValue?: string | null): string {
  const competitionSlug = normalizeCompetitionSlug(competitionValue);
  return `Draft editing is locked after first tip (${formatDraftLockTimeET(null, competitionSlug)}).`;
}
