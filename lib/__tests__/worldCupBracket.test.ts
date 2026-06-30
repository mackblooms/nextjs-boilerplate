import { describe, it, expect } from "vitest";
import {
  resolveWorldCupThirdPlaceAssignments,
  WORLD_CUP_THIRD_PLACE_R32_TARGETS,
  WORLD_CUP_NEXT_TARGET_BY_ROUND_SLOT,
  WORLD_CUP_REFERENCE_R32_MATCHUPS,
  WORLD_CUP_SLOT_LABELS,
  WORLD_CUP_FIXED_R32_SLOT_TARGETS,
  groupCodeFromRegion,
} from "../worldCupBracket";

// ---------------------------------------------------------------------------
// groupCodeFromRegion
// ---------------------------------------------------------------------------

describe("groupCodeFromRegion", () => {
  it("parses 'Group A' → 'A'", () => expect(groupCodeFromRegion("Group A")).toBe("A"));
  it("parses lowercase 'group b' → 'B'", () => expect(groupCodeFromRegion("group b")).toBe("B"));
  it("parses 'Group L' (last group) → 'L'", () => expect(groupCodeFromRegion("Group L")).toBe("L"));
  it("returns null for non-group region strings", () => expect(groupCodeFromRegion("East")).toBeNull());
  it("returns null for null", () => expect(groupCodeFromRegion(null)).toBeNull());
  it("returns null for empty string", () => expect(groupCodeFromRegion("")).toBeNull());
});

// ---------------------------------------------------------------------------
// WORLD_CUP_REFERENCE_R32_MATCHUPS
// ---------------------------------------------------------------------------

describe("WORLD_CUP_REFERENCE_R32_MATCHUPS", () => {
  it("matches the fixed World Cup reference draw", () => {
    expect(WORLD_CUP_REFERENCE_R32_MATCHUPS).toEqual([
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
    ]);
  });

  it("feeds the R32 display labels in slot order", () => {
    for (const [index, matchup] of WORLD_CUP_REFERENCE_R32_MATCHUPS.entries()) {
      expect(WORLD_CUP_SLOT_LABELS[`R32|${index + 1}`]).toEqual(matchup);
    }
  });
});

// ---------------------------------------------------------------------------
// WORLD_CUP_NEXT_TARGET_BY_ROUND_SLOT — routing table completeness
// ---------------------------------------------------------------------------

describe("WORLD_CUP_NEXT_TARGET_BY_ROUND_SLOT — completeness", () => {
  it("covers all 16 R32 slots (1–16)", () => {
    for (let slot = 1; slot <= 16; slot++) {
      expect(WORLD_CUP_NEXT_TARGET_BY_ROUND_SLOT[`R32|${slot}`]).toBeDefined();
    }
  });

  it("covers all 8 S16 slots (1–8)", () => {
    for (let slot = 1; slot <= 8; slot++) {
      expect(WORLD_CUP_NEXT_TARGET_BY_ROUND_SLOT[`S16|${slot}`]).toBeDefined();
    }
  });

  it("covers all 4 E8 slots (1–4)", () => {
    for (let slot = 1; slot <= 4; slot++) {
      expect(WORLD_CUP_NEXT_TARGET_BY_ROUND_SLOT[`E8|${slot}`]).toBeDefined();
    }
  });

  it("every target's side is either team1_id or team2_id", () => {
    for (const [key, target] of Object.entries(WORLD_CUP_NEXT_TARGET_BY_ROUND_SLOT)) {
      expect(["team1_id", "team2_id"], `side missing for ${key}`).toContain(target.side);
    }
  });
});

// ---------------------------------------------------------------------------
// WORLD_CUP_NEXT_TARGET_BY_ROUND_SLOT — R32 → S16 routing (all 16 slots)
// ---------------------------------------------------------------------------

