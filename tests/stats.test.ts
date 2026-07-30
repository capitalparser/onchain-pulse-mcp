import { describe, it, expect } from "vitest";
import { mean, stdev, zScore, sigmoid01 } from "../src/stats.js";

describe("stats", () => {
  it("mean averages a list", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
  });

  it("mean throws on empty input", () => {
    expect(() => mean([])).toThrow("mean: empty input");
  });

  it("stdev computes population standard deviation", () => {
    // population stdev of [2,4,4,4,5,5,7,9] = 2
    expect(stdev([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);
  });

  it("stdev returns 0 for single-value series", () => {
    expect(stdev([5])).toBe(0);
  });

  it("zScore returns 0 when stdev is 0 (no variance)", () => {
    expect(zScore(5, [5, 5, 5])).toBe(0);
  });

  it("zScore yields ~1 for one-stdev-above-mean point", () => {
    const series = [2, 4, 4, 4, 5, 5, 7, 9];
    expect(zScore(7, series)).toBeCloseTo(1.0, 5);
  });

  it("sigmoid01 maps 0 -> 0.5", () => {
    expect(sigmoid01(0)).toBeCloseTo(0.5, 5);
  });

  it("sigmoid01 is monotonic", () => {
    const a = sigmoid01(-2);
    const b = sigmoid01(0);
    const c = sigmoid01(2);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });
});
