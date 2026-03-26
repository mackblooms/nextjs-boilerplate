import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { scoreEntries, seedMultiplier, type ScoringGame } from "@/lib/scoring";

type PoolEntryRow = {
  entry_id: string;
  user_id: string;
  display_name: string | null;
};

type EntryPickRow = {
  entry_id: string;
  team_id: string;
};

type TeamRow = {
  id: string;
  seed_in_region: number | null;
  espn_team_id: string | number | null;
};

type GameRow = ScoringGame & {
  game_date: string | null;
  start_time: string | null;
};

type EspnTeam = {
  id?: string | number;
  location?: string;
  shortDisplayName?: string;
  displayName?: string;
  name?: string;
};

type EspnCompetitor = {
  homeAway?: "home" | "away";
  winner?: boolean | string | number;
  team?: EspnTeam;
};

type EspnCompetition = {
  competitors?: EspnCompetitor[];
  tournamentId?: number | string;
  notes?: Array<{ headline?: string }>;
  headlines?: Array<{ shortLinkText?: string; description?: string }>;
};

type EspnStatus = {
  type?: {
    state?: string;
    completed?: boolean;
    shortDetail?: string;
  };
};

type EspnEvent = {
  id?: string;
  date?: string;
  name?: string;
  shortName?: string;
  status?: EspnStatus;
  competitions?: EspnCompetition[];
};

type EspnScoreboard = {
  events?: EspnEvent[];
};

type EspnSummary = {
  predictor?: {
    homeTeam?: { gameProjection?: string | number };
    awayTeam?: { gameProjection?: string | number };
  };
  winprobability?: Array<{ homeWinPercentage?: string | number }>;
  header?: {
    competitions?: Array<{
      competitors?: Array<{ team?: { id?: string | number }; winner?: boolean | string | number }>;
    }>;
  };
};

type MatchupForecast = {
  event_id: string;
  state: string;
  detail: string | null;
  round: string | null;
  prob_source: string;
  away_team_name: string;
  home_team_name: string;
  away_win_prob: number;
  home_win_prob: number;
  away_points_if_win: number | null;
  home_points_if_win: number | null;
  away_local_team_id: string | null;
  home_local_team_id: string | null;
};

type EntryForecast = {
  entry_id: string;
  current_score: number;
  current_rank: number;
  expected_score: number;
  expected_add: number;
  projected_score_most_likely: number;
  projected_add_most_likely: number;
  projected_rank_most_likely: number;
  expected_rank: number;
  first_place_prob: number;
};

type RankedScore = {
  entry_id: string;
  score: number;
  rank: number;
};

const BASE_POINTS_BY_ROUND: Record<string, number> = {
  R64: 12,
  R32: 36,
  S16: 84,
  E8: 180,
  F4: 300,
  CHIP: 360,
};

const MAX_EXACT_SCENARIO_GAMES = 12;

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

function toEtYyyymmdd(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";
  return `${year}${month}${day}`;
}

function normalizeProbability(raw: unknown): number | null {
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  if (value < 0) return null;
  if (value > 1 && value <= 100) return value / 100;
  if (value > 1) return null;
  return value;
}

function normalizePair(homeProbRaw: number | null, awayProbRaw: number | null) {
  const homeRaw = homeProbRaw ?? null;
  const awayRaw = awayProbRaw ?? null;
  const sum = (homeRaw ?? 0) + (awayRaw ?? 0);
  if (!Number.isFinite(sum) || sum <= 0) {
    return { home: 0.5, away: 0.5 };
  }
  return {
    home: (homeRaw ?? 0) / sum,
    away: (awayRaw ?? 0) / sum,
  };
}