describe("WORLD_CUP_NEXT_TARGET_BY_ROUND_SLOT — R32 → S16 routing", () => {
  const expectedR32ToS16: Record<number, { slot: number; side: "team1_id" | "team2_id" }> = {
    1:  { slot: 1, side: "team1_id" },
    2:  { slot: 1, side: "team2_id" },
    3:  { slot: 2, side: "team1_id" },
    4:  { slot: 2, side: "team2_id" },
    5:  { slot: 3, side: "team1_id" },
    6:  { slot: 3, side: "team2_id" },
    7:  { slot: 4, side: "team1_id" },
    8:  { slot: 4, side: "team2_id" },
    9:  { slot: 5, side: "team1_id" },
    10: { slot: 5, side: "team2_id" },
    11: { slot: 6, side: "team1_id" },
    12: { slot: 6, side: "team2_id" },
    13: { slot: 7, side: "team1_id" },
    14: { slot: 7, side: "team2_id" },
    15: { slot: 8, side: "team1_id" },
    16: { slot: 8, side: "team2_id" },
  };

  for (const [r32Slot, expected] of Object.entries(expectedR32ToS16)) {
    it(`R32 slot ${r32Slot} → S16 slot ${expected.slot} (${expected.side})`, () => {
      const target = WORLD_CUP_NEXT_TARGET_BY_ROUND_SLOT[`R32|${r32Slot}`];
      expect(target.round).toBe("S16");
      expect(target.slot).toBe(expected.slot);
      expect(target.side).toBe(expected.side);
    });
  }

  it("each S16 slot has exactly two R32 feeders", () => {
    const feeders = new Map<number, string[]>();
    for (const [key, target] of Object.entries(WORLD_CUP_NEXT_TARGET_BY_ROUND_SLOT)) {
      if (!key.startsWith("R32|") || target.round !== "S16") continue;
      const arr = feeders.get(target.slot) ?? [];
      arr.push(key);
      feeders.set(target.slot, arr);
    }
    for (let slot = 1; slot <= 8; slot++) {
      expect(feeders.get(slot)?.length, `S16 slot ${slot} should have 2 R32 feeders`).toBe(2);
    }
  });

  it("each S16 slot is fed by one team1_id and one team2_id", () => {
    const sidesBySlot = new Map<number, string[]>();
    for (const [key, target] of Object.entries(WORLD_CUP_NEXT_TARGET_BY_ROUND_SLOT)) {
      if (!key.startsWith("R32|") || target.round !== "S16") continue;
      const arr = sidesBySlot.get(target.slot) ?? [];
      arr.push(target.side);
      sidesBySlot.set(target.slot, arr);
    }
    for (const [slot, sides] of sidesBySlot) {
      expect(sides, `S16 slot ${slot}`).toContain("team1_id");
      expect(sides, `S16 slot ${slot}`).toContain("team2_id");
    }
  });
});

// ---------------------------------------------------------------------------
// WORLD_CUP_NEXT_TARGET_BY_ROUND_SLOT — S16 → E8 routing (all 8 slots)
// ---------------------------------------------------------------------------

describe("WORLD_CUP_NEXT_TARGET_BY_ROUND_SLOT — S16 → E8 routing", () => {
  const expectedS16ToE8: Record<number, { slot: number; side: "team1_id" | "team2_id" }> = {
    1: { slot: 1, side: "team1_id" },
    2: { slot: 1, side: "team2_id" },
    3: { slot: 2, side: "team1_id" },
    4: { slot: 2, side: "team2_id" },
    5: { slot: 3, side: "team1_id" },
    6: { slot: 3, side: "team2_id" },
    7: { slot: 4, side: "team1_id" },
    8: { slot: 4, side: "team2_id" },
  };

  for (const [s16Slot, expected] of Object.entries(expectedS16ToE8)) {
    it(`S16 slot ${s16Slot} → E8 slot ${expected.slot} (${expected.side})`, () => {
      const target = WORLD_CUP_NEXT_TARGET_BY_ROUND_SLOT[`S16|${s16Slot}`];
      expect(target.round).toBe("E8");
      expect(target.slot).toBe(expected.slot);
      expect(target.side).toBe(expected.side);
    });
  }

  it("each E8 slot is fed by exactly two S16 games", () => {
    const feeders = new Map<number, string[]>();
    for (const [key, target] of Object.entries(WORLD_CUP_NEXT_TARGET_BY_ROUND_SLOT)) {
      if (!key.startsWith("S16|") || target.round !== "E8") continue;
      const arr = feeders.get(target.slot) ?? [];
      arr.push(key);
      feeders.set(target.slot, arr);
    }
    for (let slot = 1; slot <= 4; slot++) {
      expect(feeders.get(slot)?.length, `E8 slot ${slot} should have 2 S16 feeders`).toBe(2);
    }
  });
});

