import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

const KEY = process.env.SPORTS_DATA_IO_KEY ?? process.env.SPORTSDATAIO_KEY;
const BASE = "https://api.sportsdata.io";
const DEFAULT_SEASON = new Date().getUTCFullYear();

type SportsGame = {
  GameID?: number;
  GameId?: number;
  gameId?: number;
  HomeTeam?: string | null;
  AwayTeam?: string | null;
  HomeTeamSeed?: number | string | null;
  AwayTeamSeed?: number | string | null;
  Status?: string | null;
  status?: string | null;
  DateTimeUTC?: string | null;
  DateTime?: string | null;
  Day?: string | null;
  Bracket?: string | null;
  bracket?: string | null;
  Round?: number | string | null;
  round?: number | string | null;
  Slot?: number | string | null;
  slot?: number | string | null;
  TournamentDisplayOrder?: number | string | null;
  BracketPosition?: number | string | null;
  HomeTeamID?: number | null;
  AwayTeamID?: number | null;
};

type SportsTeamMeta = {
  name: string | null;
  logoUrl: string | null;
};

type LocalGameRow = {
  id: string;
  sportsdata_game_id: number | null;
  team1_id: string | null;
  team2_id: string | null;
};

async function fetchJsonOrEmpty(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();

  return {
    ok: res.ok,
    status: res.status,
    statusText: res.statusText,
    body: text,
    json: (() => {
      try {
        return text && text.trim() ? JSON.parse(text) : null;
      } catch {
        return null;
      }
    })(),
  };
}

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();

function describeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const anyErr = e as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    if (typeof anyErr.message === "string") {
      const extra = [anyErr.code, anyErr.details, anyErr.hint]
        .filter((v) => typeof v === "string" && v.trim().length > 0)
        .join(" | ");
      return extra ? `${anyErr.message} (${extra})` : anyErr.message;
    }
    try {
      return JSON.stringify(e);
    } catch {
      return String(e);
    }
  }
  return "Unknown error";
}

function isMissingColumnError(message: string): boolean {
  const msg = message.toLowerCase();
  return msg.includes("column") && msg.includes("does not exist");
}

function toSeason(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(String(value).trim());
  if (!Number.isFinite(n)) return null;
  const year = Math.trunc(n);
  if (year < 2000 || year > 2100) return null;
  return year;
}

function toBool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "true" || v === "1" || v === "yes" || v === "on") return true;
    if (v === "false" || v === "0" || v === "no" || v === "off") return false;
  }
  return null;
}

async function parseSyncParams(req: Request): Promise<{ season: number; sportsDataOnly: boolean }> {
  const url = new URL(req.url);
  let season = toSeason(url.searchParams.get("season"));
  let sportsDataOnly = toBool(url.searchParams.get("sportsDataOnly")) ?? false;

  if (req.method === "POST") {
    try {
      const body = await req.json();
      const bodySeason = toSeason(body?.season);
      const bodySportsDataOnly = toBool(body?.sportsDataOnly);
      if (bodySeason) season = bodySeason;
      if (bodySportsDataOnly != null) sportsDataOnly = bodySportsDataOnly;
    } catch {
      // Allow empty or invalid JSON bodies and fall back to default.
    }
  }

  return {
    season: season ?? DEFAULT_SEASON,
    sportsDataOnly,
  };
}

function bracketToRegion(bracket: unknown): "East" | "West" | "South" | "Midwest" | null {
  const b = norm(bracket);
  if (b.includes("east")) return "East";
  if (b.includes("west")) return "West";
  if (b.includes("south")) return "South";
  if (b.includes("midwest")) return "Midwest";
  return null;
}

