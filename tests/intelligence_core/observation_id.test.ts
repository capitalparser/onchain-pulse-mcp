import { describe, expect, it } from "vitest";
import { buildMetricObservationId } from "../../src/intelligence_core/observation_id.js";

function args(overrides: Partial<Parameters<typeof buildMetricObservationId>[0]> = {}) {
  return {
    metricKey: "eth.l2_settlement_cost_share",
    subjectRef: "ethereum",
    assetRef: "ETH",
    value: 0.15,
    unit: "ratio",
    sourceAt: "2026-08-20T00:00:00.000Z",
    observedAt: "2026-08-21T00:00:00.000Z",
    confidence: 0.9,
    sourceRefs: ["growthepie:rent_paid_usd", "growthepie:fees_paid_usd"],
    methodologyVersion: "eth-ecosystem-capture-v1",
    dimensions: { window: "30d", cutoff_day: "2026-08-22" },
    ...overrides,
  };
}

describe("buildMetricObservationId", () => {
  it("is stable for an identical semantic revision and source order", () => {
    const first = buildMetricObservationId(args());
    const second = buildMetricObservationId(args({
      sourceRefs: ["growthepie:fees_paid_usd", "growthepie:rent_paid_usd"],
      dimensions: { cutoff_day: "2026-08-22", window: "30d" },
    }));
    expect(first).toBe(second);
    expect(first).toMatch(/^metric:[0-9a-f]{64}$/);
  });

  it("creates a new revision id when the derived value changes", () => {
    expect(buildMetricObservationId(args({ value: 0.15 })))
      .not.toBe(buildMetricObservationId(args({ value: 0.16 })));
  });

  it("creates a new revision id when the methodology changes", () => {
    expect(buildMetricObservationId(args({ methodologyVersion: "eth-ecosystem-capture-v1" })))
      .not.toBe(buildMetricObservationId(args({ methodologyVersion: "eth-ecosystem-capture-v2" })));
  });

  it("ignores ingestion and operational run metadata so retries remain idempotent", () => {
    const live = buildMetricObservationId(args());
    const backfill = buildMetricObservationId(args({
      dimensions: {
        window: "30d",
        cutoff_day: "2026-08-22",
        collection_mode: "historical_backfill",
        backfill_run_id: "run-b",
        revision_basis: "latest_available_at_retrieval",
      },
    }));
    expect(live).toBe(backfill);
  });
});