function isWinnerFlag(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function inferRoundFromText(event: EspnEvent) {
  const competition = event.competitions?.[0];
  const notes = (competition?.notes ?? []).map((note) => note.headline ?? "").join(" ");
  const headlines = (competition?.headlines ?? [])
    .map((headline) => `${headline.shortLinkText ?? ""} ${headline.description ?? ""}`)
    .join(" ");
  const text = `${event.name ?? ""} ${event.shortName ?? ""} ${notes} ${headlines}`.toLowerCase();

  if (text.includes("round of 64")) return "R64";
  if (text.includes("round of 32")) return "R32";
  if (text.includes("sweet 16") || text.includes("round of 16")) return "S16";
  if (text.includes("elite 8") || text.includes("round of 8")) return "E8";
  if (text.includes("final four") || text.includes("round of 4")) return "F4";
  if (text.includes("championship")) return "CHIP";
  return null;
}

function isNcaaTournamentEvent(event: EspnEvent) {
  const competition = event.competitions?.[0];
  if (!competition) return false;

  const tournamentId = Number(competition.tournamentId);
  if (Number.isFinite(tournamentId)) return tournamentId === 22;

  const notes = (competition.notes ?? []).map((note) => note.headline ?? "").join(" ");
  const headlines = (competition.headlines ?? [])
    .map((headline) => `${headline.shortLinkText ?? ""} ${headline.description ?? ""}`)
    .join(" ");
  const text = `${notes} ${headlines} ${event.name ?? ""} ${event.shortName ?? ""}`.toLowerCase();
  return (
    text.includes("men's basketball championship") ||
    text.includes("mens basketball championship") ||
    text.includes("ncaa tournament") ||
    text.includes("ncaa men's tournament") ||
    text.includes("march madness")
  );
}

function computeWinPoints(
  round: string | null,
  winnerTeamId: string,
  loserTeamId: string,
  teamSeedById: Map<string, number | null>,
) {
  if (!round) return null;
  const base = BASE_POINTS_BY_ROUND[round] ?? 0;
  if (!base) return null;

  const winnerSeed = teamSeedById.get(winnerTeamId) ?? null;
  const loserSeed = teamSeedById.get(loserTeamId) ?? null;
  const scaledBase = base * seedMultiplier(winnerSeed);
  const upsetBonus =
    winnerSeed && loserSeed ? Math.max(0, 4 * (winnerSeed - loserSeed)) : 0;
  return Math.round(scaledBase + upsetBonus);
}

function extractProbabilities(
  summary: EspnSummary | null,
  state: string,
  homeEspnTeamId: string,
  awayEspnTeamId: string,
) {
  const homePredictor = normalizeProbability(summary?.predictor?.homeTeam?.gameProjection);
  const awayPredictor = normalizeProbability(summary?.predictor?.awayTeam?.gameProjection);
  if (homePredictor != null && awayPredictor != null) {
    const normalized = normalizePair(homePredictor, awayPredictor);
    return {
      home: normalized.home,
      away: normalized.away,
      source: "predictor",
    };
  }

  const winProbabilityRows = Array.isArray(summary?.winprobability) ? summary.winprobability : [];
  if (winProbabilityRows.length > 0) {
    const last = winProbabilityRows[winProbabilityRows.length - 1];
    const homeLive = normalizeProbability(last?.homeWinPercentage);
    if (homeLive != null) {
      const normalized = normalizePair(homeLive, 1 - homeLive);
      return {
        home: normalized.home,
        away: normalized.away,
        source: "live_win_probability",
      };
    }
  }

  if (state === "post") {
    const competitors = summary?.header?.competitions?.[0]?.competitors ?? [];
    const home = competitors.find((competitor) => String(competitor?.team?.id ?? "") === homeEspnTeamId);
    const away = competitors.find((competitor) => String(competitor?.team?.id ?? "") === awayEspnTeamId);
    if (isWinnerFlag(home?.winner)) {
      return { home: 1, away: 0, source: "final_result" };
    }
    if (isWinnerFlag(away?.winner)) {
      return { home: 0, away: 1, source: "final_result" };
    }
  }

  return { home: 0.5, away: 0.5, source: "fallback_even" };
}

function rankByScore(rows: Array<{ entry_id: string; score: number; label: string }>): RankedScore[] {
  const sorted = [...rows].sort(
    (a, b) => b.score - a.score || a.label.localeCompare(b.label),
  );

  let previousScore: number | null = null;
  let previousRank = 0;
  return sorted.map((row, index) => {
    const rank = previousScore === row.score ? previousRank : index + 1;
    previousScore = row.score;
    previousRank = rank;
    return {
      entry_id: row.entry_id,
      score: row.score,
      rank,
    };
  });
}

async function requirePoolAccess(req: Request, poolId: string) {
  const token = getBearerToken(req);
  if (!token) {
    return { error: NextResponse.json({ error: "Missing authorization token." }, { status: 401 }) };
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !authData.user) {
    return {
      error: NextResponse.json({ error: authErr?.message ?? "Unauthorized." }, { status: 401 }),
    };
  }

  const requesterId = authData.user.id;
  const { data: memberRow, error: memberErr } = await supabaseAdmin
    .from("pool_members")
    .select("pool_id")
    .eq("pool_id", poolId)
    .eq("user_id", requesterId)
    .maybeSingle();

  if (memberErr) {
    return { error: NextResponse.json({ error: memberErr.message }, { status: 400 }) };
  }

  if (!memberRow) {
    return {
      error: NextResponse.json(
        { error: "Join this pool to view forecast standings." },
        { status: 403 },
      ),
    };
  }

  return { userId: requesterId };
}

export async function GET(req: Request) {
  try {
    const poolId = new URL(req.url).searchParams.get("poolId")?.trim() ?? "";
    if (!poolId) {
      return NextResponse.json({ error: "poolId is required." }, { status: 400 });
    }

    const access = await requirePoolAccess(req, poolId);
    if ("error" in access) return access.error;

    const supabaseAdmin = getSupabaseAdmin();
    const { data: baseRowsData, error: baseRowsErr } = await supabaseAdmin
      .from("pool_leaderboard")
      .select("entry_id,user_id,display_name")
      .eq("pool_id", poolId);

    if (baseRowsErr) {
      return NextResponse.json({ error: baseRowsErr.message }, { status: 400 });
    }

    const baseRows = (baseRowsData ?? []) as PoolEntryRow[];
    if (baseRows.length === 0) {
      return NextResponse.json({
        ok: true,
        generated_at: new Date().toISOString(),
        et_date: toEtYyyymmdd(new Date()),
        games: [],
        entries: [],
      });
    }

    const entryIds = baseRows.map((row) => row.entry_id);

    const [picksResult, teamsResult, gamesResult] = await Promise.all([
      supabaseAdmin.from("entry_picks").select("entry_id,team_id").in("entry_id", entryIds),
      supabaseAdmin.from("teams").select("id,seed_in_region,espn_team_id"),
      supabaseAdmin.from("games").select("round,team1_id,team2_id,winner_team_id,game_date,start_time"),
    ]);

    if (picksResult.error) {
      return NextResponse.json({ error: picksResult.error.message }, { status: 400 });
    }
    if (teamsResult.error) {
      return NextResponse.json({ error: teamsResult.error.message }, { status: 400 });
    }
    if (gamesResult.error) {
      return NextResponse.json({ error: gamesResult.error.message }, { status: 400 });
    }

    const picksRows = (picksResult.data ?? []) as EntryPickRow[];
    const teams = (teamsResult.data ?? []) as TeamRow[];
    const allGames = (gamesResult.data ?? []) as GameRow[];

    const picksByEntry = new Map<string, string[]>();
    for (const entryId of entryIds) picksByEntry.set(entryId, []);
    for (const pick of picksRows) {
      const picks = picksByEntry.get(pick.entry_id) ?? [];
      picks.push(pick.team_id);
      picksByEntry.set(pick.entry_id, picks);
    }

    const teamSeedById = new Map<string, number | null>();
    const localTeamIdByEspnTeamId = new Map<string, string>();
    for (const team of teams) {
      teamSeedById.set(String(team.id), team.seed_in_region ?? null);
      if (team.espn_team_id != null) {
        localTeamIdByEspnTeamId.set(String(team.espn_team_id), String(team.id));
      }
    }

    const scoredEntries = scoreEntries(allGames, teamSeedById, picksByEntry);

    const labelByEntryId = new Map<string, string>();
    for (const row of baseRows) {
      const label = row.display_name?.trim() || row.entry_id.slice(0, 8);
      labelByEntryId.set(row.entry_id, label);
    }

    const currentScoreRows = entryIds.map((entryId) => ({
      entry_id: entryId,
      score: scoredEntries.totalScoreByEntryId.get(entryId) ?? 0,
      label: labelByEntryId.get(entryId) ?? entryId.slice(0, 8),
    }));
    const currentRanks = rankByScore(currentScoreRows);
    const currentRankByEntryId = new Map(currentRanks.map((row) => [row.entry_id, row.rank]));
    const currentScoreByEntryId = new Map(currentScoreRows.map((row) => [row.entry_id, row.score]));

    const todayEt = toEtYyyymmdd(new Date());
    const scoreboardRes = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${todayEt}&groups=50&limit=500`,
      { cache: "no-store" },
    );

    if (!scoreboardRes.ok) {
      const detail = await scoreboardRes.text().catch(() => "");
      return NextResponse.json(
        { error: `Failed to load scoreboard (${scoreboardRes.status}). ${detail}`.trim() },
        { status: 502 },
      );
    }

    const scoreboard = (await scoreboardRes.json()) as EspnScoreboard;
    const events = (scoreboard.events ?? []).filter((event) => isNcaaTournamentEvent(event));

    const matchupPromises = events.map(async (event): Promise<MatchupForecast | null> => {
      const competition = event.competitions?.[0];
      const competitors = competition?.competitors ?? [];
      const away = competitors.find((competitor) => competitor.homeAway === "away");
      const home = competitors.find((competitor) => competitor.homeAway === "home");

      if (!away?.team?.id || !home?.team?.id) return null;

      const awayEspnTeamId = String(away.team.id);
      const homeEspnTeamId = String(home.team.id);
      const awayLocalTeamId = localTeamIdByEspnTeamId.get(awayEspnTeamId) ?? null;
      const homeLocalTeamId = localTeamIdByEspnTeamId.get(homeEspnTeamId) ?? null;

      const summaryRes = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary?event=${encodeURIComponent(String(event.id ?? ""))}`,
        { cache: "no-store" },
      ).catch(() => null);
      const summary =
        summaryRes && summaryRes.ok
          ? ((await summaryRes.json()) as EspnSummary)
          : null;

      const state = String(event.status?.type?.state ?? "pre").toLowerCase();
      const probabilities = extractProbabilities(summary, state, homeEspnTeamId, awayEspnTeamId);

      const localPairGames =
        awayLocalTeamId && homeLocalTeamId
          ? allGames.filter((game) => {
              const team1 = game.team1_id ? String(game.team1_id) : null;
              const team2 = game.team2_id ? String(game.team2_id) : null;
              return (
                (team1 === awayLocalTeamId && team2 === homeLocalTeamId) ||
                (team1 === homeLocalTeamId && team2 === awayLocalTeamId)
              );
            })
          : [];
      const localGame =
        localPairGames.find((game) => !game.winner_team_id) ?? localPairGames[0] ?? null;
      const round = localGame?.round ?? inferRoundFromText(event);

      const awayPointsIfWin =
        awayLocalTeamId && homeLocalTeamId
          ? computeWinPoints(round, awayLocalTeamId, homeLocalTeamId, teamSeedById)
          : null;
      const homePointsIfWin =
        awayLocalTeamId && homeLocalTeamId
          ? computeWinPoints(round, homeLocalTeamId, awayLocalTeamId, teamSeedById)
          : null;

      return {
        event_id: String(event.id ?? `${event.date ?? "game"}-${awayEspnTeamId}-${homeEspnTeamId}`),
        state,
        detail: event.status?.type?.shortDetail ?? null,
        round,
        prob_source: probabilities.source,
        away_team_name:
          away.team.location?.trim() ||
          away.team.shortDisplayName?.trim() ||
          away.team.displayName?.trim() ||
          away.team.name?.trim() ||
          "Away Team",
        home_team_name:
          home.team.location?.trim() ||
          home.team.shortDisplayName?.trim() ||
          home.team.displayName?.trim() ||
          home.team.name?.trim() ||
          "Home Team",
        away_win_prob: probabilities.away,
        home_win_prob: probabilities.home,
        away_points_if_win: awayPointsIfWin,
        home_points_if_win: homePointsIfWin,
        away_local_team_id: awayLocalTeamId,
        home_local_team_id: homeLocalTeamId,
      };
    });

    const matchupRows = (await Promise.all(matchupPromises)).filter(
      (row): row is MatchupForecast => row !== null,
    );

    const projectableMatchups = matchupRows.filter(
      (matchup) =>
        Boolean(matchup.away_local_team_id) &&
        Boolean(matchup.home_local_team_id) &&
        typeof matchup.away_points_if_win === "number" &&
        typeof matchup.home_points_if_win === "number",
    );

    const picksByEntrySet = new Map<string, Set<string>>();
    for (const [entryId, picks] of picksByEntry.entries()) {
      picksByEntrySet.set(entryId, new Set(picks));
    }

    const expectedAddByEntryId = new Map<string, number>();
    const mostLikelyAddByEntryId = new Map<string, number>();
    for (const entryId of entryIds) {
      expectedAddByEntryId.set(entryId, 0);
      mostLikelyAddByEntryId.set(entryId, 0);
    }

    for (const matchup of projectableMatchups) {
      const awayTeamId = String(matchup.away_local_team_id);
      const homeTeamId = String(matchup.home_local_team_id);
      const awayPoints = matchup.away_points_if_win as number;
      const homePoints = matchup.home_points_if_win as number;
      const likelyWinnerTeamId =
        matchup.home_win_prob >= matchup.away_win_prob ? homeTeamId : awayTeamId;
      const likelyWinnerPoints =
        likelyWinnerTeamId === homeTeamId ? homePoints : awayPoints;

      for (const entryId of entryIds) {
        const picks = picksByEntrySet.get(entryId) ?? new Set<string>();
        let expectedAdd = expectedAddByEntryId.get(entryId) ?? 0;
        if (picks.has(awayTeamId)) expectedAdd += awayPoints * matchup.away_win_prob;
        if (picks.has(homeTeamId)) expectedAdd += homePoints * matchup.home_win_prob;
        expectedAddByEntryId.set(entryId, expectedAdd);

        if (picks.has(likelyWinnerTeamId)) {
          const currentMostLikely = mostLikelyAddByEntryId.get(entryId) ?? 0;
          mostLikelyAddByEntryId.set(entryId, currentMostLikely + likelyWinnerPoints);
        }
      }
    }

    const expectedScoreRows = entryIds.map((entryId) => ({
      entry_id: entryId,
      score: (currentScoreByEntryId.get(entryId) ?? 0) + (expectedAddByEntryId.get(entryId) ?? 0),
      label: labelByEntryId.get(entryId) ?? entryId.slice(0, 8),
    }));
    const expectedScoreRanked = rankByScore(expectedScoreRows);
    const expectedRankFallbackByEntryId = new Map(
      expectedScoreRanked.map((row) => [row.entry_id, row.rank]),
    );

    const projectedMostLikelyRows = entryIds.map((entryId) => ({
      entry_id: entryId,
      score:
        (currentScoreByEntryId.get(entryId) ?? 0) + (mostLikelyAddByEntryId.get(entryId) ?? 0),
      label: labelByEntryId.get(entryId) ?? entryId.slice(0, 8),
    }));
    const projectedMostLikelyRanked = rankByScore(projectedMostLikelyRows);
    const projectedMostLikelyRankByEntryId = new Map(
      projectedMostLikelyRanked.map((row) => [row.entry_id, row.rank]),
    );

    const expectedRankAccumulator = new Map<string, number>();
    const firstPlaceProbabilityAccumulator = new Map<string, number>();
    for (const entryId of entryIds) {
      expectedRankAccumulator.set(entryId, 0);
      firstPlaceProbabilityAccumulator.set(entryId, 0);
    }

    let scenarioCount = 0;
    let scenariosTotalProbability = 0;
    if (projectableMatchups.length > 0 && projectableMatchups.length <= MAX_EXACT_SCENARIO_GAMES) {
      type Scenario = {
        probability: number;
        winnerTeamIds: string[];
      };

      let scenarios: Scenario[] = [{ probability: 1, winnerTeamIds: [] }];
      for (const matchup of projectableMatchups) {
        const awayTeamId = String(matchup.away_local_team_id);
        const homeTeamId = String(matchup.home_local_team_id);
        const nextScenarios: Scenario[] = [];

        for (const scenario of scenarios) {
          nextScenarios.push({
            probability: scenario.probability * matchup.away_win_prob,
            winnerTeamIds: [...scenario.winnerTeamIds, awayTeamId],
          });
          nextScenarios.push({
            probability: scenario.probability * matchup.home_win_prob,
            winnerTeamIds: [...scenario.winnerTeamIds, homeTeamId],
          });
        }
        scenarios = nextScenarios;
      }

      scenarioCount = scenarios.length;
      scenariosTotalProbability = scenarios.reduce((sum, scenario) => sum + scenario.probability, 0);

      for (const scenario of scenarios) {
        const scenarioRows = entryIds.map((entryId) => {
          const picks = picksByEntrySet.get(entryId) ?? new Set<string>();
          let add = 0;

          for (let index = 0; index < projectableMatchups.length; index += 1) {
            const matchup = projectableMatchups[index];
            const winnerId = scenario.winnerTeamIds[index];
            if (!winnerId || !picks.has(winnerId)) continue;
            if (winnerId === matchup.home_local_team_id) {
              add += matchup.home_points_if_win as number;
            } else if (winnerId === matchup.away_local_team_id) {
              add += matchup.away_points_if_win as number;
            }
          }

          return {
            entry_id: entryId,
            score: (currentScoreByEntryId.get(entryId) ?? 0) + add,
            label: labelByEntryId.get(entryId) ?? entryId.slice(0, 8),
          };
        });

        const rankedScenario = rankByScore(scenarioRows);
        const leaders = rankedScenario.filter((row) => row.rank === 1);
        const firstPlaceShare = leaders.length > 0 ? scenario.probability / leaders.length : 0;

        for (const row of rankedScenario) {
          expectedRankAccumulator.set(
            row.entry_id,
            (expectedRankAccumulator.get(row.entry_id) ?? 0) + row.rank * scenario.probability,
          );
        }

        for (const leader of leaders) {
          firstPlaceProbabilityAccumulator.set(
            leader.entry_id,
            (firstPlaceProbabilityAccumulator.get(leader.entry_id) ?? 0) + firstPlaceShare,
          );
        }
      }
    }

    const normalizer = scenariosTotalProbability > 0 ? scenariosTotalProbability : 1;
    const entries: EntryForecast[] = entryIds
      .map((entryId) => {
        const currentScore = currentScoreByEntryId.get(entryId) ?? 0;
        const expectedAdd = expectedAddByEntryId.get(entryId) ?? 0;
        const expectedScore = currentScore + expectedAdd;
        const projectedAddMostLikely = mostLikelyAddByEntryId.get(entryId) ?? 0;
        const projectedScoreMostLikely = currentScore + projectedAddMostLikely;
        const expectedRank =
          scenarioCount > 0
            ? (expectedRankAccumulator.get(entryId) ?? 0) / normalizer
            : (expectedRankFallbackByEntryId.get(entryId) ?? 0);

        return {
          entry_id: entryId,
          current_score: currentScore,
          current_rank: currentRankByEntryId.get(entryId) ?? 0,
          expected_score: Number(expectedScore.toFixed(2)),
          expected_add: Number(expectedAdd.toFixed(2)),
          projected_score_most_likely: projectedScoreMostLikely,
          projected_add_most_likely: projectedAddMostLikely,
          projected_rank_most_likely: projectedMostLikelyRankByEntryId.get(entryId) ?? 0,
          expected_rank: Number(expectedRank.toFixed(3)),
          first_place_prob: Number(
            (100 * ((firstPlaceProbabilityAccumulator.get(entryId) ?? 0) / normalizer)).toFixed(2),
          ),
        };
      })
      .sort((a, b) => b.expected_score - a.expected_score || a.entry_id.localeCompare(b.entry_id));

    return NextResponse.json({
      ok: true,
      generated_at: new Date().toISOString(),
      et_date: todayEt,
      scenario_count: scenarioCount,
      projectable_game_count: projectableMatchups.length,
      games: matchupRows.map((matchup) => ({
        event_id: matchup.event_id,
        state: matchup.state,
        detail: matchup.detail,
        round: matchup.round,
        prob_source: matchup.prob_source,
        away_team_name: matchup.away_team_name,
        home_team_name: matchup.home_team_name,
        away_win_prob: Number((matchup.away_win_prob * 100).toFixed(1)),
        home_win_prob: Number((matchup.home_win_prob * 100).toFixed(1)),
        away_points_if_win: matchup.away_points_if_win,
        home_points_if_win: matchup.home_points_if_win,
      })),
      entries,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error." },
      { status: 500 },
    );
  }
}
