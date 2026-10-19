import { seasonPricing } from "./cbbSeason";

export const SEASON_TIME_ZONE = "America/Chicago";
export type SeasonSquad = { id: string; name: string; owner: string; teamIds: string[]; isLocal?: boolean };
export type SeasonGame = {
  id: string; season: string; phase: "regular" | "conference-tournament" | "ncaa-tournament" | "other-postseason" | "exhibition";
  startsAt: string; completedAt: string | null; status: "scheduled" | "live" | "final" | "canceled";
  awayTeamId: string; homeTeamId: string; awayName: string; homeName: string;
  awayScore: number | null; homeScore: number | null; winnerTeamId?: string;
};
export type RecordLine = { wins: number; losses: number };
export type RankedRecord = RecordLine & { id: string; rank: number | null };
export type SeasonStanding = RankedRecord & {
  squad: SeasonSquad; percentage: number | null; today: RecordLine; week: RecordLine;
  previousRank: number | null; movement: number | null; recent: Array<"W" | "L">;
};
const emptyRecord = (): RecordLine => ({ wins: 0, losses: 0 });
const dayFormatters = new Map<string, Intl.DateTimeFormat>();
export const recordPercentage = (record: RecordLine) => record.wins + record.losses ? record.wins / (record.wins + record.losses) : null;

