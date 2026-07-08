export type WorldCupRound = "R32" | "S16" | "E8" | "F4" | "CHIP";

export type WorldCupPropagationTarget = {
  round: WorldCupRound;
  region: string | null;
  slot: number;
  side: "team1_id" | "team2_id";
};

export const WORLD_CUP_GROUP_CODES = "ABCDEFGHIJKL".split("");

export const WORLD_CUP_REFERENCE_R32_MATCHUPS: [string, string][] = [
  ["Brazil", "Japan"],
  ["Côte d'Ivoire", "Norway"],
  ["Mexico", "Ecuador"],
  ["England", "Congo DR"],
  ["Argentina", "Cabo Verde"],
  ["Australia", "Egypt"],
  ["Switzerland", "Algeria"],
  ["Colombia", "Ghana"],
  ["Senegal", "Belgium"],
  ["USA", "Bosnia and Herzegovina"],
  ["Spain", "Austria"],
  ["Portugal", "Croatia"],
  ["Netherlands", "Morocco"],
  ["Canada", "South Africa"],
  ["France", "Sweden"],
  ["Germany", "Paraguay"],
];

export const WORLD_CUP_SLOT_LABELS: Record<string, [string, string]> = {
  ...Object.fromEntries(
    WORLD_CUP_REFERENCE_R32_MATCHUPS.map((matchup, index) => [`R32|${index + 1}`, matchup]),
  ),
  "S16|1": ["W1", "W2"],
  "S16|2": ["W3", "W4"],
  "S16|3": ["W5", "W6"],
  "S16|4": ["W7", "W8"],
  "S16|5": ["W9", "W10"],
  "S16|6": ["W11", "W12"],
  "S16|7": ["W13", "W14"],
  "S16|8": ["W15", "W16"],
  "E8|1": ["W17", "W18"],
  "E8|2": ["W19", "W20"],
  "E8|3": ["W21", "W22"],
  "E8|4": ["W23", "W24"],
  "F4|1": ["W25", "W26"],
  "F4|2": ["W27", "W28"],
  "CHIP|1": ["W29", "W30"],
};

export const WORLD_CUP_LEFT_LAYOUT: Record<Exclude<WorldCupRound, "CHIP">, number[]> = {
  R32: [1, 2, 3, 4, 5, 6, 7, 8],
  S16: [1, 2, 3, 4],
  E8: [1, 2],
  F4: [1],
};

export const WORLD_CUP_RIGHT_LAYOUT: Record<Exclude<WorldCupRound, "CHIP">, number[]> = {
  R32: [9, 10, 11, 12, 13, 14, 15, 16],
  S16: [5, 6, 7, 8],
  E8: [3, 4],
  F4: [2],
};

export const WORLD_CUP_FIXED_R32_SLOT_TARGETS: Record<string, { slot: number; side: "team1_id" | "team2_id" }> = {
  "2A": { slot: 1, side: "team1_id" },
  "2B": { slot: 1, side: "team2_id" },
  "1E": { slot: 2, side: "team1_id" },
  "1F": { slot: 3, side: "team1_id" },
  "2C": { slot: 3, side: "team2_id" },
  "1C": { slot: 4, side: "team1_id" },
  "2F": { slot: 4, side: "team2_id" },
  "1I": { slot: 5, side: "team1_id" },
  "2E": { slot: 6, side: "team1_id" },
  "2I": { slot: 6, side: "team2_id" },
  "1A": { slot: 7, side: "team1_id" },
  "1L": { slot: 8, side: "team1_id" },
  "1D": { slot: 9, side: "team1_id" },
  "1G": { slot: 10, side: "team1_id" },
  "2K": { slot: 11, side: "team1_id" },
  "2L": { slot: 11, side: "team2_id" },
  "1H": { slot: 12, side: "team1_id" },
  "2J": { slot: 12, side: "team2_id" },
  "1B": { slot: 13, side: "team1_id" },
  "1J": { slot: 14, side: "team1_id" },
  "2H": { slot: 14, side: "team2_id" },
  "1K": { slot: 15, side: "team1_id" },
  "2D": { slot: 16, side: "team1_id" },
  "2G": { slot: 16, side: "team2_id" },
};

export const WORLD_CUP_THIRD_PLACE_R32_TARGETS: Record<
  string,
  { slot: number; side: "team1_id" | "team2_id"; candidates: string[] }
