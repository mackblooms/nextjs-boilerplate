import { describe, expect, it } from 'vitest';
import { strongestSquad } from './cbb-season-pricing-model.mjs';

describe('projected squad optimization', () => {
  it('matches exhaustive selection with unequal game counts, instead of averaging team percentages', () => {
    const teams = [
      { team: 'Short strong', projectedWins: 8, projectedLosses: 2, bandIndex: 0 },
      { team: 'Long strong', projectedWins: 21, projectedLosses: 9, bandIndex: 0 },
      { team: 'Short weak', projectedWins: 3, projectedLosses: 7, bandIndex: 1 },
      { team: 'Long weak', projectedWins: 12, projectedLosses: 18, bandIndex: 1 },
    ].map((t, rank) => ({ ...t, rank, games: t.projectedWins + t.projectedLosses }));
    const possible = teams.filter(t => t.bandIndex === 0).flatMap(a => teams.filter(t => t.bandIndex === 1)
      .map(b => ({ teams: [a.team, b.team], ratio: (a.projectedWins + b.projectedWins) / (a.games + b.games) })))
      .sort((a, b) => b.ratio - a.ratio);
    const result = strongestSquad(teams, { counts: [1, 1], size: 2 });
    expect(result.winPercentage).toBeCloseTo(possible[0].ratio, 12);
    expect(result.teams).toEqual(possible[0].teams);
    expect(result.teams).toEqual(['Long strong', 'Short weak']);
  });

  it('rejects a shape that requests more distinct teams than available', () => {
    expect(() => strongestSquad([], { counts: [1], size: 1 })).toThrow('Insufficient teams');
  });
});
