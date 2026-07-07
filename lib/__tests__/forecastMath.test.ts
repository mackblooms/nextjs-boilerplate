import { describe, expect, it } from "vitest";
import { isFirstPlaceDominated } from "../forecastMath";

describe("isFirstPlaceDominated", () => {
  it("eliminates an entry trailing someone with the same remaining teams", () => {
    const scores = new Map([
      ["leader", 120],
      ["connor", 100],
    ]);
    const remaining = new Map([
      ["leader", new Set(["france", "morocco"])],
      ["connor", new Set(["france", "morocco"])],
    ]);

    expect(isFirstPlaceDominated("connor", scores, remaining)).toBe(true);
  });

  it("eliminates an entry trailing someone with a superset of remaining teams", () => {
    const scores = new Map([
      ["leader", 120],
      ["mike", 100],
    ]);
    const remaining = new Map([
      ["leader", new Set(["argentina", "spain", "england"])],
      ["mike", new Set(["argentina", "spain"])],
    ]);

    expect(isFirstPlaceDominated("mike", scores, remaining)).toBe(true);
  });

  it("keeps an entry alive when it has a different remaining team path", () => {
    const scores = new Map([
      ["leader", 120],
      ["chaser", 100],
    ]);
    const remaining = new Map([
      ["leader", new Set(["france", "morocco"])],
      ["chaser", new Set(["france", "brazil"])],
    ]);

    expect(isFirstPlaceDominated("chaser", scores, remaining)).toBe(false);
  });
});
