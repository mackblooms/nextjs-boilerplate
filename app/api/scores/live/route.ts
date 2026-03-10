import { NextResponse } from "next/server";

type EspnTeam = {
  id?: string | number;
  displayName?: string;
  abbreviation?: string;
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
  status?: EspnStatus;
  competitions?: EspnCompetition[];
};

type EspnScoreboard = {
  events?: EspnEvent[];
};

type LiveScoreState = "LIVE" | "UPCOMING" | "FINAL";

type LiveScoreRow = {
  id: string;
  state: LiveScoreState;
  detail: string;
  startTime: string | null;
  awayTeamId: string | null;
  homeTeamId: string | null;
  awayTeamName: string;
  homeTeamName: string;
  awayLogoUrl: string | null;
  homeLogoUrl: string | null;
  awayTeam: string;
  homeTeam: string;
  awayScore: number | null;
  homeScore: number | null;
};

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

function toLabel(c: EspnCompetitor | undefined, fallback: string) {
  return c?.team?.abbreviation?.trim() || c?.team?.displayName?.trim() || fallback;
}

function toDisplayName(c: EspnCompetitor | undefined, fallback: string) {
  return c?.team?.displayName?.trim() || c?.team?.abbreviation?.trim() || fallback;
}

function toLogoUrl(c: EspnCompetitor | undefined): string | null {
  const fromPayload = c?.team?.logo?.trim() || c?.team?.logos?.[0]?.href?.trim() || null;
  if (fromPayload) {
    return fromPayload.replace(/^http:\/\//i, "https://");
  }

  const teamId = c?.team?.id ? String(c.team.id) : null;
  if (!teamId) return null;
  return `https://a.espncdn.com/i/teamlogos/ncaa/500/${teamId}.png`;
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

function normalizeEvent(event: EspnEvent): LiveScoreRow | null {
  const comp = event.competitions?.[0];
  const competitors = comp?.competitors ?? [];
  const home = competitors.find((c) => c.homeAway === "home");
  const away = competitors.find((c) => c.homeAway === "away");
  if (!home || !away) return null;
  const awayLabel = toLabel(away, "AWAY");
  const homeLabel = toLabel(home, "HOME");
  const awayName = toDisplayName(away, awayLabel);
  const homeName = toDisplayName(home, homeLabel);

  return {
    id: event.id ?? `${event.date ?? "game"}-${awayLabel}-${homeLabel}`,
    state: toState(event.status),
    detail: event.status?.type?.shortDetail?.trim() || "Scheduled",
    startTime: event.date ?? null,
    awayTeamId: away.team?.id ? String(away.team.id) : null,
    homeTeamId: home.team?.id ? String(home.team.id) : null,
    awayTeamName: awayName,
    homeTeamName: homeName,
    awayLogoUrl: toLogoUrl(away),
    homeLogoUrl: toLogoUrl(home),
    awayTeam: awayLabel,
    homeTeam: homeLabel,
    awayScore: toScore(away.score),
    homeScore: toScore(home.score),
  };
}

export async function GET() {
  try {
    const dateKeys = [yyyymmdd(shiftDate(-1)), yyyymmdd(shiftDate(0)), yyyymmdd(shiftDate(1))];

    const responses = await Promise.all(
      dateKeys.map(async (dateKey) => {
        const url =
          `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${dateKey}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`ESPN error ${res.status} (${dateKey}): ${text}`);
        }

        return (await res.json()) as EspnScoreboard;
      })
    );

    const rawEvents: EspnEvent[] = [];
    const seenIds = new Set<string>();
    for (const payload of responses) {
      for (const event of payload.events ?? []) {
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
      .sort(sortScores)
      .slice(0, 18);

    return NextResponse.json({ ok: true, updatedAt: new Date().toISOString(), games: rows });
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
