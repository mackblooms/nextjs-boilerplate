// Fictional preview fixtures only. No generated game is an actual NCAA result.
import { legalSeasonCompositions, seasonPricing, type SeasonTeam } from "./cbbSeason";
import type { SeasonGame, SeasonSquad } from "./cbbSeasonStandings";

export const DEMO_DAYS = 18;
const DEMO_START = Date.parse("2026-11-03T06:00:00Z"); // midnight America/Chicago, after DST
export function demoDayStart(day: number) { return new Date(DEMO_START + day * 86400000).toISOString(); }
export function demoDayEnd(day: number) { return new Date(DEMO_START + (day + 1) * 86400000 - 1).toISOString(); }

function random(seed: number) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
function shuffled<T>(values: T[], seed: number) {
  const rng = random(seed), result = [...values];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}

export function createSeasonStandingsDemo(teams: SeasonTeam[]): { squads: SeasonSquad[]; games: SeasonGame[] } {
  const mixes = legalSeasonCompositions();
  const labels = ["Midnight Madness", "The Chalkboard", "Cinderella Watch", "Full Court Press", "Bracket Busters", "Campus Legends", "Nothing But NET", "The Sixth Man"];
  const groups = seasonPricing.bands.map((_, b) => teams.filter(t => t.bandIndex === b)
    .sort((a, z) => z.projectedWins / (z.projectedWins + z.projectedLosses) - a.projectedWins / (a.projectedWins + a.projectedLosses)));
  const squads = labels.map((name, i) => ({ id: `sample-${i + 1}`, name, owner: `Sample player ${i + 1}`,
    teamIds: mixes[i % mixes.length].flatMap((count, b) => shuffled(groups[b].slice(0, Math.max(count + 5, Math.ceil(groups[b].length * .4))), 40 + i * 17 + b).slice(0, count).map(t => t.id)) }));
  const games: SeasonGame[] = [];
  for (let day = 0; day < DEMO_DAYS + 6; day++) {
    const order = shuffled(teams, 850 + Math.floor(day / 3));
    const playing = order.filter((_, index) => index % 3 === day % 3);
    for (let i = 0; i < playing.length; i += 2) {
      const away = playing[i], home = playing[i + 1];
      const rng = random(1001 + day * 1000 + i * 13);
      const awayPct = away.projectedWins / (away.projectedWins + away.projectedLosses);
      const homePct = home ? home.projectedWins / (home.projectedWins + home.projectedLosses) : .25;
      const awayWins = rng() < Math.max(.08, Math.min(.92, .47 + (awayPct - homePct) * .8));
      const winningScore = 73 + Math.floor(rng() * 17), losingScore = winningScore - 3 - Math.floor(rng() * 15);
      const start = DEMO_START + day * 86400000 + 14 * 3600000 + (i % 7) * 30 * 60000;
      games.push({ id: `sample-game-${day}-${i}`, season: seasonPricing.season, phase: "regular",
        startsAt: new Date(start).toISOString(), completedAt: new Date(start + 2 * 3600000 + Math.floor(rng() * 20) * 60000).toISOString(),
        status: day === 8 && i === 0 ? "canceled" : "final", awayTeamId: away.id, homeTeamId: home?.id ?? `sample-nond1-${day}`,
        awayName: away.name, homeName: home?.name ?? "Sample non-DI opponent", awayScore: awayWins ? winningScore : losingScore, homeScore: awayWins ? losingScore : winningScore });
    }
  }
  return { squads, games };
}