// ---------------------------------------------------------------------------
// WORLD_CUP_NEXT_TARGET_BY_ROUND_SLOT — E8 → F4 routing (all 4 slots)
// ---------------------------------------------------------------------------

describe("WORLD_CUP_NEXT_TARGET_BY_ROUND_SLOT — E8 → F4 routing", () => {
  const expectedE8ToF4: Record<number, { slot: number; side: "team1_id" | "team2_id" }> = {
    1: { slot: 1, side: "team1_id" },
    2: { slot: 1, side: "team2_id" },
    3: { slot: 2, side: "team1_id" },
    4: { slot: 2, side: "team2_id" },
  };

  for (const [e8Slot, expected] of Object.entries(expectedE8ToF4)) {
    it(`E8 slot ${e8Slot} → F4 slot ${expected.slot} (${expected.side})`, () => {
      const target = WORLD_CUP_NEXT_TARGET_BY_ROUND_SLOT[`E8|${e8Slot}`];
      expect(target.round).toBe("F4");
      expect(target.slot).toBe(expected.slot);
      expect(target.side).toBe(expected.side);
    });
  }

  it("each F4 slot is fed by exactly two E8 games", () => {
    const feeders = new Map<number, string[]>();
    for (const [key, target] of Object.entries(WORLD_CUP_NEXT_TARGET_BY_ROUND_SLOT)) {
      if (!key.startsWith("E8|") || target.round !== "F4") continue;
      const arr = feeders.get(target.slot) ?? [];
      arr.push(key);
      feeders.set(target.slot, arr);
    }
    for (let slot = 1; slot <= 2; slot++) {
      expect(feeders.get(slot)?.length, `F4 slot ${slot} should have 2 E8 feeders`).toBe(2);
    }
  });
});

// ---------------------------------------------------------------------------
// WORLD_CUP_FIXED_R32_SLOT_TARGETS — initial group placement
// ---------------------------------------------------------------------------

describe("WORLD_CUP_FIXED_R32_SLOT_TARGETS — group stage placement", () => {
  it("has exactly 24 entries (12 group winners + 12 runners-up)", () => {
    // The 8 third-place slots are dynamic, handled by resolveWorldCupThirdPlaceAssignments
    expect(Object.keys(WORLD_CUP_FIXED_R32_SLOT_TARGETS).length).toBe(24);
  });

  it("every entry's side is team1_id or team2_id", () => {
    for (const [label, target] of Object.entries(WORLD_CUP_FIXED_R32_SLOT_TARGETS)) {
      expect(["team1_id", "team2_id"], `${label}`).toContain(target.side);
    }
  });

  it("no two entries map to the same (slot, side) position", () => {
    const seen = new Set<string>();
    for (const [label, target] of Object.entries(WORLD_CUP_FIXED_R32_SLOT_TARGETS)) {
      const key = `${target.slot}|${target.side}`;
      expect(seen.has(key), `duplicate position for ${label}`).toBe(false);
      seen.add(key);
    }
  });

  it("all slots are within valid R32 range (1–16)", () => {
    for (const [label, target] of Object.entries(WORLD_CUP_FIXED_R32_SLOT_TARGETS)) {
      expect(target.slot, label).toBeGreaterThanOrEqual(1);
      expect(target.slot, label).toBeLessThanOrEqual(16);
    }
  });

  it("combined with third-place targets, all 32 R32 team slots are covered", () => {
    // Fixed 24 + dynamic 8 third-place = 32 total
    const fixed = Object.values(WORLD_CUP_FIXED_R32_SLOT_TARGETS);
    const thirdPlace = Object.values(WORLD_CUP_THIRD_PLACE_R32_TARGETS);
    const allPositions = new Set<string>();
    for (const t of fixed) allPositions.add(`${t.slot}|${t.side}`);
    for (const t of thirdPlace) allPositions.add(`${t.slot}|${t.side}`);
    expect(allPositions.size).toBe(32);
  });
});

// ---------------------------------------------------------------------------
// WORLD_CUP_SLOT_LABELS — display labels completeness
// ---------------------------------------------------------------------------

