export type WorldCupRound = "R32" | "S16" | "E8" | "F4" | "CHIP";

export type WorldCupPropagationTarget = {
  round: WorldCupRound;
  region: string | null;
  slot: number;
  side: "team1_id" | "team2_id";
};

export const WORLD_CUP_GROUP_CODES = "ABCDEFGHIJKL".split("");

export const WORLD_CUP_SLOT_LABELS: Record<string, [string, string]> = {
  "R32|1": ["2A", "2B"],
  "R32|2": ["1E", "3RD A/B/C/D/F"],
  "R32|3": ["1F", "2C"],
  "R32|4": ["1C", "2F"],
  "R32|5": ["1I", "3RD C/D/F/G/H"],
  "R32|6": ["2E", "2I"],
  "R32|7": ["1A", "3RD C/E/F/H/I"],
  "R32|8": ["1L", "3RD E/H/I/J/K"],
  "R32|9": ["1D", "3RD B/E/F/I/J"],
  "R32|10": ["1G", "3RD A/E/H/I/J"],
  "R32|11": ["2K", "2L"],
  "R32|12": ["1H", "2J"],
  "R32|13": ["1B", "3RD E/F/G/I/J"],
  "R32|14": ["1J", "2H"],
  "R32|15": ["1K", "3RD D/E/I/J/L"],
  "R32|16": ["2D", "2G"],
  "S16|1": ["W74", "W77"],
  "S16|2": ["W73", "W75"],
  "S16|3": ["W76", "W78"],
  "S16|4": ["W79", "W80"],
  "S16|5": ["W83", "W84"],
  "S16|6": ["W81", "W82"],
  "S16|7": ["W86", "W88"],
  "S16|8": ["W85", "W87"],
  "E8|1": ["W89", "W90"],
  "E8|2": ["W93", "W94"],
  "E8|3": ["W91", "W92"],
  "E8|4": ["W95", "W96"],
  "F4|1": ["W97", "W98"],
  "F4|2": ["W99", "W100"],
  "CHIP|1": ["W101", "W102"],
};

export const WORLD_CUP_LEFT_LAYOUT: Record<Exclude<WorldCupRound, "CHIP">, number[]> = {
  R32: [2, 5, 1, 3, 11, 12, 9, 10],
  S16: [1, 2, 5, 6],
  E8: [1, 2],
  F4: [1],
};

export const WORLD_CUP_RIGHT_LAYOUT: Record<Exclude<WorldCupRound, "CHIP">, number[]> = {
  R32: [4, 6, 7, 8, 14, 16, 13, 15],
  S16: [3, 4, 7, 8],
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
  "R32|1": { round: "S16", region: null, slot: 2, side: "team1_id" },
  "R32|2": { round: "S16", region: null, slot: 1, side: "team1_id" },
  "R32|3": { round: "S16", region: null, slot: 2, side: "team2_id" },
  "R32|4": { round: "S16", region: null, slot: 3, side: "team1_id" },
  "R32|5": { round: "S16", region: null, slot: 1, side: "team2_id" },
  "R32|6": { round: "S16", region: null, slot: 3, side: "team2_id" },
  "R32|7": { round: "S16", region: null, slot: 4, side: "team1_id" },
  "R32|8": { round: "S16", region: null, slot: 4, side: "team2_id" },
  "R32|9": { round: "S16", region: null, slot: 6, side: "team1_id" },
  "R32|10": { round: "S16", region: null, slot: 6, side: "team2_id" },
  "R32|11": { round: "S16", region: null, slot: 5, side: "team1_id" },
  "R32|12": { round: "S16", region: null, slot: 5, side: "team2_id" },
  "R32|13": { round: "S16", region: null, slot: 8, side: "team1_id" },
  "R32|14": { round: "S16", region: null, slot: 7, side: "team1_id" },
  "R32|15": { round: "S16", region: null, slot: 8, side: "team2_id" },
  "R32|16": { round: "S16", region: null, slot: 7, side: "team2_id" },
  "S16|1": { round: "E8", region: null, slot: 1, side: "team1_id" },
  "S16|2": { round: "E8", region: null, slot: 1, side: "team2_id" },
  "S16|3": { round: "E8", region: null, slot: 3, side: "team1_id" },
  "S16|4": { round: "E8", region: null, slot: 3, side: "team2_id" },
  "S16|5": { round: "E8", region: null, slot: 2, side: "team1_id" },
  "S16|6": { round: "E8", region: null, slot: 2, side: "team2_id" },
  "S16|7": { round: "E8", region: null, slot: 4, side: "team1_id" },
  "S16|8": { round: "E8", region: null, slot: 4, side: "team2_id" },
  "E8|1": { round: "F4", region: null, slot: 1, side: "team1_id" },
  "E8|2": { round: "F4", region: null, slot: 1, side: "team2_id" },
  "E8|3": { round: "F4", region: null, slot: 2, side: "team1_id" },
  "E8|4": { round: "F4", region: null, slot: 2, side: "team2_id" },
};

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
