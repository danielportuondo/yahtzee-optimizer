import { describe, expect, it } from "vitest";
import { scorePercentile } from "../percentile.js";

// Three equal bins covering [0,10), [10,20), [20,30): CDF = 1/3, 2/3, 1.
const CDF = [1 / 3, 2 / 3, 1];
const BIN = 10;

describe("scorePercentile", () => {
  it("returns 0 at or below zero", () => {
    expect(scorePercentile(CDF, BIN, 0)).toBe(0);
    expect(scorePercentile(CDF, BIN, -5)).toBe(0);
  });

  it("interpolates linearly within a bin", () => {
    // start of bin 0 -> 0 (below the bin is 0), midpoint -> half of 1/3
    expect(scorePercentile(CDF, BIN, 5)).toBeCloseTo(1 / 6, 6);
    // top of bin 0 -> full 1/3
    expect(scorePercentile(CDF, BIN, 10)).toBeCloseTo(1 / 3, 6);
    // midpoint of bin 1 -> 1/3 + half of (2/3 - 1/3)
    expect(scorePercentile(CDF, BIN, 15)).toBeCloseTo(1 / 2, 6);
  });

  it("is monotonic non-decreasing", () => {
    let prev = -1;
    for (let s = 0; s <= 30; s += 1) {
      const p = scorePercentile(CDF, BIN, s);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
  });

  it("saturates at 1 beyond the last bin", () => {
    expect(scorePercentile(CDF, BIN, 30)).toBe(1);
    expect(scorePercentile(CDF, BIN, 100)).toBe(1);
  });

  it("handles an empty CDF", () => {
    expect(scorePercentile([], BIN, 42)).toBe(0);
  });
});
