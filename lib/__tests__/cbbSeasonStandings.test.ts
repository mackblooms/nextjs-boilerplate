import { describe, expect, it } from "vitest";
import { calculateSeasonStandings, rankSeasonRecords, seasonDayKey, seasonGameScenario, seasonGameState, seasonTeamRecords, type SeasonGame, type SeasonSquad } from "../cbbSeasonStandings";
import { createSeasonStandingsDemo, demoDayEnd } from "../cbbSeasonDemo";
import { seasonTeams } from "../cbbSeasonTeams";
import { seasonSquadSummary } from "../cbbSeason";

const asOf = "2026-11-10T23:00:00Z";
const game = (id: string, overrides: Partial<SeasonGame> = {}): SeasonGame => ({ id, season: "2026-27", phase: "regular", startsAt: "2026-11-09T20:00:00Z", completedAt: "2026-11-09T22:00:00Z", status: "final", awayTeamId: "a", homeTeamId: "b", awayName: "A", homeName: "B", awayScore: 80, homeScore: 70, ...overrides });
const squad = (id: string, teamIds: string[]): SeasonSquad => ({ id, name: id, owner: "Sample", teamIds });

describe("season standings and metrics", () => {
  it("shares exact-fraction ranks, leaves unplayed squads unranked, and ignores display rounding", () => {
    const tied = rankSeasonRecords([{ id: "a", wins: 1, losses: 1 }, { id: "b", wins: 2, losses: 2 }, { id: "c", wins: 1, losses: 3 }, { id: "d", wins: 0, losses: 0 }]);
    expect(tied.map(r => r.rank)).toEqual([1, 1, 3, null]);
    const close = rankSeasonRecords([{ id: "worse", wins: 60000, losses: 40000 }, { id: "better", wins: 60001, losses: 39999 }]);
    expect(close.map(r => [r.id, r.rank])).toEqual([["better", 1], ["worse", 2]]);
  });

  it("pools every owned result, including both opponents and non-DI games", () => {
    const squads = [squad("both", ["a", "b"]), squad("non-di", ["c"])];
    const games = [game("one"), game("non-di", { awayTeamId: "c", homeTeamId: "non-di-opponent" })];
    const result = calculateSeasonStandings(squads, games, asOf);
    expect(result.rows.find(r => r.id === "both")).toMatchObject({ wins: 1, losses: 1, percentage: .5 });
    expect(result.rows.find(r => r.id === "non-di")).toMatchObject({ wins: 1, losses: 0 });
    expect(seasonTeamRecords(["a", "b"], games, asOf)).toEqual([{ id: "a", wins: 1, losses: 0 }, { id: "b", wins: 0, losses: 1 }]);
  });

  it("includes conference tournaments but excludes exhibitions, later postseason and other seasons", () => {
    const games = [game("regular"), game("conference", { phase: "conference-tournament" }), game("ncaa", { phase: "ncaa-tournament" }), game("other", { phase: "other-postseason" }), game("exhibition", { phase: "exhibition" }), game("wrong-year", { season: "2025-26" })];
    expect(calculateSeasonStandings([squad("one", ["a"])], games, asOf).rows[0].wins).toBe(2);
  });

  it("never counts live, upcoming, canceled or invalid final scores", () => {
    const games = [game("live", { status: "live" }), game("scheduled", { status: "scheduled" }), game("canceled", { status: "canceled" }), game("future", { completedAt: "2026-11-12T22:00:00Z" }), game("tied", { awayScore: 70 }), game("bad", { winnerTeamId: "not-playing" })];
    const result = calculateSeasonStandings([squad("one", ["a"])], games, asOf);
    expect(result.rows[0]).toMatchObject({ wins: 0, losses: 0, rank: null });
    expect(result.unscoredFinalIds.sort()).toEqual(["bad", "tied"]);
  });

  it("uses Chicago completion dates and a seven-calendar-day window", () => {
    const cutoff = "2026-11-10T07:00:00Z";
    const games = [game("last-night", { completedAt: "2026-11-10T05:30:00Z" }), game("today", { completedAt: "2026-11-10T06:30:00Z" }), game("week-start", { completedAt: "2026-11-04T06:30:00Z" }), game("outside-week", { completedAt: "2026-11-04T05:30:00Z" })];
    expect(seasonDayKey(games[0].completedAt!)).toBe("2026-11-09");
    const row = calculateSeasonStandings([squad("one", ["a"])], games, cutoff).rows[0];
    expect(row.today).toEqual({ wins: 1, losses: 0 });
    expect(row.week).toEqual({ wins: 3, losses: 0 });
    expect(row.wins).toBe(4);
  });

  it("measures rank movement from before today's finals and does not fabricate an initial rise", () => {
    const games = [game("prior"), game("flip", { awayScore: 60, homeScore: 80, completedAt: "2026-11-10T22:00:00Z" })];
    const result = calculateSeasonStandings([squad("a", ["a"]), squad("b", ["b"])], games, asOf);
    expect(result.rows.find(r => r.id === "b")).toMatchObject({ rank: 1, previousRank: 2, movement: 1 });
    expect(calculateSeasonStandings([squad("a", ["a"])], [game("first", { completedAt: asOf })], asOf).rows[0].movement).toBeNull();
  });

  it("updates all shared owners in a game scenario, with both-team squads getting 1-1", () => {
    const squads = [squad("first-a", ["a"]), squad("second-a", ["a"]), squad("b", ["b"]), squad("both", ["a", "b"])];
    const rows = calculateSeasonStandings(squads, [], asOf).rows;
    const simulated = seasonGameScenario(rows, game("next"), "a");
    expect(simulated.find(r => r.id === "first-a")).toMatchObject({ wins: 1, losses: 0, rank: 1 });
    expect(simulated.find(r => r.id === "second-a")).toMatchObject({ wins: 1, losses: 0, rank: 1 });
    expect(simulated.find(r => r.id === "both")).toMatchObject({ wins: 1, losses: 1, rank: 3 });
    expect(simulated.find(r => r.id === "b")).toMatchObject({ wins: 0, losses: 1, rank: 4 });
    expect(rows.every(r => r.wins === 0 && r.losses === 0)).toBe(true);
  });

  it("shows known future sample finals as pending until their completion time", () => {
    const fixture = game("sample", { startsAt: "2026-11-10T20:00:00Z", completedAt: "2026-11-10T22:00:00Z" });
    expect(seasonGameState(fixture, "2026-11-10T19:00:00Z")).toBe("scheduled");
    expect(seasonGameState(fixture, "2026-11-10T21:00:00Z")).toBe("live");
    expect(seasonGameState(fixture, "2026-11-10T22:00:00Z")).toBe("final");
  });

  it("rejects duplicated games and duplicated team picks instead of double-counting", () => {
    expect(() => calculateSeasonStandings([squad("one", ["a"])], [game("same"), game("same")], asOf)).toThrow("Duplicate game");
    expect(() => calculateSeasonStandings([squad("one", ["a", "a"])], [], asOf)).toThrow("Duplicate team");
  });

  it("generates deterministic legal 15-team samples and fictional games covering every team", () => {
    const demo = createSeasonStandingsDemo(seasonTeams);
    expect(createSeasonStandingsDemo(seasonTeams)).toEqual(demo);
    for (const s of demo.squads) expect(seasonSquadSummary(s.teamIds.map(id => seasonTeams.find(t => t.id === id)!)).complete).toBe(true);
    const covered = new Set(demo.games.flatMap(g => [g.homeTeamId, g.awayTeamId]));
    expect(seasonTeams.every(t => covered.has(t.id))).toBe(true);
    const result = calculateSeasonStandings(demo.squads, demo.games, demoDayEnd(17));
    expect(result.unscoredFinalIds).toEqual([]);
    expect(result.rows.every(r => r.rank !== null)).toBe(true);
  });
});