function roundToCode(roundValue: unknown): "R64" | "R32" | "S16" | "E8" | "F4" | "CHIP" | null {
  const roundText = norm(roundValue);
  const asNum = Number(roundValue);

  if (!Number.isNaN(asNum)) {
    // SportsData tournament feeds vary:
    // - Some use 1..6
    // - Some use 2,4,6,8,10,12
    if (asNum === 1 || asNum === 2) return "R64";
    if (asNum === 3 || asNum === 4) return "R32";
    if (asNum === 5 || asNum === 6) return "S16";
    if (asNum === 7 || asNum === 8) return "E8";
    if (asNum === 9 || asNum === 10) return "F4";
    if (asNum === 11 || asNum === 12) return "CHIP";
  }

  if (roundText.includes("64")) return "R64";
  if (roundText.includes("32")) return "R32";
  if (roundText.includes("16") || roundText.includes("sweet")) return "S16";
  if (roundText.includes("elite")) return "E8";
  if (roundText.includes("final four") || roundText === "f4" || roundText.includes("semifinal")) return "F4";
  if (roundText.includes("champ")) return "CHIP";

  return null;
}

function mapDisplayOrderToSlot(
  roundCode: "R64" | "R32" | "S16" | "E8" | "F4" | "CHIP",
  displayOrder: unknown,
  bracketValue: unknown
): number | null {
  const d = Number(displayOrder);
  if (!Number.isFinite(d) || d <= 0) return null;

  if (roundCode === "R64") {
    // NCAA tournament feed often encodes first round as:
    // 2,4,6,8,10,12,10,11 within a region.
    if (d === 2) return 1;
    if (d === 4) return 2;
    if (d === 6) return 3;
    if (d === 8) return 4;
    if (d === 12) return 6;
    if (d === 11) return 8;
    // d=10 maps to two slots (commonly 5 and 7), so treat as ambiguous here.
    return null;
  }

  if (roundCode === "R32" || roundCode === "S16" || roundCode === "E8") {
    return d % 2 === 0 ? d / 2 : null;
  }

  if (roundCode === "F4") {
    const b = norm(bracketValue);
    if (b.includes("south") && b.includes("west")) return 1;
    if (b.includes("east") && b.includes("midwest")) return 2;
    return null;
  }

  if (roundCode === "CHIP") {
    if (d === 1 || d === 2) return 1;
  }

  return null;
}

function readSlot(
  g: SportsGame,
  roundCode: "R64" | "R32" | "S16" | "E8" | "F4" | "CHIP"
): number | null {
  const candidates = [g.Slot, g.slot, g.BracketPosition];
  for (const candidate of candidates) {
    const n = Number(candidate);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return mapDisplayOrderToSlot(roundCode, g.TournamentDisplayOrder, g.Bracket ?? g.bracket);
}

function getSportsGameId(g: SportsGame): number | null {
  const n = Number(g.GameID ?? g.GameId ?? g.gameId);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  const s = String(value).trim();
  return s || null;
}

function toDateOnly(value: unknown): string | null {
  const iso = toIso(value);
  return iso ? iso.slice(0, 10) : null;
}

function toInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toSeed(value: unknown): number | null {
  const n = toInt(value);
  if (!n || n < 1 || n > 16) return null;
  return n;
}

function toText(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function readSportsTeamId(row: unknown): number | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const n = Number(r.TeamID ?? r.TeamId ?? r.teamId ?? r.SportsDataId ?? r.SportsDataID);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function readSportsTeamName(row: unknown): string | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  return (
    toText(r.School) ??
    toText(r.Name) ??
    toText(r.Team) ??
    toText(r.City) ??
    toText(r.Key) ??
    null
  );
}

function readSportsTeamLogo(row: unknown): string | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  return (
    toText(r.WikipediaLogoUrl) ??
    toText(r.LogoUrl) ??
    toText(r.TeamLogoUrl) ??
    toText(r.logo_url) ??
    toText(r.logoUrl) ??
    null
  );
}

