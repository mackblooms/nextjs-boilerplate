import { NextResponse } from "next/server";
import { requireSiteAdmin } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const SPORTS_DATA_BASE = "https://api.sportsdata.io";
const SPORTS_DATA_KEY = process.env.SPORTS_DATA_IO_KEY ?? process.env.SPORTSDATAIO_KEY;
const PLAYER_DATA_SOURCE_URL = process.env.PLAYER_DATA_SOURCE_URL;
const PLAYER_DATA_SOURCE_KEY = process.env.PLAYER_DATA_SOURCE_KEY;

function toString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function clamp(value: number | null, min: number, max: number): number | null {
  if (value == null || Number.isNaN(value)) return null;
  return Math.min(Math.max(value, min), max);
}

function safeValue<T>(value: T | null | undefined, fallback: T): T {
  return value == null ? fallback : value;
}

function normalizeUrl(url: string, season: number) {
  let normalized = url.replace(/{season}/gi, String(season));
  if (normalized.includes("{key}")) {
    const key = PLAYER_DATA_SOURCE_KEY ?? SPORTS_DATA_KEY;
    if (!key) throw new Error("Missing PLAYER_DATA_SOURCE_KEY or SPORTS_DATA_IO_KEY for URL placeholder replacement.");
    normalized = normalized.replace(/\{key\}/gi, encodeURIComponent(key));
  }

  if (!normalized.includes("?") && !normalized.includes("{key}")) {
    const key = PLAYER_DATA_SOURCE_KEY ?? SPORTS_DATA_KEY;
    if (key) {
      normalized += `?key=${encodeURIComponent(key)}`;
    }
  }

  return normalized;
}

function tryGetField(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && toString(value) !== null) return value;
    const lower = key.toLowerCase();
    const lowerKey = Object.keys(row).find((candidate) => candidate.toLowerCase() === lower);
    if (lowerKey) {
      const maybe = row[lowerKey];
      if (maybe !== undefined && maybe !== null && toString(maybe) !== null) return maybe;
    }
  }
  return null;
}

function composeName(row: Record<string, unknown>) {
  const first = toString(tryGetField(row, "FirstName", "firstName", "first_name"));
  const last = toString(tryGetField(row, "LastName", "lastName", "last_name"));
  if (first && last) return `${first} ${last}`;
  const full = toString(tryGetField(row, "Name", "Player", "FullName", "DisplayName", "player_name", "name"));
  return full;
}

function extractNumber(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = tryGetField(row, key);
    const num = toNumber(value);
    if (num != null) return num;
  }
  return null;
}

function derivePctFromCounts(row: Record<string, unknown>, madeKeys: string[], attKeys: string[]) {
  const made = extractNumber(row, ...madeKeys);
  const att = extractNumber(row, ...attKeys);
  if (made != null && att != null && att > 0) return made / att;
  return null;
}

type NormalizedPlayerRow = {
  name: string;
  team: string | null;
  position: string | null;
  age: number | null;
  year: string | null;
  coach: string | null;
  system: string | null;
  role: string | null;
  previous_ppg: number | null;
  previous_rpg: number | null;
  previous_apg: number | null;
  previous_3p: number | null;
  previous_fg: number | null;
  previous_ft: number | null;
  previous_bpg: number | null;
  previous_spg: number | null;
  previous_mpg: number | null;
};

