import pricing from "@/data/cbb-season/pricing-preview.json";

export const seasonPricing = pricing;
export const SEASON_DRAFT_STORAGE_KEY = "bb:cbb-season:preview-draft";
export type SeasonTeam = {
  id: string;
  name: string;
  conference: string;
  projectedWins: number;
  projectedLosses: number;
  bandIndex: number;
  cost: number;
};
export type SeasonDraft = { version: string; name: string; teamIds: string[] };

export function getSeasonBand(wins: number, losses: number) {
  return pricing.bands.findIndex(band => wins / (wins + losses) >= band.minimumPercentage);
}

export function seasonSquadSummary(teams: SeasonTeam[]) {
  const counts = pricing.bands.map((_, index) => teams.filter(t => t.bandIndex === index).length);
  const spent = teams.reduce((sum, t) => sum + t.cost, 0);
  const wins = teams.reduce((sum, t) => sum + t.projectedWins, 0);
  const losses = teams.reduce((sum, t) => sum + t.projectedLosses, 0);
  return { counts, spent, remaining: pricing.budget - spent, wins, losses,
    percentage: wins + losses ? wins / (wins + losses) : null,
    complete: spent === pricing.budget && counts.every((n, i) => n >= pricing.bands[i].min && n <= pricing.bands[i].max) };
}

export function legalSeasonCompositions() {
  const result: number[][] = [];
  function visit(counts: number[], spent: number) {
    const band = pricing.bands[counts.length];
    if (!band) {
      if (spent === pricing.budget) result.push(counts);
      return;
    }
    for (let count = band.min; count <= band.max; count++) {
      const total = spent + count * band.cost;
      if (total > pricing.budget) break;
      visit([...counts, count], total);
    }
  }
  visit([], 0);
  return result;
}

const compositions = legalSeasonCompositions();

export function canCompleteSeasonSquad(selected: SeasonTeam[], allTeams: SeasonTeam[]) {
  const { counts, remaining } = seasonSquadSummary(selected);
  if (remaining < 0 || new Set(selected.map(t => t.id)).size !== selected.length) return false;
  const available = pricing.bands.map((_, index) => allTeams.filter(t => t.bandIndex === index).length);
  return compositions.some(target => target.every((count, index) => count >= counts[index] && count <= available[index]));
}

export function seasonPickBlockReason(team: SeasonTeam, selected: SeasonTeam[]) {
  if (selected.some(t => t.id === team.id)) return null;
  const { remaining, counts } = seasonSquadSummary(selected);
  if (team.cost > remaining) return "Not enough points remaining.";
  if (counts[team.bandIndex] >= pricing.bands[team.bandIndex].max) return `${pricing.bands[team.bandIndex].label} limit reached.`;
  return null;
}

// Reject incompatible or corrupt local saves rather than silently changing someone's picks.
export function parseSeasonDraft(raw: string, teams: SeasonTeam[]): SeasonDraft {
  const draft = JSON.parse(raw) as Partial<SeasonDraft> | null;
  const ids = new Set(teams.map(t => t.id));
  if (!draft || draft.version !== pricing.version || typeof draft.name !== "string" || draft.name.length > 60
    || !Array.isArray(draft.teamIds) || draft.teamIds.some(id => typeof id !== "string" || !ids.has(id))
    || new Set(draft.teamIds).size !== draft.teamIds.length) throw new Error("Saved draft is incompatible with this pricing preview.");
  const selected = draft.teamIds.map(id => teams.find(t => t.id === id)!);
  const summary = seasonSquadSummary(selected);
  if (summary.remaining < 0 || summary.counts.some((n, i) => n > pricing.bands[i].max)) {
    throw new Error("Saved draft exceeds the budget or a price-band limit.");
  }
  return draft as SeasonDraft;
}