async function fetchSportsTeamMeta(): Promise<Map<number, SportsTeamMeta>> {
  const out = new Map<number, SportsTeamMeta>();
  if (!KEY) return out;

  const url = `${BASE}/v3/cbb/scores/json/teams?key=${encodeURIComponent(KEY)}`;
  const resp = await fetchJsonOrEmpty(url);
  if (!resp.ok || !resp.json) return out;

  const raw = resp.json as unknown;
  const rows: unknown[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { Teams?: unknown[] })?.Teams)
    ? ((raw as { Teams: unknown[] }).Teams as unknown[])
    : Array.isArray((raw as { teams?: unknown[] })?.teams)
    ? ((raw as { teams: unknown[] }).teams as unknown[])
    : [];

  for (const row of rows) {
    const id = readSportsTeamId(row);
    if (!id) continue;
    out.set(id, {
      name: readSportsTeamName(row),
      logoUrl: readSportsTeamLogo(row),
    });
  }

  return out;
}

function costForSeed(seed: number | null): number | null {
  if (!seed) return null;
  const map: Record<number, number> = {
    1: 22,
    2: 19,
    3: 14,
    4: 12,
    5: 10,
    6: 8,
    7: 7,
    8: 6,
    9: 6,
    10: 5,
    11: 4,
    12: 4,
    13: 3,
    14: 3,
    15: 2,
    16: 1,
  };
  return map[seed] ?? null;
}

function expectedSeedsForR64Slot(slot: number): [number, number] | null {
  const map: Record<number, [number, number]> = {
    1: [1, 16],
    2: [8, 9],
    3: [5, 12],
    4: [4, 13],
    5: [6, 11],
    6: [3, 14],
    7: [7, 10],
    8: [2, 15],
  };
  return map[slot] ?? null;
}

type RoundCode = "R64" | "R32" | "S16" | "E8" | "F4" | "CHIP";
type FallbackRoundSlot = {
  roundCode: RoundCode;
  slot: number;
  region: "East" | "West" | "South" | "Midwest";
};
type SportsTeamAggregate = {
  name: string | null;
  seed: number | null;
  region: "East" | "West" | "South" | "Midwest" | null;
  logoUrl: string | null;
  seedPriority: number;
  regionPriority: number;
};

function roundPriority(roundCode: RoundCode | null): number {
  switch (roundCode) {
    case "R64":
      return 6;
    case "R32":
      return 5;
    case "S16":
      return 4;
    case "E8":
      return 3;
    case "F4":
      return 2;
    case "CHIP":
      return 1;
    default:
      return 0;
  }
}

function buildPlaceholderFallbackMap(games: SportsGame[]) {
  const byRegion = new Map<"East" | "West" | "South" | "Midwest", SportsGame[]>();

  for (const g of games) {
    const gameId = getSportsGameId(g);
    const region = bracketToRegion(g.Bracket ?? g.bracket);
    const roundCode = roundToCode(g.Round ?? g.round);
    if (!gameId || !region || roundCode) continue;

    if (!byRegion.has(region)) byRegion.set(region, []);
    byRegion.get(region)!.push(g);
  }

  const map = new Map<number, FallbackRoundSlot>();
  const regionTemplate: Array<{ roundCode: RoundCode; count: number }> = [
    { roundCode: "R64", count: 8 },
    { roundCode: "R32", count: 4 },
    { roundCode: "S16", count: 2 },
    { roundCode: "E8", count: 1 },
  ];

  for (const [region, regionGames] of byRegion.entries()) {
    const sorted = [...regionGames].sort((a, b) => {
      const aTs = Date.parse(String(a.DateTimeUTC ?? a.DateTime ?? a.Day ?? "")) || 0;
      const bTs = Date.parse(String(b.DateTimeUTC ?? b.DateTime ?? b.Day ?? "")) || 0;
      if (aTs !== bTs) return aTs - bTs;
      return (getSportsGameId(a) ?? 0) - (getSportsGameId(b) ?? 0);
    });

    let i = 0;
    for (const stage of regionTemplate) {
      for (let slot = 1; slot <= stage.count; slot++) {
        const g = sorted[i++];
        const gameId = g ? getSportsGameId(g) : null;
        if (!gameId) continue;
        map.set(gameId, { roundCode: stage.roundCode, slot, region });
      }
    }
  }

  return map;
}

