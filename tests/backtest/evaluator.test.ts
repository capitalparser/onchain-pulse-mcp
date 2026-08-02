import { describe, expect, it } from "vitest";
import {
  evaluateCompassBacktest,
  parseCompassBacktestJsonl,
} from "../../src/backtest/evaluator.js";
import type { CompassBacktestRow } from "../../src/backtest/types.js";

function row(overrides: Record<string, unknown> = {}): CompassBacktestRow {
  return {
    observed_at: "2026-01-01T00:00:00.000Z",
    judgment: "structural",
    confidence: 0.8,
    outcomes: {
      "7d": {
        outcome_at: "2026-01-08T00:00:00.000Z",
        eth_return_pct: 10,
        value_capture_delta_pct: 5,
      },
      "30d": null,
      "90d": null,
    },
    ...overrides,
  } as CompassBacktestRow;
}

describe("Compass backtest evaluator", () => {
  it("keeps empty input descriptive with zero coverage and null outcome statistics", () => {
    expect(parseCompassBacktestJsonl("")).toEqual([]);
    expect(evaluateCompassBacktest([])).toEqual({
      methodology_version: "compass-backtest-v1",
      interpretation: "descriptive_validation_not_price_prediction",
      observation_count: 0,
      horizons: {
        "7d": expect.objectContaining({ sample_count: 0, coverage: 0, eth_return_pct: { sample_count: 0, average: null, median: null } }),
        "30d": expect.objectContaining({ sample_count: 0, coverage: 0 }),
        "90d": expect.objectContaining({ sample_count: 0, coverage: 0 }),
      },
    });
  });

  it("uses available outcomes only and does not treat missing outcomes as failed confirmation", () => {
    const rows = [
      row(),
      row({
        observed_at: "2026-01-02T00:00:00.000Z",
        judgment: "structural",
        confidence: 0.5,
        outcomes: { "7d": null, "30d": null, "90d": null },
      }),
      row({
        observed_at: "2026-01-03T00:00:00.000Z",
        judgment: "flow-driven",
        confidence: 0.4,
        outcomes: {
          "7d": { outcome_at: "2026-01-10T00:00:00.000Z", eth_return_pct: -2, value_capture_delta_pct: null },
          "30d": null,
          "90d": null,
        },
      }),
    ];

    const result = evaluateCompassBacktest(rows);
    const sevenDays = result.horizons["7d"];

    expect(sevenDays).toMatchObject({
      sample_count: 2,
      eth_return_pct: { sample_count: 2, average: 4, median: 4 },
      structural_confirmation: { structural_signal_count: 2, available_outcome_count: 1, confirmation_count: 1, rate: 1 },
    });
    expect(sevenDays.coverage).toBeCloseTo(2 / 3, 10);
    expect(sevenDays.by_judgment.structural).toMatchObject({
      observation_count: 2,
      sample_count: 1,
      coverage: 0.5,
      structural_confirmation: { available_outcome_count: 1, confirmation_count: 1, rate: 1 },
    });
    expect(sevenDays.by_judgment["flow-driven"]).toMatchObject({
      observation_count: 1,
      sample_count: 1,
      eth_return_pct: { average: -2, median: -2 },
      structural_confirmation: { structural_signal_count: 0, available_outcome_count: 0, confirmation_count: 0, rate: null },
    });
  });

  it("returns deterministic average and median statistics by judgment", () => {
    const rows = [
      row({ outcomes: { "7d": { outcome_at: "2026-01-08T00:00:00.000Z", eth_return_pct: 5, value_capture_delta_pct: 1 }, "30d": null, "90d": null } }),
      row({ observed_at: "2026-01-02T00:00:00.000Z", judgment: "neutral", outcomes: { "7d": { outcome_at: "2026-01-09T00:00:00.000Z", eth_return_pct: 1, value_capture_delta_pct: -1 }, "30d": null, "90d": null } }),
      row({ observed_at: "2026-01-03T00:00:00.000Z", judgment: "neutral", outcomes: { "7d": { outcome_at: "2026-01-10T00:00:00.000Z", eth_return_pct: 9, value_capture_delta_pct: 2 }, "30d": null, "90d": null } }),
    ];

    const result = evaluateCompassBacktest(rows);
    expect(result.horizons["7d"].eth_return_pct).toEqual({ sample_count: 3, average: 5, median: 5 });
    expect(result.horizons["7d"].by_judgment.neutral.eth_return_pct).toEqual({ sample_count: 2, average: 5, median: 5 });
  });

  it("parses bounded JSONL rows and rejects malformed, duplicate, non-chronological, and leaking outcomes", () => {
    const first = JSON.stringify(row());
    expect(parseCompassBacktestJsonl(first)).toHaveLength(1);
    expect(() => parseCompassBacktestJsonl("not-json")).toThrow(/line 1/i);
    expect(() => parseCompassBacktestJsonl(`${first}\n${first}`)).toThrow(/duplicate/i);
    expect(() => parseCompassBacktestJsonl(`${JSON.stringify(row({ observed_at: "2026-01-02T00:00:00.000Z", outcomes: { "7d": { outcome_at: "2026-01-09T00:00:00.000Z", eth_return_pct: 1, value_capture_delta_pct: 1 }, "30d": null, "90d": null } }))}\n${first}`)).toThrow(/chronological/i);
    expect(() => parseCompassBacktestJsonl(JSON.stringify(row({ outcomes: { "7d": { outcome_at: "2025-12-31T00:00:00.000Z", eth_return_pct: 1, value_capture_delta_pct: 1 }, "30d": null, "90d": null } })))).toThrow(/horizon|precedes/i);
    expect(() => parseCompassBacktestJsonl(JSON.stringify(row({ outcomes: { "7d": null, "30d": null, "90d": { outcome_at: "2026-01-02T00:00:00.000Z", eth_return_pct: 1, value_capture_delta_pct: 1 } } })))).toThrow(/horizon/i);
    expect(() => parseCompassBacktestJsonl(JSON.stringify({ ...row(), unknown: true }))).toThrow(/line 1/i);
    expect(() => parseCompassBacktestJsonl(JSON.stringify(row({ confidence: Infinity })))).toThrow(/line 1/i);
  });
});
