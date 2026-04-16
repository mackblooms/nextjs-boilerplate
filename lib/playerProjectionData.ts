import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { projectPlayerStats, type PlayerProjectionInput, type PlayerProjectionOutput } from "@/lib/playerProjection";

type SupabasePlayerRow = {
  id: string;
  name: string;
  team?: string;
  position?: string;
  age?: number;
  year?: string;
  coach?: string;
  system?: string;
  role?: string;
  previous_ppg?: number;
  previous_rpg?: number;
  previous_apg?: number;
  previous_3p?: number;
  previous_fg?: number;
  previous_ft?: number;
  previous_bpg?: number;
  previous_spg?: number;
  previous_mpg?: number;
  prior_ppg?: number;
  prior_rpg?: number;
  prior_apg?: number;
  prior_3p?: number;
  prior_fg?: number;
  prior_ft?: number;
  prior_bpg?: number;
  prior_spg?: number;
  coach_success?: number;
  system_fit?: number;
  role_opportunity?: number;
  baseline_momentum?: number;
  improvement_score?: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function safeNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeText(value: string | undefined | null) {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function estimateCoachSuccess(coach?: string | null) {
  const name = normalizeText(coach)?.toLowerCase() ?? "";
  if (!name) return 0.55;
  if (/(calipari|self|kra|mack|smart|swinney|jonas|hurley|sturdivant|mj|tate|nate)/.test(name)) {
    return 0.72;
  }
  if (/(first-year|first year|new coach|new staff|interim|transition)/.test(name)) {
    return 0.52;
  }
  if (/(typical|solid|steady|veteran)/.test(name)) {
    return 0.60;
  }
  return 0.57;
}

function estimateSystemFit(system?: string | null) {
  const value = normalizeText(system)?.toLowerCase() ?? "";
  if (!value) return 0.55;
  if (/(spread|pace|motion|dribble drive|pace and space|pace-and-space|up-tempo|up tempo|fast break)/.test(value)) {
    return 0.68;
  }
  if (/(half court|post|slow|iso|isolation|grind|defense-first|defense first)/.test(value)) {
    return 0.50;
  }
  return 0.58;
}

function estimateRoleOpportunity(role?: string | null) {
  const value = normalizeText(role)?.toLowerCase() ?? "";
  if (!value) return 0.55;
  if (/(starter|star|primary|leading|first option|go-to)/.test(value)) {
    return 0.75;
  }
  if (/(sixth man|sixth-man|bench|reserve|backup|role player)/.test(value)) {
    return 0.45;
  }
  if (/(projected|expected|likely)/.test(value)) {
    return 0.62;
  }
  return 0.56;
}

function estimateImprovementScore(row: SupabasePlayerRow, previousPPG: number, priorPPG: number) {
  const trend = priorPPG > 0 ? (previousPPG - priorPPG) / priorPPG : 0;
  return clamp(0.12 + Math.min(0.38, trend * 0.45), 0, 1);
}

function derivePlayerFactors(row: SupabasePlayerRow) {
  const previousPPG = safeNumber(row.previous_ppg, 10);
  const priorPPG = safeNumber(row.prior_ppg, previousPPG * 0.9);
  const previousAPG = safeNumber(row.previous_apg, 2.2);
  const priorAPG = safeNumber(row.prior_apg, previousAPG * 0.9);
  const coachSuccess = row.coach_success != null ? clamp(safeNumber(row.coach_success, 0.55), 0, 1) : estimateCoachSuccess(row.coach);
  const systemFit = row.system_fit != null ? clamp(safeNumber(row.system_fit, 0.55), 0, 1) : estimateSystemFit(row.system);
  const roleOpportunity = row.role_opportunity != null ? clamp(safeNumber(row.role_opportunity, 0.55), 0, 1) : estimateRoleOpportunity(row.role);
  const age = safeNumber(row.age, 20);
  const improvementScore = row.improvement_score != null ? clamp(safeNumber(row.improvement_score, 0.1), 0, 1) : estimateImprovementScore(row, previousPPG, priorPPG);
  const minutesPerGame = clamp(safeNumber(row.previous_mpg, 28), 0, 48);
  const previous3P = clamp(safeNumber(row.previous_3p, 0.32), 0.01, 0.6);
  const previousFG = clamp(safeNumber(row.previous_fg, 0.44), 0.3, 0.7);
  const previousFT = clamp(safeNumber(row.previous_ft, 0.74), 0.45, 0.95);

  const ppgTrend = previousPPG > 0 ? (previousPPG - priorPPG) / Math.max(priorPPG, 1) : 0;
  const trajectory = clamp(0.45 + ppgTrend * 0.35 + improvementScore * 0.2, 0, 1);
  const ageFactor = clamp((age - 18) / 12, 0, 1);
  const baselineMomentum = row.baseline_momentum != null ? clamp(safeNumber(row.baseline_momentum, 0.5), 0, 1) : clamp(0.45 + Math.min(0.22, ppgTrend * 0.16) + improvementScore * 0.16, 0, 1);
  const momentum = clamp(0.4 + trajectory * 0.25 + baselineMomentum * 0.2 + improvementScore * 0.15, 0.05, 0.98);
  const situation = clamp(systemFit * 0.5 + roleOpportunity * 0.3 + coachSuccess * 0.2, 0, 1);
  const coachImpact = clamp(coachSuccess * 0.7 + systemFit * 0.15 + roleOpportunity * 0.15, 0, 1);
  const growthPotential = clamp(0.95 - ageFactor * 0.3 + improvementScore * 0.35, 0.05, 1);
  const opportunity = clamp(0.4 + roleOpportunity * 0.35 + minutesPerGame / 48 * 0.25 + trajectory * 0.1, 0, 1);

  return {
    player: {
      name: row.name,
      team: row.team ?? null,
      position: row.position ?? null,
      age: row.age ?? null,
      year: row.year ?? null,
      coach: row.coach ?? null,
      system: row.system ?? null,
      role: row.role ?? null,
      minutesPerGame,
    },
    factors: {
      trajectory,
      momentum,
      situation,
      coachImpact,
      systemFit,
      growthPotential,
      opportunity,
    },
    baseline: {
      previousPPG,
      previousRPG: safeNumber(row.previous_rpg, 4.1),
      previousAPG,
      previous3P,
      previousFG,
      previousFT,
      previousBPG: safeNumber(row.previous_bpg, 0.5),
      previousSPG: safeNumber(row.previous_spg, 1.0),
      minutesPerGame,
    },
  };
}

export type AutoProjectionResult = {
  player: {
    name: string;
    team: string | null;
    position: string | null;
    age: number | null;
    year: string | null;
    coach: string | null;
    system: string | null;
    role: string | null;
    minutesPerGame: number;
  };
  factors: {
    trajectory: number;
    momentum: number;
    situation: number;
    coachImpact: number;
    systemFit: number;
    growthPotential: number;
    opportunity: number;
  };
  projection: PlayerProjectionOutput;
  explanation: string;
  source: string;
  matches: Array<{ id: string; name: string; team: string | null }>;
};

export async function computeAutoProjectionByName(name: string): Promise<AutoProjectionResult | { error: string }> {
  const supabaseAdmin = getSupabaseAdmin();
  const cleanedName = name.trim();

  if (!cleanedName) {
    return { error: "Player name is required." };
  }

  const { data, error } = await supabaseAdmin
    .from("players")
    .select(
      "id,name,team,position,age,year,coach,system,role,previous_ppg,previous_rpg,previous_apg,previous_3p,previous_fg,previous_ft,previous_bpg,previous_spg,previous_mpg,prior_ppg,prior_rpg,prior_apg,prior_3p,prior_fg,prior_ft,prior_bpg,prior_spg,coach_success,system_fit,role_opportunity,baseline_momentum,improvement_score"
    )
    .ilike("name", `%${cleanedName}%`)
    .limit(12);

  if (error) {
    if (error.message?.toLowerCase().includes("does not exist")) {
      return {
        error:
          "The NCAA player dataset is not available in the database. Add a `players` table with college player stats and metadata, then retry.",
      };
    }
    return { error: `Player lookup failed: ${error.message}` };
  }

  if (!data || data.length === 0) {
    return { error: `No players found matching '${cleanedName}'.` };
  }

  const matches = data.map((row) => ({ id: row.id, name: row.name, team: row.team ?? null }));
  const selected = data.find((row) => row.name.toLowerCase() === cleanedName.toLowerCase()) ?? data[0];
  const derived = derivePlayerFactors(selected);

  const projectionInput: PlayerProjectionInput = {
    playerName: selected.name,
    previousPPG: derived.baseline.previousPPG,
    previousRPG: derived.baseline.previousRPG,
    previousAPG: derived.baseline.previousAPG,
    previous3P: derived.baseline.previous3P,
    previousFG: derived.baseline.previousFG,
    previousFT: derived.baseline.previousFT,
    previousBPG: derived.baseline.previousBPG,
    previousSPG: derived.baseline.previousSPG,
    minutesPerGame: derived.baseline.minutesPerGame,
    momentum: derived.factors.momentum,
    situation: derived.factors.situation,
    coachImpact: derived.factors.coachImpact,
    systemFit: derived.factors.systemFit,
    growthPotential: derived.factors.growthPotential,
    opportunity: derived.factors.opportunity,
  };

  const projection = projectPlayerStats(projectionInput);
  const explanation = `Auto-derived multipliers from historical data:` +
    `\n- Trajectory estimated from prior/current scoring progress and improvement score = ${derived.factors.trajectory.toFixed(3)}` +
    `\n- Momentum uses trajectory, baseline momentum, and historical momentum patterns = ${derived.factors.momentum.toFixed(3)}` +
    `\n- Situation uses system fit, role opportunity, and coach success = ${derived.factors.situation.toFixed(3)}` +
    `\n- Coach impact uses coach success plus system fit = ${derived.factors.coachImpact.toFixed(3)}` +
    `\n- Growth potential is driven by age and improvement score = ${derived.factors.growthPotential.toFixed(3)}` +
    `\n- Opportunity is driven by projected usage, minutes, and role opportunity = ${derived.factors.opportunity.toFixed(3)}`;

  return {
    player: derived.player,
    factors: derived.factors,
    projection,
    explanation,
    source: "players",
    matches,
  };
}
