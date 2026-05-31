import {
  DEFAULT_COMPETITION_SLUG,
  normalizeCompetitionSlug,
  type CompetitionSlug,
} from "@/lib/competitions";

const ACTIVE_COMPETITION_STORAGE_KEY = "bb:active-competition";

export function getStoredActiveCompetition(): CompetitionSlug {
  if (typeof window === "undefined") return DEFAULT_COMPETITION_SLUG;

  try {
    return normalizeCompetitionSlug(window.localStorage.getItem(ACTIVE_COMPETITION_STORAGE_KEY));
  } catch {
    return DEFAULT_COMPETITION_SLUG;
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
