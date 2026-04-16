import { NextResponse } from "next/server";
import { requireSiteAdmin } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const ALLOWED_COLUMNS = new Set([
  "id",
  "name",
  "team",
  "position",
  "age",
  "year",
  "coach",
  "system",
  "role",
  "previous_ppg",
  "previous_rpg",
  "previous_apg",
  "previous_3p",
  "previous_fg",
  "previous_ft",
  "previous_bpg",
  "previous_spg",
  "previous_mpg",
  "prior_ppg",
  "prior_rpg",
  "prior_apg",
  "prior_3p",
  "prior_fg",
  "prior_ft",
  "prior_bpg",
  "prior_spg",
  "coach_success",
  "system_fit",
  "role_opportunity",
  "baseline_momentum",
  "improvement_score",
]);

const NUMERIC_COLUMNS = new Set([
  "age",
  "previous_ppg",
  "previous_rpg",
  "previous_apg",
  "previous_3p",
  "previous_fg",
  "previous_ft",
  "previous_bpg",
  "previous_spg",
  "previous_mpg",
  "prior_ppg",
  "prior_rpg",
  "prior_apg",
  "prior_3p",
  "prior_fg",
  "prior_ft",
  "prior_bpg",
  "prior_spg",
  "coach_success",
  "system_fit",
  "role_opportunity",
  "baseline_momentum",
  "improvement_score",
]);

const FIELD_ALIASES: Record<string, string> = {
  previousPpg: "previous_ppg",
  previousRpg: "previous_rpg",
  previousApg: "previous_apg",
  previous3P: "previous_3p",
  previousFg: "previous_fg",
  previousFt: "previous_ft",
  previousBpg: "previous_bpg",
  previousSpg: "previous_spg",
  previousMpg: "previous_mpg",
  priorPpg: "prior_ppg",
  priorRpg: "prior_rpg",
  priorApg: "prior_apg",
  prior3P: "prior_3p",
  priorFg: "prior_fg",
  priorFt: "prior_ft",
  priorBpg: "prior_bpg",
  priorSpg: "prior_spg",
  coachSuccess: "coach_success",
  systemFit: "system_fit",
  roleOpportunity: "role_opportunity",
  baselineMomentum: "baseline_momentum",
  improvementScore: "improvement_score",
};

function normalizeKey(key: string) {
  if (ALLOWED_COLUMNS.has(key)) return key;
  return FIELD_ALIASES[key] ?? key;
}

function normalizeValue(key: string, value: unknown) {
  if (value === null || value === undefined) return null;
  if (NUMERIC_COLUMNS.has(key)) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const numeric = Number(value.trim());
      return Number.isFinite(numeric) ? numeric : null;
    }
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  return value;
}

function normalizeRow(row: unknown) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const normalized: Record<string, unknown> = {};

  for (const [rawKey, rawValue] of Object.entries(row)) {
    const key = normalizeKey(rawKey);
    if (!ALLOWED_COLUMNS.has(key)) continue;
    const value = normalizeValue(key, rawValue);
    if (value !== null) normalized[key] = value;
  }

  if (!normalized.name || typeof normalized.name !== "string") return null;
  return normalized;
}

export async function POST(req: Request) {
  const auth = await requireSiteAdmin(req);
  if ("response" in auth) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch (error) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Expected an object with a rows array." }, { status: 400 });
  }

  const rows = Array.isArray((body as any).rows) ? (body as any).rows : null;
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "Payload must include a non-empty rows array." }, { status: 400 });
  }

  const normalizedRows = rows
    .map(normalizeRow)
    .filter((row): row is Record<string, unknown> => row !== null);

  if (normalizedRows.length === 0) {
    return NextResponse.json({ error: "No valid player rows were found in the import payload." }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { error } = await supabaseAdmin
    .from("players")
    .upsert(normalizedRows, { onConflict: "name" });

  if (error) {
    return NextResponse.json({ error: `Import failed: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, imported: normalizedRows.length });
}
