import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";
import { requireSiteAdmin } from "@/lib/adminAuth";

function normName(s: string) {
  return s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[’']/g, "")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

type EspnTeamEntry = {
  team?: {
    id?: string | number;
    displayName?: string;
    name?: string;
    shortDisplayName?: string;
    logos?: Array<{ href?: string }>;
  };
};

export async function POST(req: Request) {
    const supabaseAdmin = getSupabaseAdmin();
  
  try {
    const auth = await requireSiteAdmin(req);
    if ("response" in auth) return auth.response;

    const body = await req.json().catch(() => ({}));
    const poolId = body.poolId as string | undefined;

    if (!poolId) {
      return NextResponse.json({ error: "missing poolId" }, { status: 400 });
    }

    // Load teams from DB
    const { data: dbTeams, error: teamErr } = await supabaseAdmin
      .from("teams")
      .select("id,name");

    if (teamErr) return NextResponse.json({ error: teamErr.message }, { status: 400 });

    // Fetch ESPN teams list (public)
    const url =
      "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams?limit=5000";

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({ error: `ESPN fetch failed: ${res.status}` }, { status: 500 });
    }

    const json = await res.json();

    // ESPN structure: sports[0].leagues[0].teams -> [{team:{id,displayName,logos:[{href}]}}]
    const espnTeams =
      json?.sports?.[0]?.leagues?.[0]?.teams ??
      json?.sports?.[0]?.leagues?.[0]?.teams ??
      [] as EspnTeamEntry[];

    const map = new Map<string, { id: number; logo: string }>();

    for (const entry of espnTeams) {
      const t = entry?.team;
      if (!t?.id) continue;

      const displayName = t.displayName || t.name || t.shortDisplayName;
      const logoHref = t?.logos?.[0]?.href;

      if (!displayName || !logoHref) continue;

      map.set(normName(displayName), { id: Number(t.id), logo: logoHref });
      // Also index shortDisplayName if it exists
      if (t.shortDisplayName) map.set(normName(t.shortDisplayName), { id: Number(t.id), logo: logoHref });
    }

    // Manual overrides for annoying names (add more as you encounter)
const overrides: Record<string, string> = {
  // name mismatches
  "connecticut": "uconn",
  "michigan state": "michigan st",

  // Miami (Ohio) variations
  "miami (oh)": "miami (oh)",
  "miami ohio": "miami (oh)",
  "miami oh": "miami (oh)",

  // North Dakota State variations
  "north dakota st": "north dakota st",
  "north dakota state": "north dakota st",
  "ndsu": "north dakota st",

  // other "State" -> "St" style mismatches
  "portland state": "portland st",
  "wright state": "wright st",

  // play-in placeholders (skip for now)
  "miami/new mexico": "",
  "texas/san diego state": "",
  "njit/morgan state": "",
  "long island/b-cu": "",
};
    let updated = 0;
    const missing: string[] = [];

    for (const t of dbTeams ?? []) {
      const raw = String(t.name);
      const n = normName(raw);

      // skip play-in combined labels
      const ov = overrides[n];
      if (ov === "") {
        missing.push(raw);
        continue;
      }

      const lookupKey = ov ? normName(ov) : n;

let hit = map.get(lookupKey);

// fallback: "state" -> "st" (common ESPN naming)
if (!hit && lookupKey.includes(" state")) {
  hit = map.get(lookupKey.replace(" state", " st"));
}

      // fallback: "(oh)" formatting differences
if (!hit && lookupKey.includes(" oh")) {
  hit = map.get(lookupKey.replace(" oh", " (oh)"));
}

// fallback: try a contains match (useful for ESPN having extra suffix words)
if (!hit) {
  for (const [k, v] of map.entries()) {
    if (k.includes(lookupKey) || lookupKey.includes(k)) {
      hit = v;
      break;
    }
  }
}
      if (!hit) {
  missing.push(`${raw} (key=${lookupKey})`);
  continue;
}

      const { error: updErr } = await supabaseAdmin
        .from("teams")
        .update({ logo_url: hit.logo, espn_team_id: hit.id })
        .eq("id", t.id);

      if (!updErr) updated += 1;
    }

    return NextResponse.json({ updated, missing });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 }
    );
  }
}