function normalizePlayerRow(raw: unknown): NormalizedPlayerRow | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const name = composeName(row);
  if (!name) return null;

  const games = extractNumber(row, "Games", "GamesPlayed", "GP");
  const ppg = safeValue(
    extractNumber(row, "PointsPerGame", "PPG", "PTS", "Points"),
    null
  );
  const rpg = safeValue(
    extractNumber(row, "ReboundsPerGame", "RPG", "TRB", "Rebounds"),
    null
  );
  const apg = safeValue(
    extractNumber(row, "AssistsPerGame", "APG", "AST", "Assists"),
    null
  );

  const points = extractNumber(row, "Points", "PTS");
  const rebounds = extractNumber(row, "Rebounds", "TRB");
  const assists = extractNumber(row, "Assists", "AST");

  const previousPPG = ppg ?? (points != null && games ? points / games : null);
  const previousRPG = rpg ?? (rebounds != null && games ? rebounds / games : null);
  const previousAPG = apg ?? (assists != null && games ? assists / games : null);

  const previous3P = safeValue(
    extractNumber(row, "ThreePointFieldGoalsPercentage", "ThreePointPercentage", "ThreePointPct", "ThreePointersPercentage"),
    null
  ) ?? derivePctFromCounts(row, ["ThreePointersMade", "ThreePointFieldGoalsMade", "3PM"], ["ThreePointersAttempted", "ThreePointFieldGoalsAttempted", "3PA"]);

  const previousFG = safeValue(
    extractNumber(row, "FieldGoalsPercentage", "FGPercentage", "FGPct", "FG_PCT"),
    null
  );

  const previousFT = safeValue(
    extractNumber(row, "FreeThrowPercentage", "FTPercentage", "FTPct", "FT_PCT"),
    null
  );

  const previousBPG = safeValue(
    extractNumber(row, "BlocksPerGame", "BPG", "BlockedShots", "Blocks"),
    null
  );

  const previousSPG = safeValue(
    extractNumber(row, "StealsPerGame", "SPG", "Steals"),
    null
  );

  const previousMPG = safeValue(
    extractNumber(row, "MinutesPerGame", "MIN", "Minutes"),
    null
  );

  return {
    name,
    team: toString(tryGetField(row, "Team", "School", "College", "TeamName")),
    position: toString(tryGetField(row, "Position", "Pos")),
    age: extractNumber(row, "Age", "Years"),
    year: toString(tryGetField(row, "Year", "Class", "SchoolYear", "Season")),
    coach: toString(tryGetField(row, "Coach", "HeadCoach")),
    system: toString(tryGetField(row, "System", "Scheme", "Offense", "Defense")),
    role: toString(tryGetField(row, "Role", "DepthChartPosition", "Status")),
    previous_ppg: previousPPG != null ? Number(previousPPG.toFixed(2)) : null,
    previous_rpg: previousRPG != null ? Number(previousRPG.toFixed(2)) : null,
    previous_apg: previousAPG != null ? Number(previousAPG.toFixed(2)) : null,
    previous_3p: previous3P != null ? Number(previous3P.toFixed(4)) : null,
    previous_fg: previousFG != null ? Number(previousFG.toFixed(4)) : null,
    previous_ft: previousFT != null ? Number(previousFT.toFixed(4)) : null,
    previous_bpg: previousBPG != null ? Number(previousBPG.toFixed(2)) : null,
    previous_spg: previousSPG != null ? Number(previousSPG.toFixed(2)) : null,
    previous_mpg: previousMPG != null ? Number(previousMPG.toFixed(2)) : null,
  };
}

function choosePlayersArray(body: unknown) {
  if (Array.isArray(body)) return body;
  if (body && typeof body === "object") {
    const candidate = body as Record<string, unknown>;
    if (Array.isArray(candidate.players)) return candidate.players;
    if (Array.isArray(candidate.data)) return candidate.data;
    if (Array.isArray(candidate.results)) return candidate.results;
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const auth = await requireSiteAdmin(req);
    if ("response" in auth) return auth.response;

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const season = Number(body.season ?? new Date().getUTCFullYear());
    if (!Number.isFinite(season) || season < 2000 || season > 2100) {
      return NextResponse.json({ error: "Invalid season. Submit a valid year like 2026." }, { status: 400 });
    }

    const customUrl = toString(body.url ?? body.sourceUrl ?? PLAYER_DATA_SOURCE_URL);
    let url: string;

    if (customUrl) {
      url = normalizeUrl(customUrl, season);
    } else if (SPORTS_DATA_KEY) {
      url = `${SPORTS_DATA_BASE}/v3/cbb/stats/json/PlayerSeasonStats/${season}?key=${encodeURIComponent(
        SPORTS_DATA_KEY
      )}`;
    } else {
      return NextResponse.json(
        {
          error:
            "No player data source is configured. Set PLAYER_DATA_SOURCE_URL or SPORTS_DATA_IO_KEY in environment variables.",
        },
        { status: 500 }
      );
    }

    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json({ error: `Source fetch failed ${response.status}: ${text}` }, { status: 500 });
    }

    const payload = await response.json();
    const rows = choosePlayersArray(payload);
    if (!rows) {
      return NextResponse.json({ error: "Remote source did not return a player list array." }, { status: 500 });
    }

    const normalized = rows.map(normalizePlayerRow).filter((row): row is NormalizedPlayerRow => row !== null);
    if (normalized.length === 0) {
      return NextResponse.json({ error: "No valid player rows were parsed from the remote source." }, { status: 500 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("players").upsert(normalized, { onConflict: "name" });
    if (error) {
      return NextResponse.json({ error: `Database import failed: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ ok: true, imported: normalized.length, source: url });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
