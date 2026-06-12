/**
 * Tests for liveBracket.ts — live score overlay (competition-agnostic).
 * Bracket advancement routing for march madness is tested elsewhere and confirmed working.
 * World Cup bracket routing is tested in worldCupBracket.test.ts via the routing tables.
 */
import { describe, it, expect } from "vitest";
import {
  applyLiveScoreOverlay,
  matchLiveScoresToGames,
  type LiveOverlayGame,
  type LiveOverlayTeam,
  type LiveOverlayScoreGame,
} from "../liveBracket";

function g(
  id: string, round: string, slot: number,
  team1: string | null, team2: string | null,
  winner: string | null = null, region: string | null = null,
): LiveOverlayGame {
  return { id, round, slot, region, team1_id: team1, team2_id: team2, winner_team_id: winner };
}

// ---------------------------------------------------------------------------
// Live score → winner assignment
// ---------------------------------------------------------------------------

describe("applyLiveScoreOverlay: live score sets winner", () => {
  const teamA: LiveOverlayTeam = { id: "tA", name: "Argentina" };
  const teamB: LiveOverlayTeam = { id: "tB", name: "Brazil" };

  function liveScore(
    awayName: string, homeName: string,
    awayScore: number, homeScore: number,
    state: "LIVE" | "UPCOMING" | "FINAL" = "FINAL",
  ): LiveOverlayScoreGame {
    return {
      id: "ls1", state, detail: state, startTime: null,
      awayTeamId: null, homeTeamId: null,
      awayTeamName: awayName, homeTeamName: homeName,
      awayScore, homeScore,
    };
  }

  it("FINAL with away team winning sets winner to team1_id (when team1 is away)", () => {
    const games = [g("g1", "R32", 1, "tA", "tB", null, null)];
    const result = applyLiveScoreOverlay(games, [teamA, teamB], [liveScore("Argentina", "Brazil", 3, 0)]);
    expect(result[0].winner_team_id).toBe("tA");
  });

  it("FINAL with home team winning sets winner to team2_id (when team2 is home)", () => {
    const games = [g("g1", "R32", 1, "tA", "tB", null, null)];
    const result = applyLiveScoreOverlay(games, [teamA, teamB], [liveScore("Argentina", "Brazil", 0, 2)]);
    expect(result[0].winner_team_id).toBe("tB");
  });

  it("LIVE game does not set winner", () => {
    const games = [g("g1", "R32", 1, "tA", "tB", null, null)];
    const result = applyLiveScoreOverlay(games, [teamA, teamB], [liveScore("Argentina", "Brazil", 1, 0, "LIVE")]);
    expect(result[0].winner_team_id).toBeNull();
  });

  it("tied FINAL score does not set winner", () => {
    const games = [g("g1", "R32", 1, "tA", "tB", null, null)];
    const result = applyLiveScoreOverlay(games, [teamA, teamB], [liveScore("Argentina", "Brazil", 1, 1)]);
    expect(result[0].winner_team_id).toBeNull();
  });

  it("tied FINAL score overwrites scheduled status and stores scores", () => {
    const games = [g("g1", "GROUP", 1, "tA", "tB", null, "Group A")];
    games[0].status = "Scheduled";

    const result = applyLiveScoreOverlay(games, [teamA, teamB], [liveScore("Argentina", "Brazil", 1, 1)]);

    expect(result[0].status).toBe("FINAL");
    expect(result[0].team1_score).toBe(1);
    expect(result[0].team2_score).toBe(1);
    expect(result[0].winner_team_id).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Stale winner guard (competition-agnostic)
// ---------------------------------------------------------------------------

describe("applyLiveScoreOverlay: stale winner guard", () => {
  it("winner_team_id not matching either team in the next round is cleared", () => {
    // After teams change in a slot, an old winner_team_id becomes stale
    const games = [
      g("r32-1", "R32", 1, "tA", "tB", "tA", null),
      g("r32-2", "R32", 2, "tC", "tD", "tC", null),
      g("s16-1", "S16", 1, null, null, "stale", null),
    ];
    const result = applyLiveScoreOverlay(games, [], []);
    const s16 = result.find((x) => x.id === "s16-1")!;
    expect(s16.team1_id).toBe("tA");
    expect(s16.team2_id).toBe("tC");
    expect(s16.winner_team_id).toBeNull();
  });

  it("valid winner_team_id is preserved when teams haven't changed", () => {
    const games = [
      g("r32-1", "R32", 1, "tA", "tB", "tA", null),
      g("r32-2", "R32", 2, "tC", "tD", "tC", null),
      g("s16-1", "S16", 1, null, null, "tA", null), // tA is valid
    ];
    const result = applyLiveScoreOverlay(games, [], []);
    const s16 = result.find((x) => x.id === "s16-1")!;
    expect(s16.winner_team_id).toBe("tA");
  });
});

// ---------------------------------------------------------------------------
// matchLiveScoresToGames: name-based matching
// ---------------------------------------------------------------------------

describe("matchLiveScoresToGames", () => {
  function live(
    awayName: string, homeName: string,
    awayScore: number, homeScore: number,
  ): LiveOverlayScoreGame {
    return {
      id: `l-${awayName}`, state: "FINAL", detail: "Final", startTime: null,
      awayTeamId: null, homeTeamId: null,
      awayTeamName: awayName, homeTeamName: homeName,
      awayScore, homeScore,
    };
  }

  it("matches by team name, away team maps to team1Score", () => {
    const games = [g("g1", "R32", 1, "tA", "tB", null, null)];
    const teams: LiveOverlayTeam[] = [{ id: "tA", name: "Argentina" }, { id: "tB", name: "Brazil" }];
    const matched = matchLiveScoresToGames(games, teams, [live("Argentina", "Brazil", 3, 1)]);
    expect(matched.get("g1")?.team1Score).toBe(3);
    expect(matched.get("g1")?.team2Score).toBe(1);
  });

  it("matches when home/away orientation is reversed", () => {
    const games = [g("g1", "R32", 1, "tA", "tB", null, null)];
    const teams: LiveOverlayTeam[] = [{ id: "tA", name: "Argentina" }, { id: "tB", name: "Brazil" }];
    // Brazil is away, Argentina is home
    const matched = matchLiveScoresToGames(games, teams, [live("Brazil", "Argentina", 1, 3)]);
    expect(matched.get("g1")?.team1Score).toBe(3); // Argentina's score
    expect(matched.get("g1")?.team2Score).toBe(1);
  });

  it("returns empty map when no matching live game found", () => {
    const games = [g("g1", "R32", 1, "tA", "tB", null, null)];
    const teams: LiveOverlayTeam[] = [{ id: "tA", name: "Argentina" }, { id: "tB", name: "Brazil" }];
    const matched = matchLiveScoresToGames(games, teams, [live("France", "Spain", 2, 0)]);
    expect(matched.has("g1")).toBe(false);
  });
});
