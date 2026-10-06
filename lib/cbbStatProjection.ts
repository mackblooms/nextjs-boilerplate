import type { CbbPlayerProjection } from './cbbPlayerProjections';

export type StatLine = {
  minutes: number; points: number; rebounds: number; assists: number;
  steals: number; blocks: number; turnovers: number | null;
  twoMade: number; twoAttempts: number; threeMade: number; threeAttempts: number;
  ftMade: number; ftAttempts: number;
};
export type StatBaseline = StatLine & {
  sourceId: string; player: string; team: string; classYear: string; position: string; games: number;
};
export type StatDataset = {
  season: string; source: string; sourceUrl: string; fetchedAt: string; records: StatBaseline[];
};
export type StatProjection = {
  status: 'historical' | 'comparable' | 'unavailable'; reason: string;
  baseline: StatBaseline | null; projected: StatLine | null;
  lower: StatLine | null; upper: StatLine | null;
  comparisons: number; explanations: string[];
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const validFactor = (n: number | null) => n != null && Number.isFinite(n) && n >= 0 && n <= 100;
export const normalizePlayerName = (name: string) => name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b/g, '').replace(/[^a-z0-9]/g, '');
const normalizeTeam = (name: string) => name.toLowerCase().replace(/\bstate\b/g, 'st').replace(/[^a-z0-9]/g, '');
const nameIndexes = new WeakMap<StatBaseline[], Map<string, StatBaseline[]>>();

function indexRecords(records: StatBaseline[]) {
  let index = nameIndexes.get(records);
  if (!index) {
    index = new Map<string, StatBaseline[]>();
    for (const record of records) {
      const key = normalizePlayerName(record.player);
      const group = index.get(key) ?? [];
      group.push(record);
      index.set(key, group);
    }
    nameIndexes.set(records, index);
  }
  return index;
}

export function matchStatBaseline(player: CbbPlayerProjection, records: StatBaseline[]) {
  const candidates = indexRecords(records).get(normalizePlayerName(player.player)) ?? [];
  const expectedTeam = player.previousTeam ?? player.currentTeam;
  const teamMatches = expectedTeam ? candidates.filter(r => normalizeTeam(r.team) === normalizeTeam(expectedTeam)) : [];
  // Never attach a same-name record from an unrelated team, even when it is unique.
  return teamMatches.length === 1 ? teamMatches[0] : null;
}

function positionGroup(position: string | null) {
  if (!position) return null;
  if (/(?:^|[\s/-])(C|PF)(?:$|[\s/-])|center/i.test(position)) return 'big';
  if (/(?:^|[\s/-])(PG|SG|G)(?:$|[\s/-])|guard/i.test(position)) return 'guard';
  if (/(?:^|[\s/-])(SF|F)(?:$|[\s/-])|wing|forward|stretch/i.test(position)) return 'wing';
  return null;
}

export function shootingPercent(made: number, attempts: number) {
  return attempts > 0 ? made / attempts : null;
}

function comparableBaseline(player: CbbPlayerProjection, records: StatBaseline[]) {
  const group = positionGroup(player.position);
  const peers = group ? records.filter(r => r.classYear === 'Fr' && positionGroup(r.position) === group && r.games >= 15 && r.minutes >= 12) : [];
  if (peers.length < 10) return null;
  const games = peers.reduce((sum, r) => sum + r.games, 0);
  const mean = (key: keyof StatLine) => peers.reduce((sum, r) => sum + (r[key] ?? 0) * r.games, 0) / games;
  const baseline: StatBaseline = {
    sourceId: 'comparable', player: 'Freshman position cohort', team: 'Multiple teams', classYear: 'Fr', position: player.position ?? '', games,
    minutes: mean('minutes'), points: mean('points'), rebounds: mean('rebounds'), assists: mean('assists'), steals: mean('steals'), blocks: mean('blocks'),
    turnovers: peers.every(r => r.turnovers != null) ? mean('turnovers') : null,
    twoMade: mean('twoMade'), twoAttempts: mean('twoAttempts'), threeMade: mean('threeMade'), threeAttempts: mean('threeAttempts'), ftMade: mean('ftMade'), ftAttempts: mean('ftAttempts'),
  };
  return { baseline, count: peers.length };
}

