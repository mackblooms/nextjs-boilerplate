import projections from "@/data/cbb-season/torvik-2027-projections.json";
import { getSeasonBand, seasonPricing, type SeasonTeam } from "./cbbSeason";

export const seasonTeams: SeasonTeam[] = projections.teams.map(team => {
  const bandIndex = getSeasonBand(team.projectedWins, team.projectedLosses);
  return {
    id: team.team, name: team.team, conference: team.conference,
    projectedWins: team.projectedWins, projectedLosses: team.projectedLosses,
    bandIndex, cost: seasonPricing.bands[bandIndex].cost,
  };
});
