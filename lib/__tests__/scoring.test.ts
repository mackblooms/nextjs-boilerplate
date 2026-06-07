import { describe, it, expect } from "vitest";
import { seedMultiplier, scoreTeamWinsDetailed, scoreEntries, type ScoringGame } from "../scoring";

function costs(...pairs: Array<[string, number | null]>): Map<string, number | null> {
  return new Map(pairs);
}

// ---------------------------------------------------------------------------
// seedMultiplier — shared utility used by both competitions
// ---------------------------------------------------------------------------

describe("seedMultiplier", () => {
  it("seed 1 → 1.0", () => expect(seedMultiplier(1)).toBe(1.0));
  it("seed 8 → 1.245", () => expect(seedMultiplier(8)).toBeCloseTo(1.245));
  it("seed 16 → 1.525", () => expect(seedMultiplier(16)).toBeCloseTo(1.525));
  it("null → 1", () => expect(seedMultiplier(null)).toBe(1));
});

// ---------------------------------------------------------------------------
// scoreTeamWinsDetailed — World Cup
// ---------------------------------------------------------------------------

describe("scoreTeamWinsDetailed (world-cup)", () => {
  function wc(games: ScoringGame[], costMap?: Map<string, number | null>) {
    return scoreTeamWinsDetailed(games, new Map(), {
      competitionSlug: "world-cup",
      teamCostById: costMap,
    });
  }

  // GROUP stage
  it("GROUP win awards 6 pts to winner only", () => {
    const r = wc([{ round: "GROUP", team1_id: "t1", team2_id: "t2", winner_team_id: "t1" }]);
    expect(r.teamScoresByTeamId.get("t1")).toBe(6);
    expect(r.teamScoresByTeamId.has("t2")).toBe(false);
  });

  it("GROUP draw (Final, equal scores) awards 2 pts to each team", () => {
    const r = wc([{
      round: "GROUP", team1_id: "t1", team2_id: "t2",
      winner_team_id: null, status: "Final", team1_score: 1, team2_score: 1,
    }]);
    expect(r.teamScoresByTeamId.get("t1")).toBe(2);
    expect(r.teamScoresByTeamId.get("t2")).toBe(2);
  });

  it("GROUP draw with non-final status awards no points", () => {
    const r = wc([{
      round: "GROUP", team1_id: "t1", team2_id: "t2",
      winner_team_id: null, status: "Scheduled", team1_score: 0, team2_score: 0,
    }]);
    expect(r.teamScoresByTeamId.size).toBe(0);
  });

  it("GROUP game with no winner and no score data awards no points", () => {
    const r = wc([{ round: "GROUP", team1_id: "t1", team2_id: "t2", winner_team_id: null }]);
    expect(r.teamScoresByTeamId.size).toBe(0);
  });

  // GROUP_ADVANCE (awarded when a team first appears in an R32 game)
  it("R32: both teams get GROUP_ADVANCE (12 pts), winner also gets R32 win (18 pts)", () => {
    const r = wc(
      [{ round: "R32", team1_id: "t1", team2_id: "t2", winner_team_id: "t1" }],
      costs(["t1", 22], ["t2", 22]),
    );
    expect(r.teamScoresByTeamId.get("t1")).toBe(30); // 12 + 18
    expect(r.teamScoresByTeamId.get("t2")).toBe(12); // GROUP_ADVANCE only
  });

  it("R32: cost ≤ 5 earns +6 breakout bonus on GROUP_ADVANCE (18 total)", () => {
    const r = wc(
      [{ round: "R32", team1_id: "t1", team2_id: "t2", winner_team_id: "t1" }],
      costs(["t1", 5], ["t2", 5]),
    );
    expect(r.teamScoresByTeamId.get("t1")).toBe(40); // (12+6) + (18+4)
    expect(r.teamScoresByTeamId.get("t2")).toBe(18); // 12+6
  });

  it("R32: cost = 7 (> 5) gets no breakout bonus, but cost < 10 still earns value run", () => {
    const r = wc(
      [{ round: "R32", team1_id: "t1", team2_id: "t2", winner_team_id: "t1" }],
      costs(["t1", 7], ["t2", 22]),
    );
    expect(r.teamScoresByTeamId.get("t1")).toBe(34); // 12 + (18+4)
  });

  it("R32: cost = 10 (not < 10) earns no value run bonus", () => {
    const r = wc(
      [{ round: "R32", team1_id: "t1", team2_id: "t2", winner_team_id: "t1" }],
      costs(["t1", 10], ["t2", 22]),
    );
    expect(r.teamScoresByTeamId.get("t1")).toBe(30); // 12 + 18 only
  });

  // Knockout round points
  it("S16 win: 30 pts base; cost < 10 adds 8 pts value run", () => {
    const r = wc(
      [{ round: "S16", team1_id: "t1", team2_id: "t2", winner_team_id: "t1" }],
      costs(["t1", 7], ["t2", 22]),
    );
    // No GROUP_ADVANCE (team didn't appear in R32 in this test data)
    expect(r.teamScoresByTeamId.get("t1")).toBe(38); // 30 + 8
  });

  it("E8 win: 48 pts base; cost < 10 adds 14 pts value run", () => {
    const r = wc(
      [{ round: "E8", team1_id: "t1", team2_id: "t2", winner_team_id: "t1" }],
      costs(["t1", 7], ["t2", 22]),
    );
    expect(r.teamScoresByTeamId.get("t1")).toBe(62); // 48 + 14
  });

  it("F4 win: 72 pts base; cost < 10 adds 21 pts value run", () => {
    const r = wc(
      [{ round: "F4", team1_id: "t1", team2_id: "t2", winner_team_id: "t1" }],
      costs(["t1", 7], ["t2", 22]),
    );
    expect(r.teamScoresByTeamId.get("t1")).toBe(93); // 72 + 21
  });

  it("CHIP win: 100 pts base; cost < 10 adds 30 pts value run", () => {
    const r = wc(
      [{ round: "CHIP", team1_id: "t1", team2_id: "t2", winner_team_id: "t1" }],
      costs(["t1", 7], ["t2", 22]),
    );
    expect(r.teamScoresByTeamId.get("t1")).toBe(130); // 100 + 30
  });

  // Full run from group to champion
  it("full run with cost=5: 363 total pts across all stages", () => {
    // GROUP_ADVANCE 18 + R32 22 + S16 38 + E8 62 + F4 93 + CHIP 130 = 363
    const r = wc(
      [
        { round: "R32",  team1_id: "t1", team2_id: "t2", winner_team_id: "t1" },
        { round: "S16",  team1_id: "t1", team2_id: "t3", winner_team_id: "t1" },
        { round: "E8",   team1_id: "t1", team2_id: "t4", winner_team_id: "t1" },
        { round: "F4",   team1_id: "t1", team2_id: "t5", winner_team_id: "t1" },
        { round: "CHIP", team1_id: "t1", team2_id: "t6", winner_team_id: "t1" },
      ],
      costs(["t1", 5], ["t2", 22], ["t3", 22], ["t4", 22], ["t5", 22], ["t6", 22]),
    );
    expect(r.teamScoresByTeamId.get("t1")).toBe(363);
  });

  it("full run with cost=22 (no bonuses): 12+18+30+48+72+100 = 280 total pts", () => {
    const r = wc(
      [
        { round: "R32",  team1_id: "t1", team2_id: "t2", winner_team_id: "t1" },
        { round: "S16",  team1_id: "t1", team2_id: "t3", winner_team_id: "t1" },
        { round: "E8",   team1_id: "t1", team2_id: "t4", winner_team_id: "t1" },
        { round: "F4",   team1_id: "t1", team2_id: "t5", winner_team_id: "t1" },
        { round: "CHIP", team1_id: "t1", team2_id: "t6", winner_team_id: "t1" },
      ],
      costs(["t1", 22], ["t2", 22], ["t3", 22], ["t4", 22], ["t5", 22], ["t6", 22]),
    );
    expect(r.teamScoresByTeamId.get("t1")).toBe(280);
  });

  it("GROUP_ADVANCE is only awarded once per team even in duplicate R32 data", () => {
    const r = wc(
      [
        { round: "R32", team1_id: "t1", team2_id: "t2", winner_team_id: "t1" },
        { round: "R32", team1_id: "t1", team2_id: "t3", winner_team_id: "t1" },
      ],
      costs(["t1", 22], ["t2", 22], ["t3", 22]),
    );
    const events = r.eventsByTeamId.get("t1") ?? [];
    expect(events.filter((e) => e.round === "GROUP_ADVANCE").length).toBe(1);
  });

  it("accumulated GROUP + knockout points are summed correctly", () => {
    // 3 group wins (6 each) + R32 GROUP_ADVANCE + R32 win
    const r = wc(
      [
        { round: "GROUP", team1_id: "t1", team2_id: "tA", winner_team_id: "t1" },
        { round: "GROUP", team1_id: "t1", team2_id: "tB", winner_team_id: "t1" },
        { round: "GROUP", team1_id: "t1", team2_id: "tC", winner_team_id: "t1" },
        { round: "R32",   team1_id: "t1", team2_id: "t2", winner_team_id: "t1" },
      ],
      costs(["t1", 22], ["t2", 22], ["tA", 22], ["tB", 22], ["tC", 22]),
    );
    // 6+6+6 + 12 + 18 = 48
    expect(r.teamScoresByTeamId.get("t1")).toBe(48);
  });
});

