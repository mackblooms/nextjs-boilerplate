import { describe, expect, it } from "vitest";
import { canCompleteSeasonSquad, getSeasonBand, legalSeasonCompositions, parseSeasonDraft, seasonPickBlockReason, seasonPricing, seasonSquadSummary } from "../cbbSeason";
import { seasonTeams } from "../cbbSeasonTeams";
import audit from "@/data/cbb-season/torvik-2027-balance-audit.json";

const groups = seasonPricing.bands.map((_, i) => seasonTeams.filter(t => t.bandIndex === i));
const picks = (counts: number[]) => counts.flatMap((n, i) => groups[i].slice(0, n));

describe("college basketball season preview", () => {
  it("uses the reviewed rebalance model and all 365 source teams", () => {
    expect(seasonPricing.bands.map(b => b.cost)).toEqual(audit.recommended.prices);
    expect(seasonPricing.bands.map(b => b.min)).toEqual(audit.recommended.min);
    expect(seasonPricing.bands.map(b => b.max)).toEqual(audit.recommended.max);
    expect(seasonPricing.bands.map(b => b.minimumPercentage)).toEqual(audit.cutoffs);
    expect(seasonTeams).toHaveLength(365);
    expect(new Set(seasonTeams.map(t => t.id)).size).toBe(365);
    expect(groups.map(g => g.length)).toEqual([15, 77, 132, 141]);
    expect(getSeasonBand(24, 8)).toBe(0);
    expect(getSeasonBand(20, 12)).toBe(1);
    expect(getSeasonBand(16, 16)).toBe(2);
    expect(getSeasonBand(15, 17)).toBe(3);
  });

  it("allows every prefix of every reviewed 100-point composition", () => {
    const compositions = legalSeasonCompositions();
    expect(compositions).toHaveLength(11);
    expect(compositions).toEqual(expect.arrayContaining(audit.recommended.shapes.map(s => s.counts)));
    for (const counts of compositions) {
      const squad = picks(counts);
      expect(squad.length).toBeGreaterThanOrEqual(15);
      expect(squad.length).toBeLessThanOrEqual(18);
      for (let i = 0; i < squad.length; i++) {
        expect(canCompleteSeasonSquad(squad.slice(0, i), seasonTeams)).toBe(true);
        expect(seasonPickBlockReason(squad[i], squad.slice(0, i), seasonTeams)).toBeNull();
      }
      expect(seasonSquadSummary(squad).spent).toBe(100);
      expect(seasonSquadSummary(squad).complete).toBe(true);
    }
  });

  it("blocks a pick that leaves an impossible exact budget, even when minimum costs fit", () => {
    // Two Elite and four Contenders cost 56; the required Value/Long shots cost
    // at least 43, but no legal purchase can use the leftover single point.
    const selected = picks([2, 3, 0, 0]);
    expect(canCompleteSeasonSquad(selected, seasonTeams)).toBe(true);
    expect(seasonPickBlockReason(groups[1][3], selected, seasonTeams)).toContain("prevent a legal 100-point squad");
  });

  it("checks cap, budget, and available distinct teams", () => {
    expect(seasonPickBlockReason(groups[0][3], picks([3, 0, 0, 0]), seasonTeams)).toContain("limit reached");
    expect(seasonPickBlockReason(groups[1][0], picks([3, 0, 7, 5]), seasonTeams)).toContain("Not enough points");
    expect(canCompleteSeasonSquad([], seasonTeams.filter(t => t.bandIndex !== 3))).toBe(false);
    expect(canCompleteSeasonSquad([groups[0][0], groups[0][0]], seasonTeams)).toBe(false);
  });

  it("pools records instead of averaging team percentages", () => {
    const a = { ...groups[0][0], projectedWins: 8, projectedLosses: 2 };
    const b = { ...groups[1][0], projectedWins: 12, projectedLosses: 18 };
    expect(seasonSquadSummary([a, b]).percentage).toBe(.5);
    expect(seasonSquadSummary([]).percentage).toBeNull();
  });

  it("restores partial drafts and rejects stale, unknown, duplicate or impossible picks", () => {
    const draft = { version: seasonPricing.version, name: "My squad", teamIds: picks([1, 0, 0, 0]).map(t => t.id) };
    expect(parseSeasonDraft(JSON.stringify(draft), seasonTeams)).toEqual(draft);
    for (const invalid of [
      { ...draft, version: "old" }, { ...draft, teamIds: ["unknown"] },
      { ...draft, teamIds: [draft.teamIds[0], draft.teamIds[0]] },
      { ...draft, teamIds: picks([2, 4, 0, 0]).map(t => t.id) }, null,
    ]) expect(() => parseSeasonDraft(JSON.stringify(invalid), seasonTeams)).toThrow();
    expect(() => parseSeasonDraft("not json", seasonTeams)).toThrow();
  });
});