> = {
  "1A": { slot: 7, side: "team2_id", candidates: ["C", "E", "F", "H", "I"] },
  "1B": { slot: 13, side: "team2_id", candidates: ["E", "F", "G", "I", "J"] },
  "1D": { slot: 9, side: "team2_id", candidates: ["B", "E", "F", "I", "J"] },
  "1E": { slot: 2, side: "team2_id", candidates: ["A", "B", "C", "D", "F"] },
  "1G": { slot: 10, side: "team2_id", candidates: ["A", "E", "H", "I", "J"] },
  "1I": { slot: 5, side: "team2_id", candidates: ["C", "D", "F", "G", "H"] },
  "1K": { slot: 15, side: "team2_id", candidates: ["D", "E", "I", "J", "L"] },
  "1L": { slot: 8, side: "team2_id", candidates: ["E", "H", "I", "J", "K"] },
};

export const WORLD_CUP_NEXT_TARGET_BY_ROUND_SLOT: Record<string, WorldCupPropagationTarget> = {
  ...Object.fromEntries(
    Array.from({ length: 16 }, (_, index) => {
      const slot = index + 1;
      return [
        `R32|${slot}`,
        {
          round: "S16",
          region: null,
          slot: Math.ceil(slot / 2),
          side: slot % 2 === 1 ? "team1_id" : "team2_id",
        } satisfies WorldCupPropagationTarget,
      ];
    }),
  ),
  "S16|1": { round: "E8", region: null, slot: 1, side: "team1_id" },
  "S16|2": { round: "E8", region: null, slot: 1, side: "team2_id" },
  "S16|3": { round: "E8", region: null, slot: 2, side: "team1_id" },
  "S16|4": { round: "E8", region: null, slot: 2, side: "team2_id" },
  "S16|5": { round: "E8", region: null, slot: 3, side: "team1_id" },
  "S16|6": { round: "E8", region: null, slot: 3, side: "team2_id" },
  "S16|7": { round: "E8", region: null, slot: 4, side: "team1_id" },
  "S16|8": { round: "E8", region: null, slot: 4, side: "team2_id" },
  "E8|1": { round: "F4", region: null, slot: 1, side: "team1_id" },
  "E8|2": { round: "F4", region: null, slot: 1, side: "team2_id" },
  "E8|3": { round: "F4", region: null, slot: 2, side: "team1_id" },
  "E8|4": { round: "F4", region: null, slot: 2, side: "team2_id" },
  "F4|1": { round: "CHIP", region: null, slot: 1, side: "team1_id" },
  "F4|2": { round: "CHIP", region: null, slot: 1, side: "team2_id" },
};

export type WorldCupBracketLockGame = {
  round?: string | null;
  team1_id?: string | null;
  team2_id?: string | null;
  winner_team_id?: string | null;
};

export function isWorldCupKnockoutBracketLocked(games: WorldCupBracketLockGame[]) {
  let populatedR32Games = 0;

  for (const game of games) {
    const round = String(game.round ?? "").trim().toUpperCase();
    const hasTeam = Boolean(game.team1_id || game.team2_id);
    const hasBothTeams = Boolean(game.team1_id && game.team2_id);
    const hasWinner = Boolean(game.winner_team_id);

    if (round === "R32" && hasBothTeams) populatedR32Games++;
    if (round === "R32" && hasWinner) return true;
    if ((round === "S16" || round === "E8" || round === "F4" || round === "CHIP") && (hasTeam || hasWinner)) {
      return true;
    }
  }

  return populatedR32Games >= 8;
}

export function groupCodeFromRegion(region: string | null | undefined): string | null {
  const match = String(region ?? "").trim().match(/group\s+([A-L])$/i);
  return match ? match[1].toUpperCase() : null;
}

export function resolveWorldCupThirdPlaceAssignments(qualifiedGroups: string[]) {
  const qualified = [...new Set(qualifiedGroups.map((group) => group.toUpperCase()))].sort();
  if (qualified.length !== 8) return null;

  const remaining = new Set(qualified);
  const targets = Object.entries(WORLD_CUP_THIRD_PLACE_R32_TARGETS).sort((a, b) => {
    const aCount = a[1].candidates.filter((group) => remaining.has(group)).length;
    const bCount = b[1].candidates.filter((group) => remaining.has(group)).length;
    return aCount - bCount || a[0].localeCompare(b[0]);
  });

  const assignment = new Map<string, string>();

  function backtrack(index: number): boolean {
    if (index >= targets.length) return true;
    const [winnerSlot, target] = targets[index];
    const options = target.candidates.filter((group) => remaining.has(group)).sort();
    for (const group of options) {
      remaining.delete(group);
      assignment.set(winnerSlot, group);
      if (backtrack(index + 1)) return true;
      assignment.delete(winnerSlot);
      remaining.add(group);
    }
    return false;
  }

  return backtrack(0) ? assignment : null;
}