/** Experimental, transparent assumptions. BBPR is not inverted into box-score stats. */
export function projectCbbStats(player: CbbPlayerProjection, records: StatBaseline[]): StatProjection {
  const empty = (reason: string): StatProjection => ({ status: 'unavailable', reason, baseline: null, projected: null, lower: null, upper: null, comparisons: 0, explanations: [] });
  const newcomer = player.playerType === 'Freshman' || player.playerType === 'International';
  const historical = newcomer ? null : matchStatBaseline(player, records);
  const cohort = newcomer ? comparableBaseline(player, records) : null;
  const baseline = historical ?? cohort?.baseline;
  if (!baseline) return empty(newcomer ? 'Not enough comparable players with verified stats for this position.' : 'No verified historical stat line matched this player and team.');
  if (![player.projectedRole, player.offensiveBurden, player.opportunityChange, player.developmentScore].every(validFactor)) {
    return { ...empty('Role, opportunity, offensive burden, and development factors are needed before projecting stats.'), baseline: historical };
  }
  if (historical && (historical.games < 5 || historical.minutes < 5)) {
    return { ...empty('The historical sample is too small for a supported individual projection.'), baseline: historical };
  }
  const role = player.projectedRole!;
  const opportunity = (player.opportunityChange! - 50) / 50;
  const development = (player.developmentScore! - 50) / 50;
  const burden = (player.offensiveBurden! - 50) / 50;
  const talent = newcomer && validFactor(player.entryTalentGrade ?? null) ? ((player.entryTalentGrade ?? 50) - 50) / 50 : 0;
  const targetMinutes = clamp(6 + role * 0.29, 6, 35);
  const minutes = clamp(historical ? baseline.minutes * 0.55 + targetMinutes * 0.45 + opportunity * 2 : targetMinutes, 4, 37);
  const volume = clamp(1 + burden * 0.12 + opportunity * 0.05 + talent * 0.08, 0.8, 1.25);
  const growth = 1 + development * 0.04;
  // Empirical-Bayes-style shrinkage toward explicit draft priors. No automatic accuracy boost.
  const accuracy = (made: number, attempts: number, prior: number, priorAttempts: number) =>
    (made * baseline.games + prior * priorAttempts) / (attempts * baseline.games + priorAttempts);
  const twoPct = accuracy(baseline.twoMade, baseline.twoAttempts, 0.5, 50);
  const threePct = accuracy(baseline.threeMade, baseline.threeAttempts, 0.33, 75);
  const ftPct = accuracy(baseline.ftMade, baseline.ftAttempts, 0.72, 40);
  const build = (mpg: number, workload: number): StatLine => {
    const scale = mpg / baseline.minutes;
    const twoAttempts = baseline.twoAttempts * scale * workload;
    const threeAttempts = baseline.threeAttempts * scale * workload;
    const ftAttempts = baseline.ftAttempts * scale * workload;
    const twoMade = twoAttempts * twoPct, threeMade = threeAttempts * threePct, ftMade = ftAttempts * ftPct;
    return {
      minutes: mpg, points: 2 * twoMade + 3 * threeMade + ftMade,
      rebounds: baseline.rebounds * scale * growth,
      assists: baseline.assists * scale * workload * growth,
      steals: baseline.steals * scale * growth, blocks: baseline.blocks * scale * growth,
      turnovers: baseline.turnovers == null ? null : baseline.turnovers * scale * workload,
      twoMade, twoAttempts, threeMade, threeAttempts, ftMade, ftAttempts,
    };
  };
  const confidence = validFactor(player.confidenceScore) ? player.confidenceScore! : 50;
  const minutesSpread = (newcomer ? 5 : 3) + (100 - confidence) * 0.03;
  return {
    status: historical ? 'historical' : 'comparable',
    reason: historical ? 'Based on a matched historical season.' : 'Position-based newcomer estimate; not an individual shooting history.',
    baseline: historical, comparisons: cohort?.count ?? 0,
    projected: build(minutes, volume),
    lower: build(clamp(minutes - minutesSpread, 1, 40), volume * 0.9),
    upper: build(clamp(minutes + minutesSpread, 1, 40), volume * 1.1),
    explanations: [
      `Role ${role.toFixed(0)}/100 and opportunity ${player.opportunityChange!.toFixed(0)}/100 imply ${minutes.toFixed(1)} minutes per game.`,
      `Offensive burden and opportunity adjust shot attempts per minute by ${((volume - 1) * 100).toFixed(0)}%.`,
      `Development adjusts rebound, assist, steal, and block rates by ${((growth - 1) * 100).toFixed(0)}%.`,
      'Shooting accuracy is pulled toward draft priors (50% on twos, 33% on threes, 72% at the line), with less adjustment for larger samples.',
      ...(newcomer ? [`Uses ${cohort!.count} freshmen in a similar position from the prior season. Entry talent adjusts volume; individual shooting skills are not yet modeled.`] : []),
      'Turnovers are estimated from the source assist-to-turnover ratio when available.',
      'Lower and upper cases vary minutes and workload. They are scenarios, not statistical confidence intervals.',
    ],
  };
}
