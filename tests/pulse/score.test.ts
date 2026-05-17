import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadPulseConfig } from "../../src/pulse/config.js";
import { computePulseScore } from "../../src/pulse/score.js";

const cfg = loadPulseConfig();
const fixture = JSON.parse(
  readFileSync(resolve("tests/pulse/fixtures/golden_input.json"), "utf-8"),
) as { values: Record<string, number>; history: Record<string, number[]> };

describe("computePulseScore", () => {
  it("produces a deterministic score for golden input", () => {
    const r = computePulseScore({ values: fixture.values, history: fixture.history, cfg });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.confidence).toBe(1.0);
    expect(Math.round(r.score!)).toBe(93);
  });

  it("renormalises weights when one input is missing (stablecoin omitted)", () => {
    const v = { ...fixture.values };
    delete v.stablecoin_7d_supply_delta;
    const r = computePulseScore({ values: v, history: fixture.history, cfg });
    expect(r.confidence).toBeCloseTo(0.8, 5);
    expect(r.score).not.toBeNull();
  });

  it("returns null score and confidence 0 when all inputs missing", () => {
    const r = computePulseScore({ values: {}, history: fixture.history, cfg });
    expect(r.score).toBeNull();
    expect(r.confidence).toBe(0);
  });

  it("reverses funding contribution when |z| exceeds threshold", () => {
    const extreme = { ...fixture.values, funding_avg_btc_eth: 0.005 };
    const r = computePulseScore({ values: extreme, history: fixture.history, cfg });
    const r0 = computePulseScore({ values: fixture.values, history: fixture.history, cfg });
    expect(r.score!).toBeLessThan(r0.score!);
  });

  it("reports negative-direction inputs (P/C ratio) inversely", () => {
    const lowPC = { ...fixture.values, options_put_call_ratio: 0.3 };
    const highPC = { ...fixture.values, options_put_call_ratio: 1.0 };
    const a = computePulseScore({ values: lowPC, history: fixture.history, cfg });
    const b = computePulseScore({ values: highPC, history: fixture.history, cfg });
    expect(a.score!).toBeGreaterThan(b.score!);
  });

  it("contributes z=0 when history length < cfg.history.min_samples_for_zscore", () => {
    const min = cfg.history?.min_samples_for_zscore ?? 5;
    const shortHist = Object.fromEntries(
      Object.keys(fixture.values).map((k) => [k, Array(min - 1).fill(0)]),
    ) as Record<string, number[]>;
    const r = computePulseScore({ values: fixture.values, history: shortHist, cfg });
    expect(r.score).toBe(50);
    expect(r.confidence).toBe(1);
  });

  it("activates z-score once history reaches min_samples_for_zscore", () => {
    const min = cfg.history?.min_samples_for_zscore ?? 5;
    const truncated = Object.fromEntries(
      Object.entries(fixture.history).map(([k, v]) => [k, v.slice(0, min)]),
    ) as Record<string, number[]>;
    const r = computePulseScore({ values: fixture.values, history: truncated, cfg });
    expect(r.score).not.toBe(50);
  });

  it("respects an overridden min_samples_for_zscore (config-driven, not hardcoded)", () => {
    const cfg10 = {
      ...cfg,
      history: { ...(cfg.history ?? {}), min_samples_for_zscore: 10 },
    } as typeof cfg;
    const sixPt = Object.fromEntries(
      Object.entries(fixture.history).map(([k, v]) => [k, v.slice(0, 6)]),
    ) as Record<string, number[]>;
    const r = computePulseScore({ values: fixture.values, history: sixPt, cfg: cfg10 });
    expect(r.score).toBe(50);
  });
});