// ---------------------------------------------------------------------------
// scoreEntries — World Cup
// ---------------------------------------------------------------------------

describe("scoreEntries (world-cup)", () => {
  function wce(
    games: ScoringGame[],
    picks: Map<string, string[]>,
    costMap?: Map<string, number | null>,
  ) {
    return scoreEntries(games, new Map(), picks, {
      competitionSlug: "world-cup",
      teamCostById: costMap,
    });
  }

  it("entry earns points for team wins", () => {
    const r = wce(
      [{ round: "R32", team1_id: "t1", team2_id: "t2", winner_team_id: "t1" }],
      new Map([["e1", ["t1"]]]),
      costs(["t1", 22], ["t2", 22]),
    );
    expect(r.totalScoreByEntryId.get("e1")).toBe(30); // GROUP_ADVANCE 12 + R32 win 18
  });

  it("entry earns 0 for a team that did not win any games", () => {
    const r = wce(
      [{ round: "R32", team1_id: "t1", team2_id: "t2", winner_team_id: "t1" }],
      new Map([["e1", ["t2"]]]),
      costs(["t1", 22], ["t2", 22]),
    );
    expect(r.totalScoreByEntryId.get("e1")).toBe(12); // t2 still got GROUP_ADVANCE
  });

  it("no perfect R64 bonus for world-cup (always 0)", () => {
    const r = wce(
      [{ round: "R32", team1_id: "t1", team2_id: "t2", winner_team_id: "t1" }],
      new Map([["e1", ["t1"]]]),
    );
    expect(r.perfectR64BonusByEntryId.get("e1")).toBe(0);
  });

  it("duplicate picks are deduplicated", () => {
    const r = wce(
      [{ round: "R32", team1_id: "t1", team2_id: "t2", winner_team_id: "t1" }],
      new Map([["e1", ["t1", "t1", "t1"]]]),
      costs(["t1", 22], ["t2", 22]),
    );
    expect(r.totalScoreByEntryId.get("e1")).toBe(30);
  });

  it("two entries accumulate independently", () => {
    const r = wce(
      [{ round: "R32", team1_id: "t1", team2_id: "t2", winner_team_id: "t1" }],
      new Map([["e1", ["t1"]], ["e2", ["t2"]]]),
      costs(["t1", 22], ["t2", 22]),
    );
    expect(r.totalScoreByEntryId.get("e1")).toBe(30); // GROUP_ADVANCE + R32 win
    expect(r.totalScoreByEntryId.get("e2")).toBe(12); // GROUP_ADVANCE only
  });
});
