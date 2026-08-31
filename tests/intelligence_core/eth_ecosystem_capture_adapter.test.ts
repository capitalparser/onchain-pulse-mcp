import { describe, expect, it } from "vitest";
import type { EthEcosystemCaptureSnapshot } from "../../src/eth_ecosystem_capture/types.js";
import { metricObservationsFromEthEcosystemCapture } from "../../src/intelligence_core/eth_ecosystem_capture_adapter.js";
import { getFeatureDefinition } from "../../src/intelligence_core/feature_registry.js";

function usd(current: number | null) {
  return { current, previous: null, delta: null, pct_change: null, unit: "USD" as const };
}

function ratio(current: number | null) {
  return { current, previous: null, delta: null, unit: "ratio" as const };
}

function snapshot(): EthEcosystemCaptureSnapshot {
  return {
    summary: "test",
    window: "30d",
    cutoff_day: "2026-08-20",
    as_of: "2026-08-21T00:05:00.000Z",
    status: "complete",
    metrics: {
      l2_user_fees_usd: usd(1_000),
      l2_rent_paid_usd: usd(200),
      l2_settlement_cost_share: ratio(0.2),
      ethereum_l1_stablecoin_supply_usd: usd(50_000),
      ethereum_l2_stablecoin_supply_usd: usd(20_000),
      ethereum_ecosystem_stablecoin_supply_usd: usd(70_000),
    },
    coverage: {
      included_l2_count: 2,
      included_l2_origins: ["arbitrum", "base"],
      excluded_external_da_origins: ["arbitrum_nova"],
    },
    sources: [
      "growthepie:master",
      "growthepie:fees_paid_usd",
      "growthepie:rent_paid_usd",
      "growthepie:stables_mcap",
    ],
    source_status: [],
    stale_data: [],
    confidence: 0.9,
    gaps: [],
    methodology_version: "eth-ecosystem-capture-v1",
  };
}

describe("metricObservationsFromEthEcosystemCapture", () => {
  it("emits deterministic chain-bounded metrics and coverage dimensions", () => {
    const input = snapshot();
    const first = metricObservationsFromEthEcosystemCapture(
      input,
      new Date("2026-08-21T00:06:00.000Z"),
    );
    const second = metricObservationsFromEthEcosystemCapture(
      input,
      new Date("2026-08-21T00:06:00.000Z"),
    );

    expect(first).toHaveLength(6);
    expect(first.map((item) => item.id)).toEqual(second.map((item) => item.id));
    expect(first.find((item) => item.metric_key === "eth.l2_settlement_cost_share")).toMatchObject({
      value: 0.2,
      unit: "ratio",
      subject_ref: "ethereum",
      asset_ref: "ETH",
      source_at: "2026-08-20T23:59:59.999Z",
      methodology_version: "eth-ecosystem-capture-v1",
      dimensions: {
        window: "30d",
        snapshot_status: "complete",
        cutoff_day: "2026-08-20",
        chain_scope: "ethereum_l1_and_ethereum_da_rollups",
        included_l2_count: "2",
        external_da_excluded_count: "1",
      },
    });
  });

  it("uses the same semantic ids for live and backfill operational metadata", () => {
    const live = metricObservationsFromEthEcosystemCapture(
      snapshot(),
      new Date("2026-08-21T00:06:00.000Z"),
    );
    const backfill = metricObservationsFromEthEcosystemCapture(
      snapshot(),
      new Date("2026-08-24T01:00:00.000Z"),
      {
        dimensions: {
          collection_mode: "historical_backfill",
          backfill_run_id: "run-002",
          revision_basis: "latest_available_at_retrieval",
          source_versioning: "unversioned_export_at_retrieval",
        },
      },
    );

    expect(backfill.map((item) => item.id)).toEqual(live.map((item) => item.id));
    expect(backfill.every((item) => item.ingested_at === "2026-08-24T01:00:00.000Z"))
      .toBe(true);
  });

  it("omits unavailable metrics instead of replacing them with zero", () => {
    const input = snapshot();
    input.metrics.l2_settlement_cost_share.current = null;
    const result = metricObservationsFromEthEcosystemCapture(
      input,
      new Date("2026-08-21T00:06:00.000Z"),
    );

    expect(result.map((item) => item.metric_key)).not.toContain("eth.l2_settlement_cost_share");
    expect(result).toHaveLength(5);
  });

  it("returns no observations without source provenance", () => {
    const input = snapshot();
    input.sources = [];
    expect(metricObservationsFromEthEcosystemCapture(
      input,
      new Date("2026-08-21T00:06:00.000Z"),
    )).toEqual([]);
  });

  it("rejects ingestion before the analytical snapshot became available", () => {
    expect(() => metricObservationsFromEthEcosystemCapture(
      snapshot(),
      new Date("2026-08-21T00:04:59.000Z"),
    )).toThrow(/ingestedAt must be at or after ecosystem snapshot as_of/);
  });

  it("registers every emitted metric as point-in-time-safe and source-dependent", () => {
    const keys = metricObservationsFromEthEcosystemCapture(
      snapshot(),
      new Date("2026-08-21T00:06:00.000Z"),
    ).map((item) => item.metric_key);

    for (const key of keys) {
      expect(getFeatureDefinition(key)).toMatchObject({
        methodology_version: "eth-ecosystem-capture-v1",
        point_in_time_safe: true,
        backfill: "source_dependent",
      });
    }
  });
});
