import { describe, it, expect } from "vitest";
import { seedMultiplier, scoreTeamWinsDetailed, scoreEntries, type ScoringGame } from "../scoring";
import { applyWorldCupManualResultOverrides, getWorldCupManualWinnerId } from "../worldCupManualResults.js";

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
    const r = wc([{ round: "GROUP", team1_id: "t1", team2_id: "t2", winner_team_id: "t1", status: "Final" }]);
    expect(r.teamScoresByTeamId.get("t1")).toBe(6);
    expect(r.teamScoresByTeamId.has("t2")).toBe(false);
  });

  it("GROUP win with blank status still awards already-persisted winner points", () => {
    const r = wc([{ round: "GROUP", team1_id: "t1", team2_id: "t2", winner_team_id: "t1", status: null }]);
    expect(r.teamScoresByTeamId.get("t1")).toBe(6);
    expect(r.teamScoresByTeamId.has("t2")).toBe(false);
  });

  it("GROUP win with FT status awards final soccer points", () => {
    const r = wc([{ round: "GROUP", team1_id: "t1", team2_id: "t2", winner_team_id: "t1", status: "FT" }]);
    expect(r.teamScoresByTeamId.get("t1")).toBe(6);
    expect(r.teamScoresByTeamId.has("t2")).toBe(false);
  });

  it("GROUP win with non-final status awards no points", () => {
    const r = wc([{ round: "GROUP", team1_id: "t1", team2_id: "t2", winner_team_id: "t1", status: "In Progress" }]);
    expect(r.teamScoresByTeamId.size).toBe(0);
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

  it("R32: cost ≤ 5 earns the longshot schedule on group advance and R32 win", () => {
    const r = wc(
      [{ round: "R32", team1_id: "t1", team2_id: "t2", winner_team_id: "t1" }],
      costs(["t1", 5], ["t2", 5]),
    );
    expect(r.teamScoresByTeamId.get("t1")).toBe(105); // (12+25) + (18+50)
    expect(r.teamScoresByTeamId.get("t2")).toBe(37); // 12+25
  });

  it("R32: cost = 7 uses the lower value schedule", () => {
    const r = wc(
      [{ round: "R32", team1_id: "t1", team2_id: "t2", winner_team_id: "t1" }],
      costs(["t1", 7], ["t2", 22]),
    );
    expect(r.teamScoresByTeamId.get("t1")).toBe(45); // (12+5) + (18+10)
  });

  it("R32 slot 6 tie advances Egypt-side team on penalties", () => {
    const game = {
      round: "R32",
      slot: 6,
      team1_id: "australia",
      team2_id: "egypt",
      winner_team_id: null,
      status: "Final",
      team1_score: 1,
      team2_score: 1,
    };
    const r = wc([game], costs(["australia", 10], ["egypt", 7]));
    expect(getWorldCupManualWinnerId(game)).toBe("egypt");
    expect(r.teamScoresByTeamId.get("egypt")).toBe(45); // GROUP_ADVANCE + R32 win
    expect(r.teamScoresByTeamId.get("australia")).toBe(17); // GROUP_ADVANCE only
  });

  it("R32 slot 6 non-tied final uses the score winner instead of the penalty fallback", () => {
    const game = {
      round: "R32",
      slot: 6,
      team1_id: "australia",
      team2_id: "egypt",
      winner_team_id: "egypt",
      status: "Final",
      team1_score: 2,
      team2_score: 1,
    };
    const r = wc([game], costs(["australia", 10], ["egypt", 7]));
    expect(getWorldCupManualWinnerId(game)).toBe("australia");
    expect(r.teamScoresByTeamId.get("australia")).toBe(45); // GROUP_ADVANCE + R32 win
    expect(r.teamScoresByTeamId.get("egypt")).toBe(17); // GROUP_ADVANCE only
  });

  it("knockout extra-time winner advances from the official final score", () => {
    const game = {
      round: "S16",
      slot: 3,
      team1_id: "argentina",
      team2_id: "egypt",
      winner_team_id: null,
      status: "AET",
      team1_score: 2,
      team2_score: 1,
    };
    const r = wc([game], costs(["argentina", 22], ["egypt", 7]));
    expect(getWorldCupManualWinnerId(game)).toBe("argentina");
    expect(r.teamScoresByTeamId.get("argentina")).toBe(30);
  });

  it("tied knockout game uses a persisted official penalty advancer in any round", () => {
    const game = {
      round: "S16",
      slot: 3,
      team1_id: "argentina",
      team2_id: "egypt",
      winner_team_id: "egypt",
      status: "Final",
      team1_score: 1,
      team2_score: 1,
    };
    const r = wc([game], costs(["argentina", 22], ["egypt", 7]));
    expect(getWorldCupManualWinnerId(game)).toBe("egypt");
    expect(r.teamScoresByTeamId.get("egypt")).toBe(50); // S16 win + value bonus
  });

  it("S16 slot 4 tied final advances the Switzerland-side team", () => {
    const game = {
      round: "S16",
      slot: 4,
      team1_id: "switzerland",
      team2_id: "colombia",
      winner_team_id: null,
      status: "Final",
      team1_score: 0,
      team2_score: 0,
    };
    const r = wc([game], costs(["switzerland", 22], ["colombia", 7]));
    expect(getWorldCupManualWinnerId(game)).toBe("switzerland");
    expect(r.teamScoresByTeamId.get("switzerland")).toBe(30);
    expect(r.teamScoresByTeamId.has("colombia")).toBe(false);
  });

  it("manual R32 slot 6 winner propagates into S16 slot 3", () => {
    const games = applyWorldCupManualResultOverrides([
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
      {
        round: "S16",
        slot: 3,
        team1_id: "argentina",
        team2_id: null,
        winner_team_id: null,
      },
    ]) as ScoringGame[];
    expect(games.find((game) => game.round === "R32")?.winner_team_id).toBe("egypt");
    expect(games.find((game) => game.round === "S16")?.team2_id).toBe("egypt");
  });

  it("manual F4 winners propagate into the championship game", () => {
    const games = applyWorldCupManualResultOverrides([
      {
        round: "F4",
        slot: 1,
        team1_id: "spain",
        team2_id: "england",
        winner_team_id: "spain",
        status: "Final",
        team1_score: 2,
        team2_score: 0,
      },
      {
        round: "F4",
        slot: 2,
        team1_id: "france",
        team2_id: "morocco",
        winner_team_id: "morocco",
        status: "Final",
        team1_score: 0,
        team2_score: 1,
      },
      {
        round: "CHIP",
        slot: 1,
        team1_id: null,
        team2_id: null,
        winner_team_id: null,
      },
    ]) as ScoringGame[];

    const championship = games.find((game) => game.round === "CHIP");
    expect(championship?.team1_id).toBe("spain");
    expect(championship?.team2_id).toBe("morocco");
  });

  it("R32: cost = 10 uses the lower value schedule", () => {
    const r = wc(
      [{ round: "R32", team1_id: "t1", team2_id: "t2", winner_team_id: "t1" }],
      costs(["t1", 10], ["t2", 22]),
    );
    expect(r.teamScoresByTeamId.get("t1")).toBe(45); // (12+5) + (18+10)
  });

  it("R32: cost = 11 earns no value bonus", () => {
    const r = wc(
      [{ round: "R32", team1_id: "t1", team2_id: "t2", winner_team_id: "t1" }],
      costs(["t1", 11], ["t2", 22]),
    );
    expect(r.teamScoresByTeamId.get("t1")).toBe(30); // 12 + 18 only
  });

  // Knockout round points
  it("S16 win: 30 pts base; cost <= 10 adds 20 pts value bonus", () => {
    const r = wc(
      [{ round: "S16", team1_id: "t1", team2_id: "t2", winner_team_id: "t1" }],
      costs(["t1", 7], ["t2", 22]),
    );
    // No GROUP_ADVANCE (team didn't appear in R32 in this test data)
    expect(r.teamScoresByTeamId.get("t1")).toBe(50); // 30 + 20
  });

  it("E8 win: 48 pts base; cost <= 10 adds 40 pts value bonus", () => {
    const r = wc(
      [{ round: "E8", team1_id: "t1", team2_id: "t2", winner_team_id: "t1" }],
      costs(["t1", 7], ["t2", 22]),
    );
    expect(r.teamScoresByTeamId.get("t1")).toBe(88); // 48 + 40
  });

  it("F4 win: 72 pts base; cost <= 10 adds 80 pts value bonus", () => {
    const r = wc(
      [{ round: "F4", team1_id: "t1", team2_id: "t2", winner_team_id: "t1" }],
      costs(["t1", 7], ["t2", 22]),
    );
    expect(r.teamScoresByTeamId.get("t1")).toBe(152); // 72 + 80
  });

  it("third-place bronze game does not award World Cup points", () => {
    const r = wc(
      [
        {
          round: "F4",
          slot: 3,
          team1_id: "england",
          team2_id: "france",
          winner_team_id: "france",
          status: "Final",
          team1_score: 1,
          team2_score: 2,
        },
        {
          round: "THIRD_PLACE",
          slot: 1,
          team1_id: "england",
          team2_id: "france",
          winner_team_id: "france",
          status: "Final",
          team1_score: 1,
          team2_score: 2,
        },
      ],
      costs(["england", 22], ["france", 22]),
    );
    expect(r.teamScoresByTeamId.size).toBe(0);
  });

  it("CHIP win: 100 pts base; cost <= 10 adds 160 pts value bonus", () => {
    const r = wc(
      [{ round: "CHIP", team1_id: "t1", team2_id: "t2", winner_team_id: "t1" }],
      costs(["t1", 7], ["t2", 22]),
    );
    expect(r.teamScoresByTeamId.get("t1")).toBe(260); // 100 + 160
  });

  // Full run from group to champion
  it("full run with cost=5: 880 total pts across all stages", () => {
    // GROUP_ADVANCE 37 + R32 68 + S16 105 + E8 148 + F4 222 + CHIP 300 = 880
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
    expect(r.teamScoresByTeamId.get("t1")).toBe(880);
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
        { round: "GROUP", team1_id: "t1", team2_id: "tA", winner_team_id: "t1", status: "Final" },
        { round: "GROUP", team1_id: "t1", team2_id: "tB", winner_team_id: "t1", status: "Final" },
        { round: "GROUP", team1_id: "t1", team2_id: "tC", winner_team_id: "t1", status: "Final" },
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

  it("entry standings ignore the England-France third-place game", () => {
    const r = wce(
      [
        {
          round: "F4",
          slot: 3,
          team1_id: "england",
          team2_id: "france",
          winner_team_id: "france",
          status: "Final",
          team1_score: 1,
          team2_score: 2,
        },
      ],
      new Map([
        ["england-entry", ["england"]],
        ["france-entry", ["france"]],
      ]),
      costs(["england", 22], ["france", 22]),
    );
    expect(r.totalScoreByEntryId.get("england-entry")).toBe(0);
    expect(r.totalScoreByEntryId.get("france-entry")).toBe(0);
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
