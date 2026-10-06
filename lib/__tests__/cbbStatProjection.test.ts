import { describe, expect, it } from 'vitest';
import rankings from '../../data/cbb/player-projections.json';
import stats from '../../data/cbb/stat-baselines.json';
import { matchStatBaseline, projectCbbStats, shootingPercent, type StatBaseline } from '../cbbStatProjection';
import type { CbbPlayerProjection } from '../cbbPlayerProjections';

const baseline: StatBaseline = { sourceId: 'test', player: 'Test Player', team: 'Test State', classYear: 'So', position: 'G', games: 30, minutes: 25, points: 12, rebounds: 4, assists: 3, steals: 1, blocks: 0.5, turnovers: 2, twoMade: 3, twoAttempts: 6, threeMade: 1, threeAttempts: 3, ftMade: 3, ftAttempts: 4 };
const player: CbbPlayerProjection = { ...rankings.players[0], player: baseline.player, currentTeam: baseline.team, previousTeam: null, playerType: 'Returning', projectedRole: 75, opportunityChange: 50, offensiveBurden: 50, developmentScore: 50 };

describe('CBB stat projections', () => {
  it('reconciles scoring and shooting across all three scenarios', () => {
    const result = projectCbbStats(player, [baseline]);
    for (const line of [result.projected!, result.lower!, result.upper!]) {
      expect(line.points).toBeCloseTo(line.twoMade * 2 + line.threeMade * 3 + line.ftMade, 10);
      expect(line.twoMade).toBeLessThanOrEqual(line.twoAttempts);
      expect(line.threeMade).toBeLessThanOrEqual(line.threeAttempts);
      expect(line.minutes).toBeLessThanOrEqual(40);
    }
    expect(result.lower!.points).toBeLessThan(result.projected!.points);
    expect(result.upper!.points).toBeGreaterThan(result.projected!.points);
  });
  it('reduces volume for reduced roles and does not boost accuracy with opportunity', () => {
    const high = projectCbbStats({ ...player, projectedRole: 95, opportunityChange: 90, offensiveBurden: 90 }, [baseline]).projected!;
    const low = projectCbbStats({ ...player, projectedRole: 20, opportunityChange: 10, offensiveBurden: 10 }, [baseline]).projected!;
    expect(low.points).toBeLessThan(high.points);
    expect(low.minutes).toBeLessThan(high.minutes);
    expect(low.threeMade / low.threeAttempts).toBeCloseTo(high.threeMade / high.threeAttempts);
  });
  it('does not match ambiguous names or players on unrelated teams', () => {
    expect(matchStatBaseline(player, [baseline, { ...baseline, sourceId: 'duplicate' }])).toBeNull();
    expect(matchStatBaseline({ ...player, currentTeam: 'Other' }, [baseline])).toBeNull();
    expect(matchStatBaseline({ ...player, currentTeam: 'Other', previousTeam: 'Test St.' }, [baseline])).toEqual(baseline);
  });
  it('does not fabricate stats when required inputs or historical records are missing', () => {
    expect(projectCbbStats(player, []).projected).toBeNull();
    expect(projectCbbStats({ ...player, projectedRole: null }, [baseline]).projected).toBeNull();
    expect(projectCbbStats({ ...player, developmentScore: NaN }, [baseline]).projected).toBeNull();
    expect(projectCbbStats(player, [{ ...baseline, games: 2 }]).projected).toBeNull();
  });
  it('preserves zero shooting volume and represents undefined accuracy honestly', () => {
    const line = projectCbbStats(player, [{ ...baseline, threeMade: 0, threeAttempts: 0, turnovers: null }]).projected!;
    expect(line.threeMade).toBe(0);
    expect(shootingPercent(line.threeMade, line.threeAttempts)).toBeNull();
    expect(line.turnovers).toBeNull();
  });
  it('labels newcomers as comparable estimates without claiming historical stats', () => {
    const peers = Array.from({ length: 10 }, (_, i) => ({ ...baseline, sourceId: String(i), classYear: 'Fr', position: 'Scoring PG' }));
    const result = projectCbbStats({ ...player, playerType: 'Freshman', position: 'G' }, peers);
    expect(result.status).toBe('comparable');
    expect(result.baseline).toBeNull();
    expect(result.comparisons).toBe(10);
    expect(result.projected).not.toBeNull();
    expect(projectCbbStats({ ...player, playerType: 'Freshman', position: 'C' }, peers).projected).toBeNull();
  });
  it('validates the imported source and audits projection coverage', () => {
    expect(stats.season).toBe(rankings.model.historicalDataSeason);
    for (const row of stats.records) {
      expect(Math.abs(row.points - (2 * row.twoMade + 3 * row.threeMade + row.ftMade))).toBeLessThanOrEqual(0.15);
    }
    const coverage: Record<string, number> = {};
    for (const row of rankings.players) {
      const result = projectCbbStats(row as CbbPlayerProjection, stats.records);
      coverage[result.status] = (coverage[result.status] ?? 0) + 1;
      if (result.projected) {
        expect(Object.values(result.projected).every(n => n == null || Number.isFinite(n) && n >= 0)).toBe(true);
      }
    }
    console.info('Stat projection coverage:', coverage);
    expect(coverage.historical).toBeGreaterThan(100);
    expect(coverage.comparable).toBeGreaterThan(10);
  });
});
