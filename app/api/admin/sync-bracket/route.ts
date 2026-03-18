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

function isTeamsNameUniqueViolation(error: unknown): boolean {
  const msg = describeError(error).toLowerCase();
  return msg.includes("teams_name_key") || (msg.includes("duplicate key value") && msg.includes("key (name)="));
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
    toSchoolName(r.School) ??
    toSchoolName(r.Name) ??
    toSchoolName(r.Team) ??
    toSchoolName(r.City) ??
    toSchoolName(r.Key) ??
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

type RegionName = "East" | "West" | "South" | "Midwest";

function isRegionName(value: unknown): value is RegionName {
  return value === "East" || value === "West" || value === "South" || value === "Midwest";
}

function normName(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[()'.]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const SCHOOL_NAME_OVERRIDES: Record<string, string> = {
  "siena saints": "Siena",
  "tcu horned frogs": "TCU",
  "ohio state buckeyes": "Ohio State",
  "northern iowa panthers": "Northern Iowa",
  "furman paladins": "Furman",
  "miami hurricanes": "Miami (FL)",
  miami: "Miami (FL)",
  "miami redhawks": "Miami (OH)",
  "miami oh": "Miami (OH)",
  "miami ohio": "Miami (OH)",
  "miami oh redhawks": "Miami (OH)",
  "miami ohio redhawks": "Miami (OH)",
};

function toSchoolName(value: unknown): string | null {
  const text = toText(value);
  if (!text) return null;
  const override = SCHOOL_NAME_OVERRIDES[normName(text)];
  return override ?? text;
}

function canonicalSchoolKey(value: string): string {
  return normName(value.replace(/[()]/g, " ").replace(/\//g, " "));
}

function miamiCampusKey(value: string): "fl" | "oh" | null {
  const n = canonicalSchoolKey(value);
  if (!n.includes("miami")) return null;
  if (/\bfl(orida)?\b/.test(n)) return "fl";
  if (/\boh(io)?\b/.test(n)) return "oh";
  return null;
}

function nameLooksLikeCanonical(existingName: string, canonicalName: string): boolean {
  const existing = canonicalSchoolKey(existingName);
  const canonical = canonicalSchoolKey(canonicalName);
  if (!existing || !canonical) return false;

  const existingMiami = miamiCampusKey(existingName);
  const canonicalMiami = miamiCampusKey(canonicalName);
  if (existingMiami && canonicalMiami && existingMiami !== canonicalMiami) return false;

  if (existing === canonical) return true;
  const canonicalWords = canonical.split(" ").filter(Boolean);
  const existingWords = existing.split(" ").filter(Boolean);
  const existingStartsWithCanonical = existing.startsWith(`${canonical} `);
  const canonicalStartsWithExisting = canonical.startsWith(`${existing} `);

  // Guard against matching schools like "Michigan State" to canonical "Michigan".
  if (canonicalWords.length === 1 && existingStartsWithCanonical) {
    const secondWord = existingWords[1] ?? "";
    if (secondWord === "state" || secondWord === "st") return false;
  }
  if (existingWords.length === 1 && canonicalStartsWithExisting) {
    const secondWord = canonicalWords[1] ?? "";
    if (secondWord === "state" || secondWord === "st") return false;
  }

  if (existingStartsWithCanonical) return true;
  if (canonicalStartsWithExisting) return true;
  return false;
}

type PlayInAnchor = {
  favoriteSchool: string;
  placeholderName: string;
  region: RegionName;
  slot: number;
  favoriteSeed: number;
  underdogSeed: number;
};

const PLAY_IN_ANCHORS: PlayInAnchor[] = [
  {
    favoriteSchool: "Florida",
    placeholderName: "Lehigh/PVAMU",
    region: "South",
    slot: 1,
    favoriteSeed: 1,
    underdogSeed: 16,
  },
  {
    favoriteSchool: "BYU",
    placeholderName: "NC State/Texas",
    region: "West",
    slot: 5,
    favoriteSeed: 6,
    underdogSeed: 11,
  },
  {
    favoriteSchool: "Michigan",
    placeholderName: "Howard/UMBC",
    region: "Midwest",
    slot: 1,
    favoriteSeed: 1,
    underdogSeed: 16,
  },
  {
    favoriteSchool: "Tennessee",
    placeholderName: "SMU/Miami OH",
    region: "Midwest",
    slot: 5,
    favoriteSeed: 6,
    underdogSeed: 11,
  },
];

function isPlayInPlaceholderName(name: string | null | undefined): boolean {
  const normalized = normName(name);
  if (!normalized) return false;
  if (normalized.includes("first four winner")) return true;
  return PLAY_IN_ANCHORS.some((anchor) => normalized === normName(anchor.placeholderName));
}

type CanonicalSlotTeam = { name: string; seed: number };
type CanonicalR64Slot = {
  region: RegionName;
  slot: number;
  favorite: CanonicalSlotTeam;
  underdog: CanonicalSlotTeam;
};

const NCAA_2026_CANONICAL_R64: CanonicalR64Slot[] = [
  { region: "East", slot: 1, favorite: { name: "Duke", seed: 1 }, underdog: { name: "Siena", seed: 16 } },
  { region: "East", slot: 2, favorite: { name: "Ohio State", seed: 8 }, underdog: { name: "TCU", seed: 9 } },
  { region: "East", slot: 3, favorite: { name: "St. John's", seed: 5 }, underdog: { name: "Northern Iowa", seed: 12 } },
  { region: "East", slot: 4, favorite: { name: "Kansas", seed: 4 }, underdog: { name: "Cal Baptist", seed: 13 } },
  { region: "East", slot: 5, favorite: { name: "Louisville", seed: 6 }, underdog: { name: "South Florida", seed: 11 } },
  { region: "East", slot: 6, favorite: { name: "Michigan State", seed: 3 }, underdog: { name: "North Dakota State", seed: 14 } },
  { region: "East", slot: 7, favorite: { name: "UCLA", seed: 7 }, underdog: { name: "UCF", seed: 10 } },
  { region: "East", slot: 8, favorite: { name: "UConn", seed: 2 }, underdog: { name: "Furman", seed: 15 } },

  { region: "West", slot: 1, favorite: { name: "Arizona", seed: 1 }, underdog: { name: "Long Island", seed: 16 } },
  { region: "West", slot: 2, favorite: { name: "Villanova", seed: 8 }, underdog: { name: "Utah State", seed: 9 } },
  { region: "West", slot: 3, favorite: { name: "Wisconsin", seed: 5 }, underdog: { name: "High Point", seed: 12 } },
  { region: "West", slot: 4, favorite: { name: "Arkansas", seed: 4 }, underdog: { name: "Hawaii", seed: 13 } },
  { region: "West", slot: 5, favorite: { name: "BYU", seed: 6 }, underdog: { name: "NC State/Texas", seed: 11 } },
  { region: "West", slot: 6, favorite: { name: "Gonzaga", seed: 3 }, underdog: { name: "Kennesaw State", seed: 14 } },
  { region: "West", slot: 7, favorite: { name: "Miami (FL)", seed: 7 }, underdog: { name: "Missouri", seed: 10 } },
  { region: "West", slot: 8, favorite: { name: "Purdue", seed: 2 }, underdog: { name: "Queens (N.C.)", seed: 15 } },

  { region: "South", slot: 1, favorite: { name: "Florida", seed: 1 }, underdog: { name: "Lehigh/PVAMU", seed: 16 } },
  { region: "South", slot: 2, favorite: { name: "Clemson", seed: 8 }, underdog: { name: "Iowa", seed: 9 } },
  { region: "South", slot: 3, favorite: { name: "Vanderbilt", seed: 5 }, underdog: { name: "McNeese", seed: 12 } },
  { region: "South", slot: 4, favorite: { name: "Nebraska", seed: 4 }, underdog: { name: "Troy", seed: 13 } },
  { region: "South", slot: 5, favorite: { name: "North Carolina", seed: 6 }, underdog: { name: "VCU", seed: 11 } },
  { region: "South", slot: 6, favorite: { name: "Illinois", seed: 3 }, underdog: { name: "Penn", seed: 14 } },
  { region: "South", slot: 7, favorite: { name: "Saint Mary's", seed: 7 }, underdog: { name: "Texas A&M", seed: 10 } },
  { region: "South", slot: 8, favorite: { name: "Houston", seed: 2 }, underdog: { name: "Idaho", seed: 15 } },

  { region: "Midwest", slot: 1, favorite: { name: "Michigan", seed: 1 }, underdog: { name: "Howard/UMBC", seed: 16 } },
  { region: "Midwest", slot: 2, favorite: { name: "Georgia", seed: 8 }, underdog: { name: "Saint Louis", seed: 9 } },
  { region: "Midwest", slot: 3, favorite: { name: "Texas Tech", seed: 5 }, underdog: { name: "Akron", seed: 12 } },
  { region: "Midwest", slot: 4, favorite: { name: "Alabama", seed: 4 }, underdog: { name: "Hofstra", seed: 13 } },
  { region: "Midwest", slot: 5, favorite: { name: "Tennessee", seed: 6 }, underdog: { name: "SMU/Miami OH", seed: 11 } },
  { region: "Midwest", slot: 6, favorite: { name: "Virginia", seed: 3 }, underdog: { name: "Wright State", seed: 14 } },
  { region: "Midwest", slot: 7, favorite: { name: "Kentucky", seed: 7 }, underdog: { name: "Santa Clara", seed: 10 } },
  { region: "Midwest", slot: 8, favorite: { name: "Iowa State", seed: 2 }, underdog: { name: "Tennessee State", seed: 15 } },
];

function slotForSeedPair(seedA: number | null, seedB: number | null): number | null {
  if (!seedA || !seedB) return null;
  const low = Math.min(seedA, seedB);
  const high = Math.max(seedA, seedB);
  if (low === 1 && high === 16) return 1;
  if (low === 8 && high === 9) return 2;
  if (low === 5 && high === 12) return 3;
  if (low === 4 && high === 13) return 4;
  if (low === 6 && high === 11) return 5;
  if (low === 3 && high === 14) return 6;
  if (low === 7 && high === 10) return 7;
  if (low === 2 && high === 15) return 8;
  return null;
}

type EspnTournamentTeam = {
  espnTeamId: number;
  name: string;
  seed: number | null;
  logoUrl: string | null;
};

type EspnR64Matchup = {
  region: RegionName;
  slot: number;
  startTime: string | null;
  status: string | null;
  favorite: EspnTournamentTeam;
  underdog: EspnTournamentTeam;
};

type TeamIdentityRow = {
  id: string;
  name: string | null;
  sportsdata_team_id?: number | null;
  espn_team_id?: number | null;
  logo_url?: string | null;
  seed?: number | null;
  seed_in_region?: number | null;
  region?: string | null;
  cost?: number | null;
};

type TeamBrandingOverride = {
  canonicalName: string;
  espnTeamId: number;
  aliases: string[];
};

const TEAM_BRANDING_OVERRIDES: TeamBrandingOverride[] = [
  {
    canonicalName: "Michigan",
    espnTeamId: 130,
    aliases: ["michigan", "michigan wolverines"],
  },
  {
    canonicalName: "Michigan State",
    espnTeamId: 127,
    aliases: ["michigan state", "michigan state spartans"],
  },
  {
    canonicalName: "Miami (FL)",
    espnTeamId: 2390,
    aliases: ["miami", "miami fl", "miami florida", "miami hurricanes", "miami (fl)"],
  },
  {
    canonicalName: "Miami (OH)",
    espnTeamId: 193,
    aliases: ["miami oh", "miami ohio", "miami (oh)", "miami redhawks", "miami oh redhawks"],
  },
];

const TEAM_BRANDING_BY_ALIAS = (() => {
  const out = new Map<string, TeamBrandingOverride>();
  for (const override of TEAM_BRANDING_OVERRIDES) {
    for (const alias of override.aliases) {
      out.set(normName(alias), override);
    }
    out.set(normName(override.canonicalName), override);
  }
  return out;
})();

function getTeamBrandingOverride(name: unknown): TeamBrandingOverride | null {
  const n = normName(name);
  if (!n) return null;
  return TEAM_BRANDING_BY_ALIAS.get(n) ?? null;
}

function toDateKeyUtc(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function parseEspnRegion(note: string): RegionName | null {
  const text = note.toLowerCase();
  if (text.includes("midwest")) return "Midwest";
  if (text.includes("south")) return "South";
  if (text.includes("east")) return "East";
  if (text.includes("west")) return "West";
  return null;
}

function isEspnTournamentFirstRoundHeadline(note: string): boolean {
  const text = note
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text.includes("mens basketball championship")) return false;
  return (
    text.includes("1st round") ||
    text.includes("first round") ||
    text.includes("round of 64")
  );
}

async function fetchEspnR64Matchups(season: number): Promise<EspnR64Matchup[]> {
  const start = new Date(Date.UTC(season, 2, 15));
  const end = new Date(Date.UTC(season, 3, 8));
  const keys: string[] = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    keys.push(toDateKeyUtc(d));
  }

  const out = new Map<string, EspnR64Matchup>();

  for (const key of keys) {
    const url =
      `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard` +
      `?dates=${key}&limit=700`;
    const resp = await fetchJsonOrEmpty(url);
    if (!resp.ok || !resp.json) continue;

    const events = Array.isArray((resp.json as { events?: unknown[] })?.events)
      ? (((resp.json as { events: unknown[] }).events as unknown[]) ?? [])
      : [];

    for (const event of events) {
      const e = (event ?? {}) as Record<string, unknown>;
      const competitions = Array.isArray(e.competitions) ? (e.competitions as unknown[]) : [];
      const comp = (competitions[0] ?? {}) as Record<string, unknown>;
      const notes = Array.isArray(comp.notes) ? (comp.notes as unknown[]) : [];
      const firstNote = (notes[0] ?? {}) as Record<string, unknown>;
      const headline = String(firstNote.headline ?? "").trim();
      if (!isEspnTournamentFirstRoundHeadline(headline)) continue;

      const region = parseEspnRegion(headline);
      if (!region) continue;

      const competitors = Array.isArray(comp.competitors) ? (comp.competitors as unknown[]) : [];
      if (competitors.length < 2) continue;

      const parsedTeams: EspnTournamentTeam[] = [];
      for (const competitor of competitors.slice(0, 2)) {
        const c = (competitor ?? {}) as Record<string, unknown>;
        const team = ((c.team ?? {}) as Record<string, unknown>);
        const teamId = Number(team.id);
        if (!Number.isFinite(teamId) || teamId <= 0) continue;

        const curatedRank = ((c.curatedRank ?? {}) as Record<string, unknown>);
        const seed = toSeed(curatedRank.current);
        const logos = Array.isArray(team.logos) ? (team.logos as unknown[]) : [];
        const firstLogo = (logos[0] ?? {}) as Record<string, unknown>;
        const logoFromPayload = toText(team.logo) ?? toText(firstLogo.href);
        const logoUrl =
          (logoFromPayload && logoFromPayload.replace(/^http:\/\//i, "https://")) ??
          `https://a.espncdn.com/i/teamlogos/ncaa/500/${Math.trunc(teamId)}.png`;

        const displayName =
          toText(team.shortDisplayName) ??
          toText(team.location) ??
          toText(team.displayName) ??
          toText(team.name) ??
          `Team ${Math.trunc(teamId)}`;
        const schoolName = toSchoolName(displayName) ?? displayName;

        parsedTeams.push({
          espnTeamId: Math.trunc(teamId),
          name: schoolName,
          seed,
          logoUrl,
        });
      }

      if (parsedTeams.length !== 2) continue;

      const slot = slotForSeedPair(parsedTeams[0].seed, parsedTeams[1].seed);
      if (!slot) continue;

      const [first, second] = parsedTeams;
      const favorite = (first.seed ?? 99) <= (second.seed ?? 99) ? first : second;
      const underdog = favorite === first ? second : first;
      const matchup: EspnR64Matchup = {
        region,
        slot,
        startTime: toIso(comp.date),
        status: toIso(((comp.status ?? {}) as Record<string, unknown>).type
          ? (((comp.status as Record<string, unknown>).type as Record<string, unknown>).name)
          : null),
        favorite,
        underdog,
      };

      out.set(`${region}:${slot}`, matchup);
    }
  }

  return Array.from(out.values());
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
        name: existing?.name ?? toSchoolName(meta?.name) ?? toSchoolName(g.HomeTeam),
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
        name: existing?.name ?? toSchoolName(meta?.name) ?? toSchoolName(g.AwayTeam),
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
      let existing = existingBySportsId.get(sportsId);
      const incomingSeed = incoming.seed;
      const incomingCost = costForSeed(incomingSeed);

      if (!existing && incoming.name) {
        const { data: byExactName, error: byExactNameErr } = await supabaseAdmin
          .from("teams")
          .select("id,sportsdata_team_id,name,seed,seed_in_region,region,cost,logo_url")
          .eq("name", incoming.name)
          .maybeSingle();
        if (byExactNameErr) throw byExactNameErr;
        if (byExactName) {
          existing = byExactName as unknown as Record<string, unknown>;
        }
      }

      if (!existing) {
        const insertPayload = {
          sportsdata_team_id: sportsId,
          name: incoming.name ?? `Team ${sportsId}`,
          seed: incomingSeed,
          seed_in_region: incomingSeed,
          region: incoming.region,
          cost: incomingCost,
          logo_url: incoming.logoUrl,
        };

        const { error: insErr } = await supabaseAdmin.from("teams").insert(insertPayload);
        if (insErr) {
          if (!isTeamsNameUniqueViolation(insErr) || !incoming.name) throw insErr;

          const { data: fallbackByName, error: fallbackByNameErr } = await supabaseAdmin
            .from("teams")
            .select("id,sportsdata_team_id,name,seed,seed_in_region,region,cost,logo_url")
            .eq("name", incoming.name)
            .maybeSingle();
          if (fallbackByNameErr) throw fallbackByNameErr;
          if (!fallbackByName) throw insErr;
          existing = fallbackByName as unknown as Record<string, unknown>;
        } else {
          teamsCreated++;
          continue;
        }
      }

      const updates: Record<string, unknown> = {};
      const existingSeed = toSeed(existing.seed);
      const existingSeedInRegion = toSeed(existing.seed_in_region);

      if (Number(existing.sportsdata_team_id ?? NaN) !== sportsId) updates.sportsdata_team_id = sportsId;
      if (incoming.name && incoming.name !== existing.name) {
        const { data: takenNameRow, error: takenNameErr } = await supabaseAdmin
          .from("teams")
          .select("id")
          .eq("name", incoming.name)
          .maybeSingle();
        if (takenNameErr) throw takenNameErr;
        if (!takenNameRow || String(takenNameRow.id) === String(existing.id)) {
          updates.name = incoming.name;
        }
      }
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
  let reassignedDuplicateSportsId = 0;
  let gameTeamsUpdated = 0;
  let espnFallbackMatchups = 0;
  let espnFallbackTeamsCreated = 0;
  let espnFallbackTeamsUpdated = 0;
  let espnFallbackGameTeamsUpdated = 0;
  let firstFourPlaceholdersCreated = 0;
  let firstFourSlotsFilled = 0;
  let playInAnchorsApplied = 0;
  let canonicalR64SlotsApplied = 0;
  let canonicalTeamsCreated = 0;
  let canonicalTeamsUpdated = 0;
  let canonicalR64RowsCreated = 0;
  let canonicalR64RowsRelocated = 0;
  let r64Backfilled = 0;
  let normalizedSeedTeams = 0;
  let r64SeedOrderFixed = 0;
  let brandingOverridesApplied = 0;
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
      const { error: clearOwnerErr } = await supabaseAdmin
        .from("games")
        .update({
          sportsdata_game_id: null,
          last_synced_at: nowIso,
        })
        .eq("id", existingOwner)
        .eq("sportsdata_game_id", gameId);

      if (clearOwnerErr) throw clearOwnerErr;

      sportsGameOwner.delete(gameId);
      reassignedDuplicateSportsId++;
    }

    const needsLink = ourGame.sportsdata_game_id !== gameId;
    const needsScheduleUpdate = scheduleColumnsAvailable;
    const homeLocal = localTeamBySports.get(Number(g.HomeTeamID));
    const awayLocal = localTeamBySports.get(Number(g.AwayTeamID));
    const hasGameTeams = !!homeLocal && !!awayLocal;
    let nextTeam1: string | null = null;
    let nextTeam2: string | null = null;
    if (hasGameTeams) {
      const homeSeed = toSeed(g.HomeTeamSeed);
      const awaySeed = toSeed(g.AwayTeamSeed);
      if (roundCode === "R64" && homeSeed != null && awaySeed != null) {
        if (homeSeed <= awaySeed) {
          nextTeam1 = homeLocal;
          nextTeam2 = awayLocal;
        } else {
          nextTeam1 = awayLocal;
          nextTeam2 = homeLocal;
        }
      } else {
        nextTeam1 = awayLocal;
        nextTeam2 = homeLocal;
      }
    }
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

  if (!sportsDataOnly) {
    const espnMatchups = await fetchEspnR64Matchups(season);
    espnFallbackMatchups = espnMatchups.length;

    if (espnMatchups.length > 0) {
      const espnIds = Array.from(
        new Set(
          espnMatchups.flatMap((m) => [m.favorite.espnTeamId, m.underdog.espnTeamId]).filter((n) => Number.isFinite(n) && n > 0)
        )
      );

      const { data: allTeams, error: allTeamsErr } = await supabaseAdmin
        .from("teams")
        .select("id,name,espn_team_id,seed,seed_in_region,region,cost,logo_url");
      if (allTeamsErr) throw allTeamsErr;

      const byEspn = new Map<number, Record<string, unknown>>();
      const byName = new Map<string, Record<string, unknown>>();
      const byExactName = new Map<string, Record<string, unknown>>();
      for (const row of allTeams ?? []) {
        const espnId = Number((row as Record<string, unknown>).espn_team_id);
        if (Number.isFinite(espnId) && espnId > 0) byEspn.set(espnId, row as unknown as Record<string, unknown>);
        const key = normName((row as Record<string, unknown>).name);
        if (key && !byName.has(key)) byName.set(key, row as unknown as Record<string, unknown>);
        const exact = toText((row as Record<string, unknown>).name);
        if (exact && !byExactName.has(exact.toLowerCase())) {
          byExactName.set(exact.toLowerCase(), row as unknown as Record<string, unknown>);
        }
      }

      const localIdByEspn = new Map<number, string>();

      for (const matchup of espnMatchups) {
        for (const side of [matchup.favorite, matchup.underdog]) {
          const espnId = side.espnTeamId;
          const existing =
            byEspn.get(espnId) ??
            byExactName.get(side.name.toLowerCase()) ??
            byName.get(normName(side.name)) ??
            null;
          const incomingSeed = side.seed;
          const incomingCost = costForSeed(incomingSeed);

          if (!existing) {
            const insertPayload = {
              name: side.name,
              espn_team_id: espnId,
              seed: incomingSeed,
              seed_in_region: incomingSeed,
              region: matchup.region,
              cost: incomingCost,
              logo_url: side.logoUrl,
            };

            const { data: inserted, error: insErr } = await supabaseAdmin
              .from("teams")
              .insert(insertPayload)
              .select("id")
              .single();
            if (insErr) {
              if (!isTeamsNameUniqueViolation(insErr)) throw insErr;

              const { data: fallbackByName, error: fallbackByNameErr } = await supabaseAdmin
                .from("teams")
                .select("id,name,espn_team_id,seed,seed_in_region,region,cost,logo_url")
                .eq("name", side.name)
                .maybeSingle();
              if (fallbackByNameErr) throw fallbackByNameErr;
              if (!fallbackByName) throw insErr;

              const updates: Record<string, unknown> = {};
              if (espnId !== Number(fallbackByName.espn_team_id ?? NaN)) updates.espn_team_id = espnId;
              if (incomingSeed != null && incomingSeed !== toSeed(fallbackByName.seed)) updates.seed = incomingSeed;
              if (incomingSeed != null && incomingSeed !== toSeed(fallbackByName.seed_in_region)) {
                updates.seed_in_region = incomingSeed;
              }
              if (matchup.region && matchup.region !== fallbackByName.region) updates.region = matchup.region;
              if (incomingCost != null && incomingCost !== toInt(fallbackByName.cost)) updates.cost = incomingCost;
              if (side.logoUrl && side.logoUrl !== toText(fallbackByName.logo_url)) updates.logo_url = side.logoUrl;

              if (Object.keys(updates).length > 0) {
                const { error: fallbackUpdErr } = await supabaseAdmin
                  .from("teams")
                  .update(updates)
                  .eq("id", String(fallbackByName.id));
                if (fallbackUpdErr) throw fallbackUpdErr;
                espnFallbackTeamsUpdated++;
              }

              localIdByEspn.set(espnId, String(fallbackByName.id));
              const merged = { ...(fallbackByName as Record<string, unknown>), ...updates, id: String(fallbackByName.id) };
              byEspn.set(espnId, merged);
              const mergedName = toText((merged as Record<string, unknown>).name);
              if (mergedName) {
                byName.set(normName(mergedName), merged);
                byExactName.set(mergedName.toLowerCase(), merged);
              }
            } else {
              const insertedId = String(inserted.id);
              localIdByEspn.set(espnId, insertedId);
              espnFallbackTeamsCreated++;
              const insertedRow: Record<string, unknown> = { ...insertPayload, id: insertedId };
              byEspn.set(espnId, insertedRow);
              byName.set(normName(side.name), insertedRow);
              byExactName.set(side.name.toLowerCase(), insertedRow);
            }
            continue;
          }

          const updates: Record<string, unknown> = {};
          if (side.name && side.name !== existing.name) {
            const exact = byExactName.get(side.name.toLowerCase());
            if (!exact || String(exact.id) === String(existing.id)) {
              updates.name = side.name;
            }
          }
          if (incomingSeed != null && incomingSeed !== toSeed(existing.seed)) updates.seed = incomingSeed;
          if (incomingSeed != null && incomingSeed !== toSeed(existing.seed_in_region)) {
            updates.seed_in_region = incomingSeed;
          }
          if (matchup.region && matchup.region !== existing.region) updates.region = matchup.region;
          if (incomingCost != null && incomingCost !== toInt(existing.cost)) updates.cost = incomingCost;
          if (side.logoUrl && side.logoUrl !== toText(existing.logo_url)) updates.logo_url = side.logoUrl;
          if (espnId !== Number(existing.espn_team_id ?? NaN)) updates.espn_team_id = espnId;

          if (Object.keys(updates).length > 0) {
            const { error: updErr } = await supabaseAdmin.from("teams").update(updates).eq("id", String(existing.id));
            if (updErr) throw updErr;
            espnFallbackTeamsUpdated++;
          }

          localIdByEspn.set(espnId, String(existing.id));
          const merged = { ...existing, ...updates, id: String(existing.id) };
          byEspn.set(espnId, merged);
          const mergedName = toText((merged as Record<string, unknown>).name);
          if (mergedName) {
            byName.set(normName(mergedName), merged);
            byExactName.set(mergedName.toLowerCase(), merged);
          }
        }
      }

      const { data: r64Rows, error: r64RowsErr } = await supabaseAdmin
        .from("games")
        .select("id,region,slot,team1_id,team2_id,status,start_time,game_date")
        .eq("round", "R64");
      if (r64RowsErr) throw r64RowsErr;

      const r64ByRegionSlot = new Map<string, Record<string, unknown>>();
      for (const row of r64Rows ?? []) {
        if (!isRegionName((row as Record<string, unknown>).region)) continue;
        const slot = Number((row as Record<string, unknown>).slot);
        if (!Number.isFinite(slot) || slot < 1 || slot > 8) continue;
        r64ByRegionSlot.set(`${(row as Record<string, unknown>).region}:${Math.trunc(slot)}`, row as unknown as Record<string, unknown>);
      }

      for (const matchup of espnMatchups) {
        const row = r64ByRegionSlot.get(`${matchup.region}:${matchup.slot}`);
        if (!row) continue;
        const underdogLocal = localIdByEspn.get(matchup.underdog.espnTeamId) ?? null;
        const favoriteLocal = localIdByEspn.get(matchup.favorite.espnTeamId) ?? null;
        if (!underdogLocal || !favoriteLocal) continue;

        const nextGameDate = matchup.startTime ? matchup.startTime.slice(0, 10) : null;
        const updatePayload: Record<string, unknown> = { last_synced_at: nowIso };

        if (row.team1_id !== favoriteLocal) updatePayload.team1_id = favoriteLocal;
        if (row.team2_id !== underdogLocal) updatePayload.team2_id = underdogLocal;
        if (scheduleColumnsAvailable) {
          if (matchup.status && matchup.status !== toText(row.status)) updatePayload.status = matchup.status;
          if (matchup.startTime && matchup.startTime !== toText(row.start_time)) updatePayload.start_time = matchup.startTime;
          if (nextGameDate && nextGameDate !== toText(row.game_date)) updatePayload.game_date = nextGameDate;
        }

        if (Object.keys(updatePayload).length > 1) {
          const { error: updErr } = await supabaseAdmin.from("games").update(updatePayload).eq("id", String(row.id));
          if (updErr) throw updErr;
          espnFallbackGameTeamsUpdated++;
        }
      }
    }
  }

  if (!sportsDataOnly) {
    const placeholderCache = new Map<string, string>();

    const ensurePlaceholderTeam = async (region: RegionName, seed: number): Promise<string> => {
      const key = `${region}:${seed}`;
      const cached = placeholderCache.get(key);
      if (cached) return cached;

      const name = `${region} ${seed}-Seed First Four Winner`;
      const { data: namedRow, error: namedErr } = await supabaseAdmin
        .from("teams")
        .select("id")
        .eq("name", name)
        .maybeSingle();
      if (namedErr) throw namedErr;

      if (namedRow?.id) {
        const id = String(namedRow.id);
        placeholderCache.set(key, id);
        return id;
      }

      const { data: candidateRows, error: candidateErr } = await supabaseAdmin
        .from("teams")
        .select("id,name,sportsdata_team_id,espn_team_id,seed,seed_in_region,region,cost")
        .eq("region", region)
        .eq("seed_in_region", seed)
        .is("sportsdata_team_id", null)
        .is("espn_team_id", null)
        .limit(5);
      if (candidateErr) throw candidateErr;

      const placeholderCandidate = (candidateRows ?? []).find((row) =>
        normName((row as TeamIdentityRow).name).includes("first four")
      ) as TeamIdentityRow | undefined;

      if (placeholderCandidate?.id) {
        const placeholderId = String(placeholderCandidate.id);
        if ((placeholderCandidate.name ?? "") !== name || toInt(placeholderCandidate.cost) !== costForSeed(seed)) {
          const { error: updPlaceholderErr } = await supabaseAdmin
            .from("teams")
            .update({
              name,
              seed: seed,
              seed_in_region: seed,
              region,
              cost: costForSeed(seed),
            })
            .eq("id", placeholderId);
          if (updPlaceholderErr) throw updPlaceholderErr;
        }

        placeholderCache.set(key, placeholderId);
        return placeholderId;
      }

      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from("teams")
        .insert({
          name,
          seed: seed,
          seed_in_region: seed,
          region,
          cost: costForSeed(seed),
        })
        .select("id")
        .single();
      if (insertErr) throw insertErr;

      const insertedId = String(inserted.id);
      placeholderCache.set(key, insertedId);
      firstFourPlaceholdersCreated++;
      return insertedId;
    };

    const { data: sparseR64Rows, error: sparseR64Err } = await supabaseAdmin
      .from("games")
      .select("id,region,slot,team1_id,team2_id")
      .eq("round", "R64")
      .or("team1_id.is.null,team2_id.is.null");
    if (sparseR64Err) throw sparseR64Err;

    const { data: seedRows, error: seedRowsErr } = await supabaseAdmin
      .from("teams")
      .select("id,name,region,seed,seed_in_region,sportsdata_team_id,espn_team_id")
      .in("region", ["East", "West", "South", "Midwest"]);
    if (seedRowsErr) throw seedRowsErr;

    const byRegionSeed = new Map<string, string>();
    for (const row of seedRows ?? []) {
      if (!isRegionName(row.region)) continue;
      const seed = toSeed(row.seed_in_region) ?? toSeed(row.seed);
      if (!seed) continue;
      const key = `${row.region}:${seed}`;

      const current = byRegionSeed.get(key);
      if (!current) {
        byRegionSeed.set(key, String(row.id));
        continue;
      }

      const candidateScore =
        (row.sportsdata_team_id ? 2 : 0) +
        (row.espn_team_id ? 2 : 0) +
        (normName(row.name).includes("first four") ? -3 : 0);
      const currentRow = (seedRows ?? []).find((t) => String(t.id) === current);
      const currentScore = currentRow
        ? (currentRow.sportsdata_team_id ? 2 : 0) +
          (currentRow.espn_team_id ? 2 : 0) +
          (normName(currentRow.name).includes("first four") ? -3 : 0)
        : -99;
      if (candidateScore > currentScore) {
        byRegionSeed.set(key, String(row.id));
      }
    }

    for (const row of sparseR64Rows ?? []) {
      const region = row.region;
      if (!isRegionName(region)) continue;
      const slot = Number(row.slot);
      const pair = expectedSeedsForR64Slot(slot);
      if (!pair) continue;

      const updatePayload: Record<string, unknown> = { last_synced_at: nowIso };
      if (!row.team1_id) {
        const favoriteId = byRegionSeed.get(`${region}:${pair[0]}`) ?? null;
        if (favoriteId) {
          updatePayload.team1_id = favoriteId;
        }
      }
      if (!row.team2_id) {
        const underdogId = byRegionSeed.get(`${region}:${pair[1]}`) ?? null;
        if (underdogId) {
          updatePayload.team2_id = underdogId;
        } else if (pair[1] === 11 || pair[1] === 16) {
          updatePayload.team2_id = await ensurePlaceholderTeam(region, pair[1]);
        }
      }

      if (Object.keys(updatePayload).length > 1) {
        const { error: updErr } = await supabaseAdmin
          .from("games")
          .update(updatePayload)
          .eq("id", String(row.id));
        if (updErr) throw updErr;
        firstFourSlotsFilled++;
      }
    }
  }

  if (!sportsDataOnly) {
    const { data: allTeams, error: allTeamsErr } = await supabaseAdmin
      .from("teams")
      .select("id,name,region,seed,seed_in_region,cost");
    if (allTeamsErr) throw allTeamsErr;

    const byNorm = new Map<string, Record<string, unknown>>();
    const teamNameById = new Map<string, string | null>();
    for (const row of allTeams ?? []) {
      if ((row as Record<string, unknown>).id) {
        teamNameById.set(String((row as Record<string, unknown>).id), toText((row as Record<string, unknown>).name));
      }
      const key = normName((row as Record<string, unknown>).name);
      if (key && !byNorm.has(key)) byNorm.set(key, row as unknown as Record<string, unknown>);
    }

    for (const anchor of PLAY_IN_ANCHORS) {
      const favorite = byNorm.get(normName(anchor.favoriteSchool)) ?? null;
      if (!favorite?.id) continue;

      const favoriteId = String(favorite.id);
      const favoriteUpdates: Record<string, unknown> = {};
      if (toSchoolName(favorite.name) !== favorite.name) favoriteUpdates.name = toSchoolName(favorite.name);
      if (toSeed(favorite.seed) !== anchor.favoriteSeed) favoriteUpdates.seed = anchor.favoriteSeed;
      if (toSeed(favorite.seed_in_region) !== anchor.favoriteSeed) favoriteUpdates.seed_in_region = anchor.favoriteSeed;
      if (favorite.region !== anchor.region) favoriteUpdates.region = anchor.region;
      if (toInt(favorite.cost) !== costForSeed(anchor.favoriteSeed)) {
        favoriteUpdates.cost = costForSeed(anchor.favoriteSeed);
      }
      if (Object.keys(favoriteUpdates).length > 0) {
        const { error: favUpdErr } = await supabaseAdmin
          .from("teams")
          .update(favoriteUpdates)
          .eq("id", favoriteId);
        if (favUpdErr) throw favUpdErr;
      }

      const { data: existingPlaceholder, error: placeholderErr } = await supabaseAdmin
        .from("teams")
        .select("id,name,region,seed,seed_in_region,cost")
        .eq("name", anchor.placeholderName)
        .maybeSingle();
      if (placeholderErr) throw placeholderErr;

      let placeholderId: string;
      if (!existingPlaceholder?.id) {
        const { data: insertedPlaceholder, error: insPlaceholderErr } = await supabaseAdmin
          .from("teams")
          .insert({
            name: anchor.placeholderName,
            region: anchor.region,
            seed: anchor.underdogSeed,
            seed_in_region: anchor.underdogSeed,
            cost: costForSeed(anchor.underdogSeed),
          })
          .select("id")
          .single();
        if (insPlaceholderErr) throw insPlaceholderErr;
        placeholderId = String(insertedPlaceholder.id);
      } else {
        placeholderId = String(existingPlaceholder.id);
        const placeholderUpdates: Record<string, unknown> = {};
        if (existingPlaceholder.region !== anchor.region) placeholderUpdates.region = anchor.region;
        if (toSeed(existingPlaceholder.seed) !== anchor.underdogSeed) placeholderUpdates.seed = anchor.underdogSeed;
        if (toSeed(existingPlaceholder.seed_in_region) !== anchor.underdogSeed) {
          placeholderUpdates.seed_in_region = anchor.underdogSeed;
        }
        if (toInt(existingPlaceholder.cost) !== costForSeed(anchor.underdogSeed)) {
          placeholderUpdates.cost = costForSeed(anchor.underdogSeed);
        }
        if (Object.keys(placeholderUpdates).length > 0) {
          const { error: updPlaceholderErr } = await supabaseAdmin
            .from("teams")
            .update(placeholderUpdates)
            .eq("id", placeholderId);
          if (updPlaceholderErr) throw updPlaceholderErr;
        }
      }

      const { data: targetGame, error: targetGameErr } = await supabaseAdmin
        .from("games")
        .select("id,team1_id,team2_id")
        .eq("round", "R64")
        .eq("region", anchor.region)
        .eq("slot", anchor.slot)
        .maybeSingle();
      if (targetGameErr) throw targetGameErr;
      if (!targetGame?.id) continue;

      await supabaseAdmin
        .from("games")
        .update({
          team1_id: null,
          last_synced_at: nowIso,
        })
        .eq("round", "R64")
        .neq("id", String(targetGame.id))
        .eq("team1_id", favoriteId);

      await supabaseAdmin
        .from("games")
        .update({
          team2_id: null,
          last_synced_at: nowIso,
        })
        .eq("round", "R64")
        .neq("id", String(targetGame.id))
        .eq("team2_id", placeholderId);

      const targetTeam2Id = toText(targetGame.team2_id);
      const targetTeam2Name = targetTeam2Id ? teamNameById.get(targetTeam2Id) ?? null : null;
      const keepResolvedUnderdog =
        !!targetTeam2Id &&
        targetTeam2Id !== placeholderId &&
        !isPlayInPlaceholderName(targetTeam2Name);

      const targetUpdate: Record<string, unknown> = {
        last_synced_at: nowIso,
      };
      if (targetGame.team1_id !== favoriteId) {
        targetUpdate.team1_id = favoriteId;
      }
      if (!keepResolvedUnderdog && targetGame.team2_id !== placeholderId) {
        targetUpdate.team2_id = placeholderId;
      }

      if (Object.keys(targetUpdate).length > 1) {
        const { error: targetUpdErr } = await supabaseAdmin
          .from("games")
          .update(targetUpdate)
          .eq("id", String(targetGame.id));
        if (targetUpdErr) throw targetUpdErr;
        playInAnchorsApplied++;
      }
    }
  }

  if (!sportsDataOnly && season === 2026) {
    const { data: r64Rows, error: r64RowsErr } = await supabaseAdmin
      .from("games")
      .select("id,region,slot,team1_id,team2_id")
      .eq("round", "R64");
    if (r64RowsErr) throw r64RowsErr;

    const { data: allTeams, error: allTeamsErr } = await supabaseAdmin
      .from("teams")
      .select("id,name,region,seed,seed_in_region,cost");
    if (allTeamsErr) throw allTeamsErr;

    const r64ByKey = new Map<string, Record<string, unknown>>();
    const r64ById = new Map<string, Record<string, unknown>>();
    for (const row of r64Rows ?? []) {
      r64ById.set(String((row as Record<string, unknown>).id), row as unknown as Record<string, unknown>);
      if (!isRegionName(row.region)) continue;
      const slot = Number(row.slot);
      if (!Number.isFinite(slot) || slot < 1 || slot > 8) continue;
      r64ByKey.set(`${row.region}:${Math.trunc(slot)}`, row as unknown as Record<string, unknown>);
    }
    const claimedR64Ids = new Set<string>();

    const teamRows = (allTeams ?? []) as TeamIdentityRow[];
    const byExact = new Map<string, TeamIdentityRow>();
    const teamNameById = new Map<string, string | null>();
    for (const t of teamRows) {
      const key = (toText(t.name) ?? "").toLowerCase();
      if (key && !byExact.has(key)) byExact.set(key, t);
      teamNameById.set(String(t.id), toText(t.name));
    }

    const claimedTeamIds = new Set<string>();
    const playInSlotKeys = new Set(PLAY_IN_ANCHORS.map((anchor) => `${anchor.region}:${anchor.slot}`));

    const resolveCanonicalTeam = async (
      team: CanonicalSlotTeam,
      region: RegionName
    ): Promise<string> => {
      const exactKey = team.name.toLowerCase();
      let chosen: TeamIdentityRow | null = byExact.get(exactKey) ?? null;

      if (!chosen) {
        chosen =
          teamRows.find((t) => !claimedTeamIds.has(String(t.id)) && !!t.name && nameLooksLikeCanonical(t.name, team.name)) ??
          null;
      }

      if (!chosen) {
        chosen =
          teamRows.find(
            (t) =>
              !claimedTeamIds.has(String(t.id)) &&
              isRegionName(t.region) &&
              t.region === region &&
              (toSeed(t.seed_in_region) ?? toSeed(t.seed)) === team.seed
          ) ?? null;
      }

      if (!chosen) {
        const { data: inserted, error: insertErr } = await supabaseAdmin
          .from("teams")
          .insert({
            name: team.name,
            region,
            seed: team.seed,
            seed_in_region: team.seed,
            cost: costForSeed(team.seed),
          })
          .select("id,name,region,seed,seed_in_region,cost")
          .single();
        if (insertErr) throw insertErr;
        chosen = inserted as unknown as TeamIdentityRow;
        teamRows.push(chosen);
        byExact.set((toText(chosen.name) ?? "").toLowerCase(), chosen);
        canonicalTeamsCreated++;
      }

      const chosenId = String(chosen.id);
      claimedTeamIds.add(chosenId);

      const updates: Record<string, unknown> = {};
      if (chosen.name !== team.name) {
        const existingByName = byExact.get(team.name.toLowerCase());
        if (!existingByName || String(existingByName.id) === chosenId) updates.name = team.name;
      }
      if ((toSeed(chosen.seed_in_region) ?? toSeed(chosen.seed)) !== team.seed) updates.seed = team.seed;
      if (toSeed(chosen.seed_in_region) !== team.seed) updates.seed_in_region = team.seed;
      if (chosen.region !== region) updates.region = region;
      if (toInt(chosen.cost) !== costForSeed(team.seed)) updates.cost = costForSeed(team.seed);

      if (Object.keys(updates).length > 0) {
        const { error: updErr } = await supabaseAdmin
          .from("teams")
          .update(updates)
          .eq("id", chosenId);
        if (updErr) throw updErr;
        canonicalTeamsUpdated++;

        chosen = { ...chosen, ...updates } as TeamIdentityRow;
      }

      const canonicalKey = team.name.toLowerCase();
      byExact.set(canonicalKey, chosen);
      teamNameById.set(chosenId, toText(chosen.name));
      return chosenId;
    };

    for (const slotDef of NCAA_2026_CANONICAL_R64) {
      let row = r64ByKey.get(`${slotDef.region}:${slotDef.slot}`) ?? null;

      if (!row) {
        const relocationCandidate = (r64Rows ?? []).find((candidate) => {
          const id = String((candidate as Record<string, unknown>).id ?? "");
          if (!id || claimedR64Ids.has(id)) return false;
          const candidateSlot = Number((candidate as Record<string, unknown>).slot);
          if (!Number.isFinite(candidateSlot) || Math.trunc(candidateSlot) !== slotDef.slot) return false;
          const candidateRegion = (candidate as Record<string, unknown>).region;
          const hasTeams =
            !!(candidate as Record<string, unknown>).team1_id ||
            !!(candidate as Record<string, unknown>).team2_id;
          if (hasTeams) return false;
          return !isRegionName(candidateRegion) || candidateRegion !== slotDef.region;
        }) as Record<string, unknown> | undefined;

        if (relocationCandidate?.id) {
          const { error: relocateErr } = await supabaseAdmin
            .from("games")
            .update({
              region: slotDef.region,
              slot: slotDef.slot,
              last_synced_at: nowIso,
            })
            .eq("id", String(relocationCandidate.id));
          if (relocateErr) throw relocateErr;

          row = {
            ...relocationCandidate,
            region: slotDef.region,
            slot: slotDef.slot,
          } as Record<string, unknown>;
          r64ById.set(String(row.id), row);
          r64ByKey.set(`${slotDef.region}:${slotDef.slot}`, row);
          canonicalR64RowsRelocated++;
        } else {
          const { data: insertedRow, error: insertGameErr } = await supabaseAdmin
            .from("games")
            .insert({
              round: "R64",
              region: slotDef.region,
              slot: slotDef.slot,
              team1_id: null,
              team2_id: null,
              winner_team_id: null,
              last_synced_at: nowIso,
            })
            .select("id,region,slot,team1_id,team2_id")
            .single();
          if (insertGameErr) throw insertGameErr;

          row = insertedRow as unknown as Record<string, unknown>;
          r64ById.set(String(row.id), row);
          r64ByKey.set(`${slotDef.region}:${slotDef.slot}`, row);
          canonicalR64RowsCreated++;
        }
      }
      if (!row?.id) continue;
      claimedR64Ids.add(String(row.id));

      const favoriteId = await resolveCanonicalTeam(slotDef.favorite, slotDef.region);
      const underdogId = await resolveCanonicalTeam(slotDef.underdog, slotDef.region);
      const slotKey = `${slotDef.region}:${slotDef.slot}`;
      const existingTeam2Id = toText(row.team2_id);
      const existingTeam2Name = existingTeam2Id ? teamNameById.get(existingTeam2Id) ?? null : null;
      const keepResolvedPlayInWinner =
        playInSlotKeys.has(slotKey) &&
        !!existingTeam2Id &&
        existingTeam2Id !== underdogId &&
        !isPlayInPlaceholderName(existingTeam2Name);
      const desiredUnderdogId = keepResolvedPlayInWinner ? existingTeam2Id : underdogId;

      await supabaseAdmin
        .from("games")
        .update({ team1_id: null, last_synced_at: nowIso })
        .eq("round", "R64")
        .neq("id", String(row.id))
        .eq("team1_id", favoriteId);
      await supabaseAdmin
        .from("games")
        .update({ team2_id: null, last_synced_at: nowIso })
        .eq("round", "R64")
        .neq("id", String(row.id))
        .eq("team2_id", desiredUnderdogId);

      if (row.team1_id !== favoriteId || row.team2_id !== desiredUnderdogId) {
        const { error: setGameErr } = await supabaseAdmin
          .from("games")
          .update({
            team1_id: favoriteId,
            team2_id: desiredUnderdogId,
            last_synced_at: nowIso,
          })
          .eq("id", String(row.id));
        if (setGameErr) throw setGameErr;
        canonicalR64SlotsApplied++;
      }
    }
  }

  if (!sportsDataOnly) {
    const { data: emptyR64Games, error: emptyR64Err } = await supabaseAdmin
      .from("games")
      .select("id,region,slot,team1_id,team2_id")
      .eq("round", "R64")
      .or("team1_id.is.null,team2_id.is.null");
    if (emptyR64Err) throw emptyR64Err;

    if ((emptyR64Games?.length ?? 0) > 0) {
      const { data: seedTeams, error: seedTeamsErr } = await supabaseAdmin
        .from("teams")
        .select("id,region,seed_in_region,seed")
        .in("region", ["East", "West", "South", "Midwest"]);
      if (seedTeamsErr) throw seedTeamsErr;

      const byRegionSeed = new Map<string, string>();
      const sortedSeedTeams = [...(seedTeams ?? [])].sort((a, b) => String(a.id).localeCompare(String(b.id)));
      for (const t of sortedSeedTeams) {
        if (!isRegionName(t.region)) continue;
        const seed = toSeed(t.seed_in_region) ?? toSeed(t.seed);
        if (!seed) continue;
        const key = `${t.region}:${seed}`;
        if (!byRegionSeed.has(key)) byRegionSeed.set(key, String(t.id));
      }

      for (const g of emptyR64Games ?? []) {
        if (!isRegionName(g.region)) continue;
        const pair = expectedSeedsForR64Slot(Number(g.slot));
        if (!pair) continue;

        const favorite = byRegionSeed.get(`${g.region}:${pair[0]}`) ?? null;
        const underdog = byRegionSeed.get(`${g.region}:${pair[1]}`) ?? null;
        if (!favorite || !underdog) continue;

        const nextTeam1 = g.team1_id ?? favorite;
        const nextTeam2 = g.team2_id ?? underdog;
        if (nextTeam1 === g.team1_id && nextTeam2 === g.team2_id) continue;

        const { error: fillErr } = await supabaseAdmin
          .from("games")
          .update({
            team1_id: nextTeam1,
            team2_id: nextTeam2,
            last_synced_at: nowIso,
          })
          .eq("id", String(g.id));
        if (fillErr) throw fillErr;
        r64Backfilled++;
      }
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

      const target1 = pair[0];
      const target2 = pair[1];

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

  const { data: r64OrderGames, error: r64OrderGamesErr } = await supabaseAdmin
    .from("games")
    .select("id,team1_id,team2_id")
    .eq("round", "R64")
    .not("team1_id", "is", null)
    .not("team2_id", "is", null);
  if (r64OrderGamesErr) throw r64OrderGamesErr;

  const orderTeamIds = Array.from(
    new Set(
      (r64OrderGames ?? [])
        .flatMap((g) => [String(g.team1_id ?? ""), String(g.team2_id ?? "")])
        .filter(Boolean)
    )
  );

  if (orderTeamIds.length > 0) {
    const { data: orderTeams, error: orderTeamsErr } = await supabaseAdmin
      .from("teams")
      .select("id,seed,seed_in_region")
      .in("id", orderTeamIds);
    if (orderTeamsErr) throw orderTeamsErr;

    const orderSeedById = new Map<string, number>();
    for (const team of orderTeams ?? []) {
      const seed = toSeed(team.seed_in_region) ?? toSeed(team.seed);
      if (seed != null) orderSeedById.set(String(team.id), seed);
    }

    for (const g of r64OrderGames ?? []) {
      const team1Id = String(g.team1_id ?? "");
      const team2Id = String(g.team2_id ?? "");
      if (!team1Id || !team2Id) continue;
      const s1 = orderSeedById.get(team1Id);
      const s2 = orderSeedById.get(team2Id);
      if (s1 == null || s2 == null) continue;
      if (s1 <= s2) continue;

      const { error: swapErr } = await supabaseAdmin
        .from("games")
        .update({
          team1_id: team2Id,
          team2_id: team1Id,
          last_synced_at: nowIso,
        })
        .eq("id", String(g.id));
      if (swapErr) throw swapErr;
      r64SeedOrderFixed++;
    }
  }

  const { data: brandingTeams, error: brandingTeamsErr } = await supabaseAdmin
    .from("teams")
    .select("id,name,espn_team_id,logo_url");
  if (brandingTeamsErr) throw brandingTeamsErr;

  const teamNameOwner = new Map<string, string>();
  for (const row of brandingTeams ?? []) {
    const name = toText(row.name);
    if (!name) continue;
    const key = name.toLowerCase();
    if (!teamNameOwner.has(key)) teamNameOwner.set(key, String(row.id));
  }

  for (const row of brandingTeams ?? []) {
    const override = getTeamBrandingOverride(row.name);
    if (!override) continue;

    const expectedLogo = `https://a.espncdn.com/i/teamlogos/ncaa/500/${override.espnTeamId}.png`;
    const updates: Record<string, unknown> = {};

    if (Number(row.espn_team_id ?? NaN) !== override.espnTeamId) {
      updates.espn_team_id = override.espnTeamId;
    }
    if (toText(row.logo_url) !== expectedLogo) {
      updates.logo_url = expectedLogo;
    }

    const currentName = toText(row.name) ?? null;
    if (currentName && currentName !== override.canonicalName) {
      const owner = teamNameOwner.get(override.canonicalName.toLowerCase());
      if (!owner || owner === String(row.id)) {
        updates.name = override.canonicalName;
      }
    }

    if (Object.keys(updates).length === 0) continue;

    const { error: brandUpdErr } = await supabaseAdmin
      .from("teams")
      .update(updates)
      .eq("id", String(row.id));
    if (brandUpdErr) throw brandUpdErr;
    brandingOverridesApplied++;
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
    espnFallbackMatchups,
    espnFallbackTeamsCreated,
    espnFallbackTeamsUpdated,
    espnFallbackGameTeamsUpdated,
    firstFourPlaceholdersCreated,
    firstFourSlotsFilled,
    playInAnchorsApplied,
    canonicalR64SlotsApplied,
    canonicalTeamsCreated,
    canonicalTeamsUpdated,
    canonicalR64RowsCreated,
    canonicalR64RowsRelocated,
    normalizedSeedTeams,
    r64SeedOrderFixed,
    brandingOverridesApplied,
    gameTeamsUpdated,
    r64Backfilled,
    teamsWithoutSeed,
    teamsWithoutLogo,
    sportsDataOnly,
    clearedR64Teams,
    skippedDuplicateSportsId,
    reassignedDuplicateSportsId,
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
