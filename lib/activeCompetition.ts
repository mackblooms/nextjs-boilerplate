import {
  DEFAULT_COMPETITION_SLUG,
  normalizeCompetitionSlug,
  type CompetitionSlug,
} from "@/lib/competitions";

const ACTIVE_COMPETITION_STORAGE_KEY = "bb:active-competition";

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
