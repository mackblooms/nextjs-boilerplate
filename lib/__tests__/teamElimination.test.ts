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

  it("eliminates World Cup official penalty losers when scores are tied", () => {
    const eliminated = getEliminatedTeamIds(
      [
        {
          round: "R32",
          slot: 6,
          team1_id: "australia",
          team2_id: "egypt",
          winner_team_id: null,
          status: "Final",
          team1_score: 1,
          team2_score: 1,
        },
      ],
      "world-cup",
    );

    expect(eliminated.has("australia")).toBe(true);
    expect(eliminated.has("egypt")).toBe(false);
  });

  it("eliminates the S16 slot 4 official tied-score loser", () => {
    const eliminated = getEliminatedTeamIds(
      [
        {
          round: "S16",
          slot: 4,
          team1_id: "switzerland",
          team2_id: "colombia",
          winner_team_id: null,
          status: "Final",
          team1_score: 0,
          team2_score: 0,
        },
      ],
      "world-cup",
    );

    expect(eliminated.has("colombia")).toBe(true);
    expect(eliminated.has("switzerland")).toBe(false);
  });
});