async function hasScheduleColumns(supabaseAdmin: ReturnType<typeof getSupabaseAdmin>): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from("games")
    .select("id,status,start_time,game_date")
    .limit(1);

  if (!error) return true;

  const msg = describeError(error);
  if (isMissingColumnError(msg)) return false;
  throw new Error(msg);
}

async function runSyncBracket(season: number, sportsDataOnly: boolean) {
  if (!KEY) throw new Error("Missing SportsData key. Set SPORTS_DATA_IO_KEY or SPORTSDATAIO_KEY.");
  const url = `${BASE}/v3/cbb/scores/json/Tournament/${season}?key=${encodeURIComponent(KEY)}`;
  const resp = await fetchJsonOrEmpty(url);

  if (resp.ok && (!resp.body || !resp.body.trim())) {
    return {
      season,
      url,
      status: resp.status,
      note: "Tournament data not available yet (empty response body).",
    };
  }

  if (!resp.ok) {
    throw new Error(
      `SportsDataIO ${resp.status} ${resp.statusText}\nURL: ${url}\nBody:\n${resp.body || "(empty)"}`
    );
  }

  if (!resp.json) {
    throw new Error(
      `SportsDataIO returned non-JSON.\nURL: ${url}\nFirst 500 chars:\n${(resp.body || "").slice(0, 500)}`
    );
  }

  const raw = resp.json as unknown;
  const gamesArray: SportsGame[] | null = Array.isArray(raw)
    ? (raw as SportsGame[])
    : Array.isArray((raw as { Games?: unknown[] })?.Games)
    ? ((raw as { Games: SportsGame[] }).Games as SportsGame[])
    : Array.isArray((raw as { games?: unknown[] })?.games)
    ? ((raw as { games: SportsGame[] }).games as SportsGame[])
    : null;

  if (!gamesArray) {
    return {
      season,
      url,
      status: resp.status,
      note: "Tournament returned JSON, but no games array was found.",
      receivedType: Array.isArray(raw) ? "array" : typeof raw,
      sampleKeys:
        raw && typeof raw === "object" && !Array.isArray(raw)
          ? Object.keys(raw as Record<string, unknown>).slice(0, 40)
          : null,
    };
  }

  const supabaseAdmin = getSupabaseAdmin();
  const scheduleColumnsAvailable = await hasScheduleColumns(supabaseAdmin);
  const gameSelectCols = scheduleColumnsAvailable
    ? "id,sportsdata_game_id,team1_id,team2_id,status,start_time,game_date"
    : "id,sportsdata_game_id,team1_id,team2_id";

  const placeholderFallback = buildPlaceholderFallbackMap(gamesArray);
  const sportsTeamMeta = await fetchSportsTeamMeta();
  const sportsTeams = new Map<number, SportsTeamAggregate>();
  for (const g of gamesArray) {
    const gameId = getSportsGameId(g);
    let roundCode = roundToCode(g.Round ?? g.round);
    let region = bracketToRegion(g.Bracket ?? g.bracket);

    if (gameId && !roundCode) {
      const fallback = placeholderFallback.get(gameId);
      if (fallback) {
        roundCode = fallback.roundCode;
        region = region ?? fallback.region;
      }
    }

    const priority = roundPriority(roundCode);

    const homeId = toInt(g.HomeTeamID);
    if (homeId) {
      const existing = sportsTeams.get(homeId);
      const meta = sportsTeamMeta.get(homeId);
      const incomingSeed = roundCode === "R64" ? toSeed(g.HomeTeamSeed) : null;
      sportsTeams.set(homeId, {
        name: existing?.name ?? meta?.name ?? toIso(g.HomeTeam),
        seed:
          incomingSeed != null && priority >= (existing?.seedPriority ?? 0)
            ? incomingSeed
            : (existing?.seed ?? null),
        region:
          region && priority >= (existing?.regionPriority ?? 0)
            ? region
            : (existing?.region ?? null),
        logoUrl: existing?.logoUrl ?? meta?.logoUrl ?? null,
        seedPriority:
          incomingSeed != null && priority >= (existing?.seedPriority ?? 0)
            ? priority
            : (existing?.seedPriority ?? 0),
        regionPriority:
          region && priority >= (existing?.regionPriority ?? 0)
            ? priority
            : (existing?.regionPriority ?? 0),
      });
    }

    const awayId = toInt(g.AwayTeamID);
    if (awayId) {
      const existing = sportsTeams.get(awayId);
      const meta = sportsTeamMeta.get(awayId);
      const incomingSeed = roundCode === "R64" ? toSeed(g.AwayTeamSeed) : null;
      sportsTeams.set(awayId, {
        name: existing?.name ?? meta?.name ?? toIso(g.AwayTeam),
        seed:
          incomingSeed != null && priority >= (existing?.seedPriority ?? 0)
            ? incomingSeed
            : (existing?.seed ?? null),
        region:
          region && priority >= (existing?.regionPriority ?? 0)
            ? region
            : (existing?.region ?? null),
        logoUrl: existing?.logoUrl ?? meta?.logoUrl ?? null,
        seedPriority:
          incomingSeed != null && priority >= (existing?.seedPriority ?? 0)
            ? priority
            : (existing?.seedPriority ?? 0),
        regionPriority:
          region && priority >= (existing?.regionPriority ?? 0)
            ? priority
            : (existing?.regionPriority ?? 0),
      });
    }
  }

  let teamsCreated = 0;
  let teamsUpdated = 0;

  const sportsTeamIds = Array.from(sportsTeams.keys());
  const localTeamBySports = new Map<number, string>();

  if (sportsTeamIds.length > 0) {
    const { data: existingTeams, error: existingTeamsErr } = await supabaseAdmin
      .from("teams")
      .select("id,sportsdata_team_id,name,seed,seed_in_region,region,cost,logo_url")
      .in("sportsdata_team_id", sportsTeamIds);
    if (existingTeamsErr) throw existingTeamsErr;

    const existingBySportsId = new Map<number, Record<string, unknown>>();
    for (const row of existingTeams ?? []) {
      existingBySportsId.set(Number(row.sportsdata_team_id), row as unknown as Record<string, unknown>);
    }

    for (const [sportsId, incoming] of sportsTeams.entries()) {
      const existing = existingBySportsId.get(sportsId);
      const incomingSeed = incoming.seed;
      const incomingCost = costForSeed(incomingSeed);

      if (!existing) {
        const { error: insErr } = await supabaseAdmin.from("teams").insert({
          sportsdata_team_id: sportsId,
          name: incoming.name ?? `Team ${sportsId}`,
          seed: incomingSeed,
          seed_in_region: incomingSeed,
          region: incoming.region,
          cost: incomingCost,
          logo_url: incoming.logoUrl,
        });
        if (insErr) throw insErr;
        teamsCreated++;
        continue;
      }

      const updates: Record<string, unknown> = {};
      const existingSeed = toSeed(existing.seed);
      const existingSeedInRegion = toSeed(existing.seed_in_region);

      if (incoming.name && incoming.name !== existing.name) updates.name = incoming.name;
      if (incomingSeed != null && incomingSeed !== existingSeed) updates.seed = incomingSeed;
      if (incomingSeed != null && incomingSeed !== existingSeedInRegion) {
        updates.seed_in_region = incomingSeed;
      }
      if (existing.seed != null && existingSeed == null) updates.seed = incomingSeed;
      if (existing.seed_in_region != null && existingSeedInRegion == null) {
        updates.seed_in_region = incomingSeed;
      }
      if (incoming.region && incoming.region !== existing.region) updates.region = incoming.region;
      if (incomingCost != null && incomingCost !== Number(existing.cost ?? NaN)) updates.cost = incomingCost;
      if (incoming.logoUrl && incoming.logoUrl !== String(existing.logo_url ?? "")) {
        updates.logo_url = incoming.logoUrl;
      }

      if (Object.keys(updates).length > 0) {
        const { error: updErr } = await supabaseAdmin
          .from("teams")
          .update(updates)
          .eq("id", String(existing.id));
        if (updErr) throw updErr;
        teamsUpdated++;
      }
    }

    const { data: syncedTeams, error: syncedTeamsErr } = await supabaseAdmin
      .from("teams")
      .select("id,sportsdata_team_id")
      .in("sportsdata_team_id", sportsTeamIds);
    if (syncedTeamsErr) throw syncedTeamsErr;

    for (const t of syncedTeams ?? []) {
      localTeamBySports.set(Number(t.sportsdata_team_id), String(t.id));
    }
  }

  const { data: existingLinkedRows, error: existingLinkedErr } = await supabaseAdmin
    .from("games")
    .select("id,sportsdata_game_id")
    .not("sportsdata_game_id", "is", null);
  if (existingLinkedErr) throw existingLinkedErr;

  const sportsGameOwner = new Map<number, string>();
  for (const row of existingLinkedRows ?? []) {
    const sportsId = Number(row.sportsdata_game_id);
    if (!Number.isFinite(sportsId)) continue;
    sportsGameOwner.set(sportsId, String(row.id));
  }

  let linked = 0;
  let alreadyLinked = 0;
  let skippedNoMap = 0;
  let skippedAmbiguous = 0;
  let matchedBySlot = 0;
  let matchedByTeams = 0;
  let matchedByPlaceholder = 0;
  let scheduleUpdated = 0;
  let skippedDuplicateSportsId = 0;
  let gameTeamsUpdated = 0;
  let normalizedSeedTeams = 0;
  const nowIso = new Date().toISOString();
  let clearedR64Teams = 0;
  let teamsWithoutSeed = 0;
  let teamsWithoutLogo = 0;

  if (sportsDataOnly) {
    const { data: r64Rows, error: r64SelErr } = await supabaseAdmin
      .from("games")
      .select("id")
      .eq("round", "R64")
      .or("team1_id.not.is.null,team2_id.not.is.null");
    if (r64SelErr) throw r64SelErr;

    clearedR64Teams = r64Rows?.length ?? 0;
    if (clearedR64Teams > 0) {
      const { error: clearErr } = await supabaseAdmin
        .from("games")
        .update({
          team1_id: null,
          team2_id: null,
          last_synced_at: nowIso,
        })
        .eq("round", "R64");
      if (clearErr) throw clearErr;
    }
  }

  for (const g of gamesArray) {
    const gameId = getSportsGameId(g);
    let roundCode = roundToCode(g.Round ?? g.round);
    let region = bracketToRegion(g.Bracket ?? g.bracket);
    let slot = roundCode ? readSlot(g, roundCode) : null;

    if (gameId && !roundCode) {
      const fallback = placeholderFallback.get(gameId);
      if (fallback) {
        roundCode = fallback.roundCode;
        region = fallback.region;
        slot = fallback.slot;
      }
    }

    if (!gameId || !roundCode) {
      skippedNoMap++;
      continue;
    }

    let ourGame: LocalGameRow | null = null;

    if (slot) {
      let slotQuery = supabaseAdmin
        .from("games")
        .select(gameSelectCols)
        .eq("round", roundCode)
        .eq("slot", slot)
        .limit(2);

      if (roundCode === "R64" || roundCode === "R32" || roundCode === "S16" || roundCode === "E8") {
        if (region) slotQuery = slotQuery.eq("region", region);
      }

      const { data: slotMatches, error: slotErr } = await slotQuery;
      if (slotErr) throw slotErr;

      if ((slotMatches?.length ?? 0) === 1) {
        ourGame = slotMatches?.[0] as unknown as LocalGameRow;
        if (placeholderFallback.has(gameId)) {
          matchedByPlaceholder++;
        } else {
          matchedBySlot++;
        }
      } else if ((slotMatches?.length ?? 0) > 1) {
        skippedAmbiguous++;
        continue;
      }
    }

    if (!ourGame) {
      const homeLocal = localTeamBySports.get(Number(g.HomeTeamID));
      const awayLocal = localTeamBySports.get(Number(g.AwayTeamID));

      if (homeLocal && awayLocal) {
        let teamQuery = supabaseAdmin
          .from("games")
          .select(gameSelectCols)
          .eq("round", roundCode)
          .or(
            `and(team1_id.eq.${homeLocal},team2_id.eq.${awayLocal}),and(team1_id.eq.${awayLocal},team2_id.eq.${homeLocal})`
          )
          .limit(2);

        if ((roundCode === "R64" || roundCode === "R32" || roundCode === "S16" || roundCode === "E8") && region) {
          teamQuery = teamQuery.eq("region", region);
        }

        const { data: teamMatches, error: teamErr2 } = await teamQuery;
        if (teamErr2) throw teamErr2;

        if ((teamMatches?.length ?? 0) === 1) {
          ourGame = teamMatches?.[0] as unknown as LocalGameRow;
          matchedByTeams++;
        } else if ((teamMatches?.length ?? 0) > 1) {
          skippedAmbiguous++;
          continue;
        }
      }
    }

    if (!ourGame) {
      skippedNoMap++;
      continue;
    }

    const existingOwner = sportsGameOwner.get(gameId);
    if (existingOwner && existingOwner !== ourGame.id) {
      skippedDuplicateSportsId++;
      continue;
    }

    const needsLink = ourGame.sportsdata_game_id !== gameId;
    const needsScheduleUpdate = scheduleColumnsAvailable;
    const homeLocal = localTeamBySports.get(Number(g.HomeTeamID));
    const awayLocal = localTeamBySports.get(Number(g.AwayTeamID));
    const hasGameTeams = !!homeLocal && !!awayLocal;
    const nextTeam1 = hasGameTeams ? awayLocal : null;
    const nextTeam2 = hasGameTeams ? homeLocal : null;
    const needsGameTeamsUpdate =
      hasGameTeams &&
      (ourGame.team1_id !== nextTeam1 || ourGame.team2_id !== nextTeam2);

    if (!needsLink && !needsScheduleUpdate && !needsGameTeamsUpdate) {
      alreadyLinked++;
      continue;
    }

    const updatePayload: Record<string, unknown> = {
      last_synced_at: nowIso,
    };
    if (needsLink) updatePayload.sportsdata_game_id = gameId;
    if (scheduleColumnsAvailable) {
      updatePayload.status = toIso(g.Status ?? g.status);
      updatePayload.start_time = toIso(g.DateTimeUTC ?? g.DateTime ?? null);
      updatePayload.game_date = toDateOnly(g.Day ?? g.DateTimeUTC ?? g.DateTime ?? null);
    }
    if (needsGameTeamsUpdate) {
      updatePayload.team1_id = nextTeam1;
      updatePayload.team2_id = nextTeam2;
    }

    const { error: updErr } = await supabaseAdmin
      .from("games")
      .update(updatePayload)
      .eq("id", ourGame.id);

    if (updErr) throw updErr;
    if (needsLink) {
      if (ourGame.sportsdata_game_id != null) {
        sportsGameOwner.delete(Number(ourGame.sportsdata_game_id));
      }
      sportsGameOwner.set(gameId, ourGame.id);
      ourGame.sportsdata_game_id = gameId;
      linked++;
    } else {
      alreadyLinked++;
    }
    if (scheduleColumnsAvailable) scheduleUpdated++;
    if (needsGameTeamsUpdate) {
      ourGame.team1_id = nextTeam1;
      ourGame.team2_id = nextTeam2;
      gameTeamsUpdated++;
    }
  }

  const { data: r64Games, error: r64GamesErr } = await supabaseAdmin
    .from("games")
    .select("slot,team1_id,team2_id")
    .eq("round", "R64")
    .not("team1_id", "is", null)
    .not("team2_id", "is", null);
  if (r64GamesErr) throw r64GamesErr;

  const r64TeamIds = Array.from(
    new Set(
      (r64Games ?? []).flatMap((g) => [String(g.team1_id ?? ""), String(g.team2_id ?? "")]).filter(Boolean)
    )
  );

  if (r64TeamIds.length > 0) {
    const { data: r64Teams, error: r64TeamsErr } = await supabaseAdmin
      .from("teams")
      .select("id,seed,seed_in_region,cost")
      .in("id", r64TeamIds);
    if (r64TeamsErr) throw r64TeamsErr;

    const teamById = new Map<string, { id: string; seed: number | null; seed_in_region: number | null; cost: number | null }>();
    for (const row of r64Teams ?? []) {
      teamById.set(String(row.id), {
        id: String(row.id),
        seed: toSeed(row.seed),
        seed_in_region: toSeed(row.seed_in_region),
        cost: row.cost == null ? null : toInt(row.cost),
      });
    }

    for (const g of r64Games ?? []) {
      const team1Id = String(g.team1_id ?? "");
      const team2Id = String(g.team2_id ?? "");
      if (!team1Id || !team2Id) continue;

      const pair = expectedSeedsForR64Slot(Number(g.slot));
      if (!pair) continue;

      const team1 = teamById.get(team1Id);
      const team2 = teamById.get(team2Id);
      if (!team1 || !team2) continue;

      const s1 = team1.seed_in_region ?? team1.seed;
      const s2 = team2.seed_in_region ?? team2.seed;

      const diffA = Math.abs((s1 ?? pair[0]) - pair[0]) + Math.abs((s2 ?? pair[1]) - pair[1]);
      const diffB = Math.abs((s1 ?? pair[1]) - pair[1]) + Math.abs((s2 ?? pair[0]) - pair[0]);

      const target1 = diffB < diffA ? pair[1] : pair[0];
      const target2 = diffB < diffA ? pair[0] : pair[1];

      const nextCost1 = costForSeed(target1);
      const nextCost2 = costForSeed(target2);

      if (team1.seed !== target1 || team1.seed_in_region !== target1 || team1.cost !== nextCost1) {
        const { error: updTeam1Err } = await supabaseAdmin
          .from("teams")
          .update({
            seed: target1,
            seed_in_region: target1,
            cost: nextCost1,
          })
          .eq("id", team1Id);
        if (updTeam1Err) throw updTeam1Err;
        team1.seed = target1;
        team1.seed_in_region = target1;
        team1.cost = nextCost1;
        normalizedSeedTeams++;
      }

      if (team2.seed !== target2 || team2.seed_in_region !== target2 || team2.cost !== nextCost2) {
        const { error: updTeam2Err } = await supabaseAdmin
          .from("teams")
          .update({
            seed: target2,
            seed_in_region: target2,
            cost: nextCost2,
          })
          .eq("id", team2Id);
        if (updTeam2Err) throw updTeam2Err;
        team2.seed = target2;
        team2.seed_in_region = target2;
        team2.cost = nextCost2;
        normalizedSeedTeams++;
      }
    }
  }

  for (const incoming of sportsTeams.values()) {
    if (incoming.seed == null) teamsWithoutSeed++;
    if (!incoming.logoUrl) teamsWithoutLogo++;
  }

  return {
    season,
    url,
    status: resp.status,
    note: "Linked SportsData games to local games using bracket hierarchy first, then team fallback.",
    totalGamesInPayload: gamesArray.length,
    linked,
    alreadyLinked,
    matchedBySlot,
    matchedByPlaceholder,
    matchedByTeams,
    scheduleUpdated,
    scheduleColumnsAvailable,
    teamsSeenInPayload: sportsTeamIds.length,
    teamsCreated,
    teamsUpdated,
    normalizedSeedTeams,
    gameTeamsUpdated,
    teamsWithoutSeed,
    teamsWithoutLogo,
    sportsDataOnly,
    clearedR64Teams,
    skippedDuplicateSportsId,
    skippedNoMap,
    skippedAmbiguous,
    sampleGame: gamesArray[0] ?? null,
  };
}

export async function GET(req: Request) {
  try {
    const { season, sportsDataOnly } = await parseSyncParams(req);
    const result = await runSyncBracket(season, sportsDataOnly);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: describeError(e) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  return GET(req);
}
