import { describe, expect, it } from "vitest";
import { LEGACY_SEASON_PRICING_VERSION, canCompleteSeasonSquad, getSeasonBand, legalSeasonCompositions, parseSeasonDraft, seasonPickBlockReason, seasonPricing, seasonSquadProgress, seasonSquadSummary } from "../cbbSeason";
import { seasonTeams } from "../cbbSeasonTeams";
import audit from "@/data/cbb-season/torvik-2027-fixed15-audit.json";

const groups = seasonPricing.bands.map((_, i) => seasonTeams.filter(t => t.bandIndex === i));
const picks = (counts: number[]) => counts.flatMap((n, i) => groups[i].slice(0, n));

describe("college basketball season preview", () => {
  it("tracks actual finish ranges instead of the general band caps", () => {
    const progress = seasonSquadProgress([], seasonTeams);
    expect(progress.options).toHaveLength(4);
    expect(progress.bands.map(b => [b.finishMin, b.finishMax])).toEqual([[0, 3], [1, 5], [4, 6], [5, 6]]);
    expect(progress.options.every(counts => counts.reduce((sum, n) => sum + n, 0) === 15)).toBe(true);
  });

  it("shows exact teams still needed once picks determine a single 15-team mix", () => {
    const progress = seasonSquadProgress(picks([3, 1, 2, 2]), seasonTeams);
    expect(progress.options).toEqual([[3, 1, 5, 6]]);
    expect(progress.bands.map(b => [b.addMin, b.addMax, b.remove])).toEqual([[0, 0, 0], [0, 0, 0], [3, 3, 0], [4, 4, 0]]);
    expect(progress.bands.reduce((sum, b) => sum + b.addMin!, 0)).toBe(7);
    const complete = seasonSquadProgress(picks([3, 1, 5, 6]), seasonTeams);
    expect(complete.bands.every(b => b.addMax === 0 && b.remove === 0)).toBe(true);
  });

  it("suggests a complete legal mix with removals when the current mix needs repair", () => {
    const selected = picks([3, 2, 0, 0]);
    const progress = seasonSquadProgress(selected, seasonTeams);
    expect(progress.options).toEqual([]);
    expect(legalSeasonCompositions()).toContainEqual(progress.suggested);
    expect(progress.bands.reduce((sum, b) => sum + b.remove, 0)).toBe(1);
    expect(selected.length + progress.bands.reduce((sum, b) => sum + b.addMin! - b.remove, 0)).toBe(15);
  });

  it("uses the reviewed rebalance model and all 365 source teams", () => {
    expect(seasonPricing.squadSize).toBe(15);
    expect(seasonPricing.bands.map(b => b.cost)).toEqual(audit.prices);
    expect(seasonPricing.bands.map(b => b.min)).toEqual(audit.min);
    expect(seasonPricing.bands.map(b => b.max)).toEqual(audit.max);
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
    expect(compositions).toHaveLength(4);
    expect(compositions).toEqual(expect.arrayContaining(audit.shapes.map(s => s.counts)));
    for (const counts of compositions) {
      const squad = picks(counts);
      expect(squad).toHaveLength(15);
      for (let i = 0; i < squad.length; i++) {
        expect(canCompleteSeasonSquad(squad.slice(0, i), seasonTeams)).toBe(true);
        expect(seasonPickBlockReason(squad[i], squad.slice(0, i))).toBeNull();
      }
      expect(seasonSquadSummary(squad).spent).toBe(100);
      expect(seasonSquadSummary(squad).complete).toBe(true);
    }
  });

  it("allows affordable picks that need a later swap, while detecting the unfinished mix", () => {
    const selected = picks([1, 4, 0, 0]);
    expect(canCompleteSeasonSquad(selected, seasonTeams)).toBe(true);
    expect(seasonPickBlockReason(groups[1][4], selected)).toBeNull();
    expect(canCompleteSeasonSquad([...selected, groups[1][4]], seasonTeams)).toBe(false);
    expect(seasonSquadSummary([...selected, groups[1][4]]).complete).toBe(false);
  });

  it("allows a second Contender alongside three Elite picks with points left", () => {
    const selected = picks([3, 1, 0, 0]);
    expect(seasonSquadSummary(selected).remaining).toBe(54);
    expect(seasonPickBlockReason(groups[1][1], selected)).toBeNull();
    const updated = [...selected, groups[1][1]];
    expect(seasonSquadSummary(updated).remaining).toBe(44);
    expect(canCompleteSeasonSquad(updated, seasonTeams)).toBe(false);
    expect(seasonSquadSummary(updated).complete).toBe(false);
  });

  it("checks cap, budget, and available distinct teams", () => {
    expect(seasonPickBlockReason(groups[0][3], picks([3, 0, 0, 0]))).toContain("limit reached");
    expect(seasonPickBlockReason(groups[1][2], picks([3, 2, 4, 5]))).toContain("Not enough points");
    expect(canCompleteSeasonSquad([], seasonTeams.filter(t => t.bandIndex !== 3))).toBe(false);
    expect(canCompleteSeasonSquad([groups[0][0], groups[0][0]], seasonTeams)).toBe(false);
  });

  it("requires exactly 15 teams and blocks the sixteenth without blocking removal", () => {
    const full = picks([0, 5, 5, 5]);
    expect(seasonSquadSummary(full).complete).toBe(true);
    expect(seasonPickBlockReason(groups[0][0], full)).toContain("15-team squad is full");
    expect(seasonPickBlockReason(full[0], full)).toBeNull();
    expect(seasonSquadSummary(full.slice(0, 14)).complete).toBe(false);
    expect(seasonSquadSummary(picks([3, 2, 4, 5])).spent).toBe(100);
    expect(seasonSquadSummary(picks([3, 2, 4, 5])).complete).toBe(false);
    expect(seasonSquadSummary(picks([1, 3, 5, 7])).spent).toBe(100);
    expect(seasonSquadSummary(picks([1, 3, 5, 7])).complete).toBe(false);
  });

  it("preserves valid old 18-team picks for adjustment after repricing", () => {
    const old = { version: LEGACY_SEASON_PRICING_VERSION, name: "Existing squad", teamIds: picks([0, 6, 4, 8]).map(t => t.id) };
    const migrated = parseSeasonDraft(JSON.stringify(old), seasonTeams);
    expect(migrated.teamIds).toEqual(old.teamIds);
    expect(migrated.version).toBe(seasonPricing.version);
    expect(seasonSquadSummary(picks([0, 6, 4, 8])).remaining).toBe(-16);
    expect(seasonSquadSummary(picks([0, 6, 4, 8])).complete).toBe(false);
    expect(() => parseSeasonDraft(JSON.stringify({ ...migrated }), seasonTeams)).toThrow();
  });

  it("pools records instead of averaging team percentages", () => {
    const a = { ...groups[0][0], projectedWins: 8, projectedLosses: 2 };
    const b = { ...groups[1][0], projectedWins: 12, projectedLosses: 18 };
    expect(seasonSquadSummary([a, b]).percentage).toBe(.5);
    expect(seasonSquadSummary([]).percentage).toBeNull();
  });

  it("restores drafts needing a swap and rejects stale, unknown, duplicate, over-budget or over-cap picks", () => {
    const draft = { version: seasonPricing.version, name: "My squad", teamIds: picks([1, 0, 0, 0]).map(t => t.id) };
    expect(parseSeasonDraft(JSON.stringify(draft), seasonTeams)).toEqual(draft);
    const needsSwap = { ...draft, teamIds: picks([3, 2, 0, 0]).map(t => t.id) };
    expect(parseSeasonDraft(JSON.stringify(needsSwap), seasonTeams)).toEqual(needsSwap);
    for (const invalid of [
      { ...draft, version: "old" }, { ...draft, teamIds: ["unknown"] },
      { ...draft, teamIds: [draft.teamIds[0], draft.teamIds[0]] },
      { ...draft, teamIds: picks([3, 6, 4, 5]).map(t => t.id) },
      { ...draft, teamIds: picks([4, 0, 0, 0]).map(t => t.id) }, null,
      { ...draft, teamIds: picks([1, 3, 5, 7]).map(t => t.id) },
    ]) expect(() => parseSeasonDraft(JSON.stringify(invalid), seasonTeams)).toThrow();
    expect(() => parseSeasonDraft("not json", seasonTeams)).toThrow();
  });
});
