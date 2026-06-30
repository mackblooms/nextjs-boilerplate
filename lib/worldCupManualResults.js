const WORLD_CUP_NEXT_TARGET_BY_ROUND_SLOT = {
  ...Object.fromEntries(
    Array.from({ length: 16 }, (_, index) => {
      const slot = index + 1;
      return [
        `R32|${slot}`,
        {
          round: "S16",
          slot: Math.ceil(slot / 2),
          side: slot % 2 === 1 ? "team1_id" : "team2_id",
        },
      ];
    }),
  ),
  "S16|1": { round: "E8", slot: 1, side: "team1_id" },
  "S16|2": { round: "E8", slot: 1, side: "team2_id" },
  "S16|3": { round: "E8", slot: 2, side: "team1_id" },
  "S16|4": { round: "E8", slot: 2, side: "team2_id" },
  "S16|5": { round: "E8", slot: 3, side: "team1_id" },
  "S16|6": { round: "E8", slot: 3, side: "team2_id" },
  "S16|7": { round: "E8", slot: 4, side: "team1_id" },
  "S16|8": { round: "E8", slot: 4, side: "team2_id" },
  "E8|1": { round: "F4", slot: 1, side: "team1_id" },
  "E8|2": { round: "F4", slot: 1, side: "team2_id" },
  "E8|3": { round: "F4", slot: 2, side: "team1_id" },
  "E8|4": { round: "F4", slot: 2, side: "team2_id" },
};

const R32_TEAM2_PENALTY_ADVANCERS = new Set([13, 16]);

function normalizedRound(round) {
  return String(round ?? "").trim().toUpperCase();
}

function isFinalStatus(status) {
  const normalized = String(status ?? "").trim().toLowerCase();
  return (
    normalized.startsWith("final") ||
    normalized === "ft" ||
    normalized === "full time" ||
    normalized === "full-time" ||
    normalized === "post" ||
    normalized.startsWith("complete")
  );
}

function numericSlot(slot) {
  const value = Number(slot);
  return Number.isFinite(value) ? Math.trunc(value) : null;
}

export function getWorldCupManualWinnerId(game) {
  if (game.winner_team_id) return game.winner_team_id;

  const round = normalizedRound(game.round);
  const slot = numericSlot(game.slot);
  if (round !== "R32" || slot == null || !R32_TEAM2_PENALTY_ADVANCERS.has(slot)) return null;
  if (!isFinalStatus(game.status)) return null;
  if (game.team1_score == null || game.team2_score == null || game.team1_score !== game.team2_score) return null;

  return game.team2_id ?? null;
}

export function applyWorldCupManualResultOverrides(games) {
  const nextGames = games.map((game) => ({ ...game }));
  const byRoundSlot = new Map();

  for (const game of nextGames) {
    const round = normalizedRound(game.round);
    const slot = numericSlot(game.slot);
    if (!round || slot == null) continue;
    byRoundSlot.set(`${round}|${slot}`, game);
    const manualWinner = getWorldCupManualWinnerId(game);
    if (manualWinner) game.winner_team_id = manualWinner;
  }

  const order = { R32: 1, S16: 2, E8: 3, F4: 4, CHIP: 5 };
  const sorted = [...nextGames].sort((a, b) => {
    const roundDiff = (order[normalizedRound(a.round)] ?? 99) - (order[normalizedRound(b.round)] ?? 99);
    if (roundDiff !== 0) return roundDiff;
    return (numericSlot(a.slot) ?? 99) - (numericSlot(b.slot) ?? 99);
  });

  for (const source of sorted) {
    const slot = numericSlot(source.slot);
    const targetRef = slot == null ? null : WORLD_CUP_NEXT_TARGET_BY_ROUND_SLOT[`${normalizedRound(source.round)}|${slot}`];
    if (!targetRef) continue;
    const target = byRoundSlot.get(`${targetRef.round}|${targetRef.slot}`);
    if (!target) continue;

    const winnerId = getWorldCupManualWinnerId(source);
    target[targetRef.side] = winnerId;

    if (
      target.winner_team_id &&
      target.winner_team_id !== target.team1_id &&
      target.winner_team_id !== target.team2_id
    ) {
      target.winner_team_id = null;
    }
  }

  return nextGames;
}
