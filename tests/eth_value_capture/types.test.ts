import { describe, expect, it } from "vitest";
import {
  EthValueCaptureSnapshotSchema,
  GetEthValueCaptureInputSchema,
  type EthValueCaptureSnapshot,
} from "../../src/eth_value_capture/types.js";

function nullEthMetric() {
  return {
    current: null,
    previous: null,
    delta: null,
    pct_change: null,
    unit: "ETH" as const,
  };
}

function makeValidSnapshotFixture(): EthValueCaptureSnapshot {
  return {
    summary: "ETH value-capture data is partially available.",
    window: "30d" as const,
    cutoff_day: "2026-07-29",
    as_of: "2026-07-29T00:00:00Z",
    status: "partial" as const,
    metrics: {
      gross_l1_fees_eth: nullEthMetric(),
      base_fee_burn_eth: nullEthMetric(),
      blob_fee_burn_eth: nullEthMetric(),
      priority_fee_eth: nullEthMetric(),
      total_burn_eth: nullEthMetric(),
      consensus_issuance_eth: nullEthMetric(),
      net_issuance_eth: nullEthMetric(),
      l2_rent_paid_eth: nullEthMetric(),
      l2_calldata_fee_eth: nullEthMetric(),
      l2_blob_fee_eth: nullEthMetric(),
      l2_verification_fee_eth: nullEthMetric(),
    },
    ratios: {
      blob_share_of_total_burn: {
        current: null,
        previous: null,
        delta: null,
        unit: "ratio" as const,
      },
      l2_rent_share_of_l1_fees: {
        current: null,
        previous: null,
        delta: null,
        unit: "ratio" as const,
      },
    },
    sources: [],
    source_status: [],
    stale_data: [],
    confidence: 0,
    capabilities: { byok_active: [], paid_sources_active: [] },
    gaps: [{ code: "partial_result" as const, detail: "No fee source." }],
    methodology_version: "eth-value-capture-v1" as const,
  };
}

describe("GetEthValueCaptureInputSchema", () => {
  it("applies conservative defaults", () => {
    expect(GetEthValueCaptureInputSchema.parse({})).toEqual({
      window: "30d",
      paid_mode: "free_only",
      include_rollups: false,
    });
  });

  it.each(["1d", "365d", "all"])("rejects unsupported window %s", (window) => {
    expect(() => GetEthValueCaptureInputSchema.parse({ window })).toThrow();
  });

  it("rejects unknown input fields", () => {
    expect(() => GetEthValueCaptureInputSchema.parse({ extra: true })).toThrow();
  });
});

describe("EthValueCaptureSnapshotSchema", () => {
  it("accepts the complete specialized response contract", () => {
    const candidate = makeValidSnapshotFixture();
    expect(EthValueCaptureSnapshotSchema.parse(candidate)).toEqual(candidate);
  });

  it("rejects non-finite metrics", () => {
    const candidate = makeValidSnapshotFixture();
    candidate.metrics.total_burn_eth.current = Number.NaN;
    expect(EthValueCaptureSnapshotSchema.safeParse(candidate).success).toBe(false);
  });

  it("rejects unknown gap codes", () => {
    const candidate = makeValidSnapshotFixture() as Record<string, unknown>;
    candidate.gaps = [{ code: "unknown_gap", detail: "bad" }];
    expect(EthValueCaptureSnapshotSchema.safeParse(candidate).success).toBe(false);
  });
});
