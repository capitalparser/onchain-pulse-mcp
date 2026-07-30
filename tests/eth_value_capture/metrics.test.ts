import { describe, expect, it } from "vitest";
import {
  deriveFeeMetrics,
  makeEthWindowMetric,
  makeRatioMetric,
  nullableAdd,
  shiftUtcDay,
  windowToDays,
} from "../../src/eth_value_capture/metrics.js";

describe("window arithmetic", () => {
  it.each([
    ["7d", 7],
    ["30d", 30],
    ["90d", 90],
  ] as const)("maps %s to %i days", (window, days) => {
    expect(windowToDays(window)).toBe(days);
  });

  it("shifts exact UTC boundaries across month boundaries", () => {
    expect(shiftUtcDay("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftUtcDay("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("keeps missing values null and blocks percent change at zero", () => {
    expect(makeEthWindowMetric(null, 2)).toEqual({
      current: null,
      previous: 2,
      delta: null,
      pct_change: null,
      unit: "ETH",
    });
    expect(makeEthWindowMetric(3, 0).pct_change).toBeNull();
  });

  it("preserves negative net issuance", () => {
    expect(makeEthWindowMetric(-20, 10)).toEqual({
      current: -20,
      previous: 10,
      delta: -30,
      pct_change: -3,
      unit: "ETH",
    });
  });

  it("rejects non-finite values as missing", () => {
    expect(makeEthWindowMetric(Number.POSITIVE_INFINITY, 1).current).toBeNull();
  });
});

describe("nullable arithmetic", () => {
  it("adds finite inputs and propagates missing inputs", () => {
    expect(nullableAdd(1, 2, 3)).toBe(6);
    expect(nullableAdd(1, null, 3)).toBeNull();
  });
});

describe("fee derivation", () => {
  it("derives gross fees and burn without adding L2 rent", () => {
    const result = deriveFeeMetrics({
      baseFeeBurn: { current: 100, previous: 80 },
      blobFeeBurn: { current: 10, previous: 8 },
      priorityFee: { current: 20, previous: 15 },
      l2Rent: { current: 50, previous: 40 },
    });

    expect(result.grossL1Fees).toEqual({ current: 130, previous: 103 });
    expect(result.totalBurn).toEqual({ current: 110, previous: 88 });
    expect(result).not.toHaveProperty("totalValueCapture");
  });

  it("does not turn a missing component into zero", () => {
    const result = deriveFeeMetrics({
      baseFeeBurn: { current: 100, previous: 80 },
      blobFeeBurn: { current: null, previous: 8 },
      priorityFee: { current: 20, previous: 15 },
      l2Rent: { current: 50, previous: 40 },
    });

    expect(result.grossL1Fees.current).toBeNull();
    expect(result.totalBurn.current).toBeNull();
    expect(result.grossL1Fees.previous).toBe(103);
  });
});

describe("ratio derivation", () => {
  it("computes current, previous, and delta ratios", () => {
    expect(makeRatioMetric(2, 10, 1, 10)).toEqual({
      current: 0.2,
      previous: 0.1,
      delta: 0.1,
      unit: "ratio",
    });
  });

  it("returns null when a denominator is zero or an input is absent", () => {
    expect(makeRatioMetric(2, 0, null, 4)).toEqual({
      current: null,
      previous: null,
      delta: null,
      unit: "ratio",
    });
  });
});
