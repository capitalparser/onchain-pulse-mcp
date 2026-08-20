import { describe, expect, it } from "vitest";
import type { EthValueCaptureSnapshot } from "../../src/eth_value_capture/types.js";
import { metricObservationsFromEthValueCapture } from "../../src/intelligence_core/eth_value_capture_adapter.js";

function metric(current: number | null, unit: "ETH" = "ETH") {
  return { current, previous: null, delta: null, pct_change: null, unit };
}

function snapshot(): EthValueCaptureSnapshot {
  return {
    summary: "test",
    window: "30d",
    cutoff_day: "2026-08-20",
    as_of: "2026-08-21T00:05:00.000Z",
    status: "complete",
    metrics: {
      gross_l1_fees_eth: metric(100),
      base_fee_burn_eth: metric(60),
      blob_fee_burn_eth: metric(10),
      priority_fee_eth: metric(30),
      total_burn_eth: metric(70),
      consensus_issuance_eth: metric(50),
      net_issuance_eth: metric(-20),
      l2_rent_paid_eth: metric(15),
      l2_calldata_fee_eth: metric(4),
      l2_blob_fee_eth: metric(8),
      l2_verification_fee_eth: metric(3),
    },
    ratios: {
      blob_share_of_total_burn: { current: 0.14, previous: null, delta: null, unit: "ratio" },
      l2_rent_share_of_l1_fees: { current: 0.15, previous: null, delta: null, unit: "ratio" },
    },
    sources: ["coinmetrics-community:SplyCur", "growthepie:rent_paid_eth"],
    source_status: [],
    stale_data: [],
    confidence: 0.8,
    capabilities: { byok_active: [], paid_sources_active: [] },
    gaps: [],
    methodology_version: "eth-value-capture-v1",
  };
}

describe("metricObservationsFromEthValueCapture", () => {
  it("emits canonical current-value metrics with deterministic ids", () => {
    const input = snapshot();
    const first = metricObservationsFromEthValueCapture(input, new Date("2026-08-21T00:06:00.000Z"));
    const second = metricObservationsFromEthValueCapture(input, new Date("2026-08-21T00:06:00.000Z"));

    expect(first).toHaveLength(7);
    expect(first.map((item) => item.id)).toEqual(second.map((item) => item.id));
    expect(first.find((item) => item.metric_key === "eth.net_issuance_eth")).toMatchObject({
      value: -20,
      unit: "ETH",
      subject_ref: "ethereum",
      asset_ref: "ETH",
      methodology_version: "eth-value-capture-v1",
      dimensions: { window: "30d", snapshot_status: "complete", cutoff_day: "2026-08-20" },
    });
  });

  it("omits unavailable values rather than manufacturing zeroes", () => {
    const input = snapshot();
    input.metrics.l2_blob_fee_eth.current = null;
    const result = metricObservationsFromEthValueCapture(input, new Date("2026-08-21T00:06:00.000Z"));
    expect(result.map((item) => item.metric_key)).not.toContain("eth.l2_blob_fee_eth");
  });

  it("returns no observations when the snapshot has no source provenance", () => {
    const input = snapshot();
    input.sources = [];
    expect(metricObservationsFromEthValueCapture(input, new Date("2026-08-21T00:06:00.000Z"))).toEqual([]);
  });

  it("rejects ingestion timestamps that predate analytical availability", () => {
    expect(() => metricObservationsFromEthValueCapture(snapshot(), new Date("2026-08-21T00:04:59.000Z"))).toThrow(/ingestedAt must be at or after snapshot as_of/);
  });
});
