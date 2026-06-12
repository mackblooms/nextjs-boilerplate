import { describe, expect, it } from "vitest";
import { getEliminatedTeamIds } from "../teamElimination";
import type { ScoringGame } from "../scoring";

function groupGame(team1: string, team2: string, winner: string | null): ScoringGame {
  return {
    round: "GROUP",
    team1_id: team1,
    team2_id: team2,
    winner_team_id: winner,
  };
}

function r32Game(slot: number): ScoringGame {
  return {
    round: "R32",
    team1_id: `advanced-${slot}-a`,
    team2_id: `advanced-${slot}-b`,
    winner_team_id: null,
  };
}

describe("getEliminatedTeamIds", () => {
  it("keeps March Madness loser-based elimination behavior", () => {
    const eliminated = getEliminatedTeamIds(
      [
        {
          round: "R64",
          team1_id: "winner",
          team2_id: "loser",
          winner_team_id: "winner",
        },
      ],
      "march-madness",
    );

    expect(eliminated.has("loser")).toBe(true);
    expect(eliminated.has("winner")).toBe(false);
  });

  it("does not eliminate World Cup teams for group-stage losses", () => {
    const eliminated = getEliminatedTeamIds(
      [groupGame("south-africa", "mexico", "mexico")],
      "world-cup",
    );

    expect(eliminated.has("south-africa")).toBe(false);
    expect(eliminated.has("mexico")).toBe(false);
  });

  it("eliminates World Cup group-stage non-advancers only after the official R32 field is complete", () => {
    const games: ScoringGame[] = [
      groupGame("south-africa", "mexico", "mexico"),
      ...Array.from({ length: 16 }, (_, index) => r32Game(index + 1)),
    ];
    games[1] = {
      round: "R32",
      team1_id: "mexico",
      team2_id: "advanced-1-b",
      winner_team_id: null,
    };

    const eliminated = getEliminatedTeamIds(games, "world-cup");

    expect(eliminated.has("south-africa")).toBe(true);
    expect(eliminated.has("mexico")).toBe(false);
  });

  it("eliminates World Cup knockout losers", () => {
    const eliminated = getEliminatedTeamIds(
      [
        {
          round: "R32",
          team1_id: "winner",
          team2_id: "loser",
          winner_team_id: "winner",
        },
      ],
      "world-cup",
    );

    expect(eliminated.has("loser")).toBe(true);
    expect(eliminated.has("winner")).toBe(false);
  });
});