describe("WORLD_CUP_SLOT_LABELS — display labels", () => {
  it("has labels for all 16 R32 slots", () => {
    for (let slot = 1; slot <= 16; slot++) {
      expect(WORLD_CUP_SLOT_LABELS[`R32|${slot}`], `R32 slot ${slot} label`).toBeDefined();
    }
  });

  it("has labels for all 8 S16 slots", () => {
    for (let slot = 1; slot <= 8; slot++) {
      expect(WORLD_CUP_SLOT_LABELS[`S16|${slot}`], `S16 slot ${slot} label`).toBeDefined();
    }
  });

  it("each label entry is a pair of strings", () => {
    for (const [key, labels] of Object.entries(WORLD_CUP_SLOT_LABELS)) {
      expect(Array.isArray(labels), `${key} should be an array`).toBe(true);
      expect(labels.length, `${key} should have 2 labels`).toBe(2);
      expect(typeof labels[0]).toBe("string");
      expect(typeof labels[1]).toBe("string");
    }
  });
});

// ---------------------------------------------------------------------------
// resolveWorldCupThirdPlaceAssignments
// ---------------------------------------------------------------------------

describe("resolveWorldCupThirdPlaceAssignments", () => {
  it("returns null for fewer than 8 unique groups", () => {
    expect(resolveWorldCupThirdPlaceAssignments(["A","B","C","D","E","F","G"])).toBeNull();
  });

  it("returns null for more than 8 unique groups", () => {
    expect(resolveWorldCupThirdPlaceAssignments(["A","B","C","D","E","F","G","H","I"])).toBeNull();
  });

  it("deduplicates input: 9 entries with a repeat treated as 8 unique groups", () => {
    const result = resolveWorldCupThirdPlaceAssignments(["A","A","B","C","D","E","F","G","H"]);
    expect(result).not.toBeNull();
    expect(result?.size).toBe(8);
  });

  it("returns a Map of exactly 8 assignments for 8 valid groups", () => {
    const result = resolveWorldCupThirdPlaceAssignments(["A","B","C","D","E","F","G","H"]);
    expect(result).not.toBeNull();
    expect(result?.size).toBe(8);
  });

  it("every assigned group is in the valid candidates list for its target slot", () => {
    const result = resolveWorldCupThirdPlaceAssignments(["A","B","C","D","E","F","G","H"])!;
    for (const [winnerSlot, assignedGroup] of result.entries()) {
      const target = WORLD_CUP_THIRD_PLACE_R32_TARGETS[winnerSlot];
      expect(target, `no target defined for slot ${winnerSlot}`).toBeDefined();
      expect(target.candidates, `group ${assignedGroup} not valid for ${winnerSlot}`).toContain(assignedGroup);
    }
  });

  it("all 8 input groups appear exactly once across the assignment", () => {
    const qualified = ["A","B","C","D","E","F","G","H"];
    const result = resolveWorldCupThirdPlaceAssignments(qualified)!;
    const assigned = Array.from(result.values());
    expect(new Set(assigned).size).toBe(8);
    for (const g of qualified) expect(assigned).toContain(g);
  });

  it("assignment keys are all valid WORLD_CUP_THIRD_PLACE_R32_TARGETS keys", () => {
    const result = resolveWorldCupThirdPlaceAssignments(["A","B","C","D","E","F","G","H"])!;
    const validKeys = new Set(Object.keys(WORLD_CUP_THIRD_PLACE_R32_TARGETS));
    for (const key of result.keys()) {
      expect(validKeys.has(key), `unknown slot key: ${key}`).toBe(true);
    }
  });

  it("is case-insensitive: lowercase and uppercase produce equivalent results", () => {
    const upper = resolveWorldCupThirdPlaceAssignments(["A","B","C","D","E","F","G","H"]);
    const lower = resolveWorldCupThirdPlaceAssignments(["a","b","c","d","e","f","g","h"]);
    expect(Array.from(upper!.values()).sort()).toEqual(Array.from(lower!.values()).sort());
  });

  it("works with another valid 8-group combination (C,D,E,F,G,H,I,J)", () => {
    const result = resolveWorldCupThirdPlaceAssignments(["C","D","E","F","G","H","I","J"]);
    expect(result).not.toBeNull();
    // Verify correctness of assignment
    for (const [winnerSlot, group] of result!.entries()) {
      const target = WORLD_CUP_THIRD_PLACE_R32_TARGETS[winnerSlot];
      expect(target.candidates).toContain(group);
    }
  });
});
