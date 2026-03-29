import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requireSiteAdmin } from "@/lib/adminAuth";

type SetWinnerRequest = {
  poolId?: string;
  gameId?: string;
  winnerTeamId?: string | null;
};

type LocalBracketGame = {
  id: string;
  round: string | null;
  region: string | null;
  slot: number | null;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
};

type PropagationTarget = {
  round: "R32" | "S16" | "E8" | "F4" | "CHIP";
  region: string | null;
  slot: number;
  side: "team1_id" | "team2_id";
};

function norm(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function gameKey(round: string, region: string | null, slot: number): string {
  if (round === "R64" || round === "R32" || round === "S16" || round === "E8") {
    return `${round}|${norm(region)}|${slot}`;
  }
  return `${round}|${slot}`;
}

function nextTargetForWinner(g: LocalBracketGame): PropagationTarget | null {
  const round = String(g.round ?? "").toUpperCase();
  const slot = Number(g.slot);
  if (!Number.isFinite(slot) || slot < 1) return null;

  if (round === "R64" || round === "R32" || round === "S16") {
    const nextRound = round === "R64" ? "R32" : round === "R32" ? "S16" : "E8";
    return {
      round: nextRound,
      region: g.region ?? null,
      slot: Math.ceil(slot / 2),
      side: slot % 2 === 1 ? "team1_id" : "team2_id",
    };
  }

  if (round === "E8") {
    const region = norm(g.region);
    if (region === "east") return { round: "F4", region: null, slot: 1, side: "team1_id" };
    if (region === "west") return { round: "F4", region: null, slot: 1, side: "team2_id" };
    if (region === "south") return { round: "F4", region: null, slot: 2, side: "team1_id" };
    if (region === "midwest") return { round: "F4", region: null, slot: 2, side: "team2_id" };
    return null;
  }

  if (round === "F4") {
    if (slot === 1) return { round: "CHIP", region: null, slot: 1, side: "team1_id" };
    if (slot === 2) return { round: "CHIP", region: null, slot: 1, side: "team2_id" };
    return null;
  }

  return null;
}

async function propagateWinnersToNextRounds(supabaseAdmin: ReturnType<typeof getSupabaseAdmin>) {
  const { data: allGames, error: gamesErr } = await supabaseAdmin
    .from("games")
    .select("id,round,region,slot,team1_id,team2_id,winner_team_id");
  if (gamesErr) throw gamesErr;

  const games = ((allGames ?? []) as LocalBracketGame[]).map((g) => ({
    ...g,
    id: String(g.id),
  }));

  const byKey = new Map<string, LocalBracketGame>();
  for (const g of games) {
    const round = String(g.round ?? "").toUpperCase();
    const slot = Number(g.slot);
    if (!Number.isFinite(slot) || slot < 1 || !round) continue;
    byKey.set(gameKey(round, g.region ?? null, Math.trunc(slot)), g);
  }

  const order: Record<string, number> = { R64: 1, R32: 2, S16: 3, E8: 4, F4: 5, CHIP: 6 };
  const sorted = [...games].sort((a, b) => {
    const ao = order[String(a.round ?? "").toUpperCase()] ?? 99;
    const bo = order[String(b.round ?? "").toUpperCase()] ?? 99;
    if (ao !== bo) return ao - bo;
    const ar = String(a.region ?? "");
    const br = String(b.region ?? "");
    if (ar !== br) return ar.localeCompare(br);
    return Number(a.slot ?? 0) - Number(b.slot ?? 0);
  });

  let advancedSlotsUpdated = 0;
  let advancedGamesTouched = 0;
  let clearedInvalidWinners = 0;
  const touchedGameIds = new Set<string>();

  for (const source of sorted) {
    const targetRef = nextTargetForWinner(source);
    if (!targetRef) continue;

    const target = byKey.get(gameKey(targetRef.round, targetRef.region, targetRef.slot));
    if (!target) continue;

    const winnerId = source.winner_team_id ? String(source.winner_team_id) : null;
    const updatePayload: Record<string, unknown> = {};

    if (target[targetRef.side] !== winnerId) {
      updatePayload[targetRef.side] = winnerId;
      target[targetRef.side] = winnerId;
      advancedSlotsUpdated++;
    }

    const nextTeam1 = target.team1_id ? String(target.team1_id) : null;
    const nextTeam2 = target.team2_id ? String(target.team2_id) : null;
    const existingWinner = target.winner_team_id ? String(target.winner_team_id) : null;
    if (existingWinner && existingWinner !== nextTeam1 && existingWinner !== nextTeam2) {
      updatePayload.winner_team_id = null;
      target.winner_team_id = null;
      clearedInvalidWinners++;
    }

    if (Object.keys(updatePayload).length === 0) continue;

    const { error: updErr } = await supabaseAdmin
      .from("games")
      .update(updatePayload)
      .eq("id", target.id);
    if (updErr) throw updErr;

    touchedGameIds.add(target.id);
  }

  advancedGamesTouched = touchedGameIds.size;
  return { advancedSlotsUpdated, advancedGamesTouched, clearedInvalidWinners };
}

export async function POST(req: Request) {
  const supabaseAdmin = getSupabaseAdmin();

  try {
    const auth = await requireSiteAdmin(req);
    if ("response" in auth) return auth.response;

    const body = (await req.json().catch(() => ({}))) as SetWinnerRequest;
    const poolId = body.poolId?.trim();
    const gameId = body.gameId?.trim();
    const winnerTeamIdRaw = body.winnerTeamId == null ? null : String(body.winnerTeamId).trim();
    const winnerTeamId = winnerTeamIdRaw ? winnerTeamIdRaw : null;

    if (!poolId || !gameId) {
      return NextResponse.json({ error: "missing poolId/gameId" }, { status: 400 });
    }

    const { data: gameRow, error: gameErr } = await supabaseAdmin
      .from("games")
      .select("id,team1_id,team2_id")
      .eq("id", gameId)
      .single();

    if (gameErr) return NextResponse.json({ error: gameErr.message }, { status: 400 });

    const team1Id = gameRow.team1_id ? String(gameRow.team1_id) : null;
    const team2Id = gameRow.team2_id ? String(gameRow.team2_id) : null;
    if (winnerTeamId && winnerTeamId !== team1Id && winnerTeamId !== team2Id) {
      return NextResponse.json(
        { error: "winnerTeamId must match one of the teams in the game." },
        { status: 400 },
      );
    }

    const { error: updateErr } = await supabaseAdmin
      .from("games")
      .update({ winner_team_id: winnerTeamId })
      .eq("id", gameId);
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 400 });

    const propagation = await propagateWinnersToNextRounds(supabaseAdmin);
    return NextResponse.json({ ok: true, winnerTeamId, ...propagation });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 },
    );
  }
}
