import type { CompetitionSlug } from "./competitions";
import type { ScoringGame } from "./scoring";
import { getWorldCupManualWinnerId } from "./worldCupManualResults.js";

function normalizedRound(round: unknown) {
  return String(round ?? "").trim().toUpperCase();
}

function addGameLoser(eliminatedTeamIds: Set<string>, game: ScoringGame) {
  const winnerTeamId = getWorldCupManualWinnerId(game) ?? game.winner_team_id;
  if (!winnerTeamId || !game.team1_id || !game.team2_id) return;

  if (winnerTeamId === game.team1_id) {
    eliminatedTeamIds.add(game.team2_id);
  } else if (winnerTeamId === game.team2_id) {
    eliminatedTeamIds.add(game.team1_id);
  }
}

function officialWorldCupR32TeamIds(games: ScoringGame[]) {
  const r32Games = games.filter((game) => normalizedRound(game.round) === "R32");
  if (r32Games.length !== 16) return null;

  const teamIds = new Set<string>();
  for (const game of r32Games) {
    if (!game.team1_id || !game.team2_id) return null;
    teamIds.add(game.team1_id);
    teamIds.add(game.team2_id);
  }

  return teamIds.size === 32 ? teamIds : null;
}

export function getEliminatedTeamIds(
  games: ScoringGame[],
  competitionSlug: CompetitionSlug,
) {
  const eliminatedTeamIds = new Set<string>();

  if (competitionSlug !== "world-cup") {
    for (const game of games) addGameLoser(eliminatedTeamIds, game);
    return eliminatedTeamIds;
  }

  const r32TeamIds = officialWorldCupR32TeamIds(games);
  if (r32TeamIds) {
    for (const game of games) {
      if (normalizedRound(game.round) !== "GROUP") continue;
      for (const teamId of [game.team1_id, game.team2_id]) {
        if (teamId && !r32TeamIds.has(teamId)) eliminatedTeamIds.add(teamId);
      }
    }
  }

  for (const game of games) {
    if (normalizedRound(game.round) === "GROUP") continue;
    addGameLoser(eliminatedTeamIds, game);
  }

  return eliminatedTeamIds;
}