export function seasonDayKey(timestamp: string, timeZone = SEASON_TIME_ZONE) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid standings timestamp");
  if (!dayFormatters.has(timeZone)) dayFormatters.set(timeZone, new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }));
  const parts = dayFormatters.get(timeZone)!.formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function shiftDay(day: string, offset: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function isSeasonGame(game: SeasonGame) {
  return game.season === seasonPricing.season && (game.phase === "regular" || game.phase === "conference-tournament");
}

export function seasonGameWinner(game: SeasonGame): string | null {
  if (game.awayTeamId === game.homeTeamId) return null;
  if (game.winnerTeamId) return [game.awayTeamId, game.homeTeamId].includes(game.winnerTeamId) ? game.winnerTeamId : null;
  const validScore = (score: number | null): score is number => score !== null && Number.isInteger(score) && score >= 0;
  if (!validScore(game.awayScore) || !validScore(game.homeScore) || game.awayScore === game.homeScore) return null;
  return game.awayScore > game.homeScore ? game.awayTeamId : game.homeTeamId;
}

export function seasonGameState(game: SeasonGame, asOf: string) {
  if (game.status === "canceled") return "canceled";
  if (Date.parse(game.startsAt) > Date.parse(asOf)) return "scheduled";
  if (game.status === "final" && game.completedAt && Date.parse(game.completedAt) <= Date.parse(asOf)) return "final";
  if (game.status === "live" || (game.status === "final" && game.completedAt)) return "live";
  return "scheduled";
}

function completedGames(games: SeasonGame[], asOf: string) {
  const time = Date.parse(asOf);
  if (!Number.isFinite(time)) throw new Error("Invalid standings cutoff");
  const seen = new Set<string>();
  for (const game of games) {
    if (seen.has(game.id)) throw new Error(`Duplicate game: ${game.id}`);
    seen.add(game.id);
  }
  return games.filter(g => isSeasonGame(g) && g.status === "final" && g.completedAt && Date.parse(g.completedAt) <= time)
    .sort((a, b) => Date.parse(a.completedAt!) - Date.parse(b.completedAt!) || a.id.localeCompare(b.id));
}

// Exact fractions determine ranks; equal percentages share 1,1,3 ranks.
// Stable IDs order tied rows without inventing a scoring tiebreaker.
export function rankSeasonRecords<T extends RecordLine & { id: string }>(records: T[]): Array<T & { rank: number | null }> {
  const sorted = [...records].sort((a, b) => {
    const aGames = a.wins + a.losses, bGames = b.wins + b.losses;
    if (!aGames || !bGames) return Number(Boolean(bGames)) - Number(Boolean(aGames)) || a.id.localeCompare(b.id);
    return b.wins * aGames - a.wins * bGames || a.id.localeCompare(b.id);
  });
  let last: (T & { rank: number | null }) | null = null;
  return sorted.map((row, index) => {
    const total = row.wins + row.losses;
    const tied = last && total && row.wins * (last.wins + last.losses) === last.wins * total;
    const ranked = { ...row, rank: !total ? null : tied ? last!.rank : index + 1 };
    last = ranked;
    return ranked;
  });
}

function recordFor(teamIds: string[], games: SeasonGame[]) {
  const ids = new Set(teamIds), record = emptyRecord();
  for (const game of games) {
    const winner = seasonGameWinner(game);
    if (!winner) continue;
    for (const teamId of [game.awayTeamId, game.homeTeamId]) {
      if (ids.has(teamId)) record[teamId === winner ? "wins" : "losses"]++;
    }
  }
  return record;
}

export function calculateSeasonStandings(squads: SeasonSquad[], games: SeasonGame[], asOf: string, timeZone = SEASON_TIME_ZONE) {
  if (new Set(squads.map(s => s.id)).size !== squads.length) throw new Error("Duplicate squad IDs");
  if (squads.some(s => new Set(s.teamIds).size !== s.teamIds.length)) throw new Error("Duplicate team in squad");
  const finals = completedGames(games, asOf);
  const unscoredFinalIds = finals.filter(g => !seasonGameWinner(g)).map(g => g.id);
  const valid = finals.filter(g => seasonGameWinner(g));
  const todayKey = seasonDayKey(asOf, timeZone), weekStart = shiftDay(todayKey, -6);
  const dated = valid.map(game => ({ game, day: seasonDayKey(game.completedAt!, timeZone) }));
  const beforeToday = dated.filter(g => g.day < todayKey).map(g => g.game);
  const todayGames = dated.filter(g => g.day === todayKey).map(g => g.game);
  const weekGames = dated.filter(g => g.day >= weekStart).map(g => g.game);
  const previousRanks = new Map(rankSeasonRecords(squads.map(s => ({ id: s.id, ...recordFor(s.teamIds, beforeToday) }))).map(s => [s.id, s.rank]));
  const ranked = rankSeasonRecords(squads.map(squad => ({ id: squad.id, squad, ...recordFor(squad.teamIds, valid) })));
  const rows: SeasonStanding[] = ranked.map(row => {
    const previousRank = previousRanks.get(row.id) ?? null;
    const ids = new Set(row.squad.teamIds);
    const recent: Array<"W" | "L"> = [];
    for (const game of valid) for (const teamId of [game.awayTeamId, game.homeTeamId]) {
      if (ids.has(teamId)) recent.push(teamId === seasonGameWinner(game) ? "W" : "L");
    }
    return { ...row, percentage: recordPercentage(row), today: recordFor(row.squad.teamIds, todayGames), week: recordFor(row.squad.teamIds, weekGames),
      previousRank, movement: previousRank === null || row.rank === null ? null : previousRank - row.rank, recent: recent.slice(-10) };
  });
  return { rows, unscoredFinalIds, finalsCount: valid.length };
}

export function seasonTeamRecords(teamIds: string[], games: SeasonGame[], asOf: string) {
  const finals = completedGames(games, asOf).filter(g => seasonGameWinner(g));
  return teamIds.map(id => ({ id, ...recordFor([id], finals) }));
}

// "If this game finished next": update every owner, including shared teams and
// squads owning both opponents. Existing future fixtures are never revealed.
export function seasonGameScenario(rows: SeasonStanding[], game: SeasonGame, winnerId: string) {
  if (![game.awayTeamId, game.homeTeamId].includes(winnerId)) throw new Error("Invalid scenario winner");
  return rankSeasonRecords(rows.map(row => {
    const ids = new Set(row.squad.teamIds);
    let wins = row.wins, losses = row.losses;
    for (const team of [game.awayTeamId, game.homeTeamId]) if (ids.has(team)) {
      if (team === winnerId) wins++; else losses++;
    }
    return { id: row.id, wins, losses };
  }));
}
