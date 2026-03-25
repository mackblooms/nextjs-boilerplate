import { NextResponse } from "next/server";

type EspnTeam = {
  id?: string | number;
  displayName?: string;
  logos?: Array<{ href?: string }>;
  logo?: string;
};

type EspnCompetitor = {
  homeAway?: "home" | "away";
  score?: string;
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

type LiveScoreState = "LIVE" | "UPCOMING" | "FINAL";

type LiveScoreRow = {
  id: string;
  boxScoreUrl: string | null;
  state: LiveScoreState;
  detail: string;
  startTime: string | null;
  awayTeamId: string | null;
  homeTeamId: string | null;
  awayTeamName: string;
  homeTeamName: string;
  awayTeam: string;
  homeTeam: string;
  awayScore: number | null;
  homeScore: number | null;
};

const AUTO_SYNC_MIN_INTERVAL_MS = 20_000;
const SCOREBOARD_WINDOW_DAYS = 3;
let lastAutoSyncStartedAt = 0;
let autoSyncInFlight: Promise<void> | null = null;

function yyyymmdd(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function shiftDate(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function toBoundedInt(
  raw: string | null,
  fallback: number,
  min: number,
  max: number
) {
  if (raw == null) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  const whole = Math.trunc(n);
  if (whole < min || whole > max) return fallback;
  return whole;
}

function toLabel(c: EspnCompetitor | undefined, fallback: string) {
  return c?.team?.displayName?.trim() || fallback;
}

function toDisplayName(c: EspnCompetitor | undefined, fallback: string) {
  return c?.team?.displayName?.trim() || fallback;
}

function toScore(raw: string | undefined): number | null {
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function toState(status: EspnStatus | undefined): LiveScoreState {
  const state = status?.type?.state?.toLowerCase();
  if (state === "in") return "LIVE";
  if (state === "post" || status?.type?.completed) return "FINAL";
  return "UPCOMING";
}

function sortScores(a: LiveScoreRow, b: LiveScoreRow) {
  const rank = (state: LiveScoreState) =>
    state === "LIVE" ? 0 : state === "UPCOMING" ? 1 : 2;

  const rankDiff = rank(a.state) - rank(b.state);
  if (rankDiff !== 0) return rankDiff;

  const ta = a.startTime ? Date.parse(a.startTime) : Number.POSITIVE_INFINITY;
  const tb = b.startTime ? Date.parse(b.startTime) : Number.POSITIVE_INFINITY;

  if (a.state === "FINAL") return tb - ta;
  return ta - tb;
}

function isNcaaTournamentEvent(event: EspnEvent) {
  const comp = event.competitions?.[0];
  if (!comp) return false;

  const excludedPhrases = [
    "nit",
    "national invitation tournament",
    "college basketball crown",
    "cbi",
    "college basketball invitational",
    "the crown",
  ];

  const tournamentId = Number(comp.tournamentId);
  if (Number.isFinite(tournamentId)) {
    return tournamentId === 22;
  }

  const notesText = (comp.notes ?? [])
    .map((n) => n.headline ?? "")
    .join(" ")
    .toLowerCase();

  const headlineText = (comp.headlines ?? [])
    .map((h) => `${h.shortLinkText ?? ""} ${h.description ?? ""}`)
    .join(" ")
    .toLowerCase();

  const eventText = `${event.name ?? ""} ${event.shortName ?? ""}`.toLowerCase();
  const combined = `${notesText} ${headlineText} ${eventText}`;
  if (excludedPhrases.some((phrase) => combined.includes(phrase))) return false;

  if (combined.includes("men's basketball championship")) return true;
  if (combined.includes("mens basketball championship")) return true;
  if (combined.includes("ncaa tournament")) return true;
  if (combined.includes("ncaa men's tournament")) return true;
  if (combined.includes("march madness")) return true;

  return false;
}

function normalizeEvent(event: EspnEvent): LiveScoreRow | null {
  const comp = event.competitions?.[0];
  const competitors = comp?.competitors ?? [];
  const home = competitors.find((c) => c.homeAway === "home");
  const away = competitors.find((c) => c.homeAway === "away");
  if (!home || !away) return null;
  const awayLabel = toLabel(away, "Away Team");
  const homeLabel = toLabel(home, "Home Team");
  const awayName = toDisplayName(away, awayLabel);
  const homeName = toDisplayName(home, homeLabel);

  const eventId = event.id?.trim() || null;
  const boxScoreUrl = eventId && /^\d+$/.test(eventId)
    ? `https://www.espn.com/mens-college-basketball/boxscore/_/gameId/${eventId}`
    : null;

  return {
    id: eventId ?? `${event.date ?? "game"}-${awayLabel}-${homeLabel}`,
    boxScoreUrl,
    state: toState(event.status),
    detail: event.status?.type?.shortDetail?.trim() || "Scheduled",
    startTime: event.date ?? null,
    awayTeamId: away.team?.id ? String(away.team.id) : null,
    homeTeamId: home.team?.id ? String(home.team.id) : null,
    awayTeamName: awayName,
    homeTeamName: homeName,
    awayTeam: awayLabel,
    homeTeam: homeLabel,
    awayScore: toScore(away.score),
    homeScore: toScore(home.score),
  };
}

function queueAutoScoreSync(req: Request, rows: LiveScoreRow[]) {
  const hasFinalGame = rows.some((row) => row.state === "FINAL");
  if (!hasFinalGame) return;
  if (autoSyncInFlight) return;

  const now = Date.now();
  if (now - lastAutoSyncStartedAt < AUTO_SYNC_MIN_INTERVAL_MS) return;
  lastAutoSyncStartedAt = now;

  const origin = new URL(req.url).origin;
  autoSyncInFlight = (async () => {
    try {
      await fetch(`${origin}/api/admin/sync-scores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lookbackDays: 3 }),
        cache: "no-store",
      });
    } catch {
      // Best-effort background sync: ignore transient failures.
    } finally {
      autoSyncInFlight = null;
    }
  })();
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const lookbackDays = toBoundedInt(url.searchParams.get("lookbackDays"), 1, 0, 45);
    const lookaheadDays = toBoundedInt(url.searchParams.get("lookaheadDays"), 1, 0, 14);
    const rangeParams: string[] = [];
    for (let day = -lookbackDays; day <= lookaheadDays; day += SCOREBOARD_WINDOW_DAYS) {
      const endDay = Math.min(day + SCOREBOARD_WINDOW_DAYS - 1, lookaheadDays);
      const startDate = yyyymmdd(shiftDate(day));
      const endDate = yyyymmdd(shiftDate(endDay));
      rangeParams.push(startDate === endDate ? startDate : `${startDate}-${endDate}`);
    }

    const payloads = await Promise.all(
      rangeParams.map(async (dateParam) => {
        const endpoint =
          `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${dateParam}&groups=50&limit=500`;
        const res = await fetch(endpoint, { cache: "no-store" });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`ESPN error ${res.status} (${dateParam}): ${text}`);
        }
        return (await res.json()) as EspnScoreboard;
      })
    );

    const rawEvents: EspnEvent[] = [];
    const seenIds = new Set<string>();
    for (const payload of payloads) {
      for (const event of payload.events ?? []) {
        if (!isNcaaTournamentEvent(event)) continue;
        const id = event.id;
        if (!id) {
          rawEvents.push(event);
          continue;
        }
        if (seenIds.has(id)) continue;
        seenIds.add(id);
        rawEvents.push(event);
      }
    }

    const rows = rawEvents
      .map(normalizeEvent)
      .filter((row): row is LiveScoreRow => row !== null)
      .sort(sortScores);

    queueAutoScoreSync(req, rows);

    return NextResponse.json({
      ok: true,
      updatedAt: new Date().toISOString(),
      lookbackDays,
      lookaheadDays,
      games: rows,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Failed to load live scores.",
      },
      { status: 500 }
    );
  }
}
