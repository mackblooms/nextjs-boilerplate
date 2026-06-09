import {
  DEFAULT_COMPETITION_SLUG,
  normalizeCompetitionSlug,
  type CompetitionSlug,
} from "@/lib/competitions";

const ACTIVE_COMPETITION_STORAGE_KEY = "bb:active-competition";
type CompetitionSearchParams = { get(name: string): string | null };

export function getStoredActiveCompetition(): CompetitionSlug {
  if (typeof window === "undefined") return "world-cup";

  try {
    const stored = window.localStorage.getItem(ACTIVE_COMPETITION_STORAGE_KEY);
    // No stored preference yet → default to the active competition.
    if (!stored) return "world-cup";
    return normalizeCompetitionSlug(stored);
  } catch {
    return "world-cup";
  }
}

export function setStoredActiveCompetition(competitionSlug: CompetitionSlug) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(ACTIVE_COMPETITION_STORAGE_KEY, competitionSlug);
  } catch {
    // Ignore storage failures.
  }
}

export function resolveActiveCompetitionFromLocation(
  pathname: string,
  searchParams?: CompetitionSearchParams | null,
): CompetitionSlug {
  if (pathname === "/world-cup" || pathname.startsWith("/world-cup/")) {
    return "world-cup";
  }

  const explicitCompetition = searchParams?.get("competition");
  if (explicitCompetition) return normalizeCompetitionSlug(explicitCompetition);

  if (pathname === "/") return DEFAULT_COMPETITION_SLUG;

  return getStoredActiveCompetition();
}
