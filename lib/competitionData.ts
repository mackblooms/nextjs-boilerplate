import type { CompetitionSlug } from "@/lib/competitions";

export function isMissingCompetitionSlugColumn(message: string | null | undefined) {
  const lowered = (message ?? "").toLowerCase();
  return lowered.includes("competition_slug") && lowered.includes("does not exist");
}

export function canUseLegacyMarchMadnessFallback(
  competitionSlug: CompetitionSlug,
  message: string | null | undefined,
) {
  return competitionSlug === "march-madness" && isMissingCompetitionSlugColumn(message);
}
