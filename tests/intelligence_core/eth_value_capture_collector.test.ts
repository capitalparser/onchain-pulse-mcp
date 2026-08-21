import { describe, expect, it } from "vitest";
import type { EthValueCaptureSnapshot } from "../../src/eth_value_capture/types.js";
import { createEthValueCaptureCollector } from "../../src/intelligence_core/eth_value_capture_collector.js";
import type { HandlerContext } from "../../src/server.js";

function metric(current: number | null, unit: "ETH" = "ETH") {
  return { current, previous: null, delta: null, pct_change: null, unit };
}

function snapshot(): EthValueCaptureSnapshot {
  return {
    summary: "test",
    window: "30d",
    cutoff_day: "2026-08-20",
    as_of: "2026-08-21T00:05:00.000Z",
    status: "partial",
    metrics: {
      gross_l1_fees_eth: metric(100), base_fee_burn_eth: metric(60), blob_fee_burn_eth: metric(10),
      priority_fee_eth: metric(30), total_burn_eth: metric(70), consensus_issuance_eth: metric(50),
      net_issuance_eth: metric(-20), l2_rent_paid_eth: metric(15), l2_calldata_fee_eth: metric(4),
      l2_blob_fee_eth: metric(8), l2_verification_fee_eth: metric(3),
    },
    ratios: {
      blob_share_of_total_burn: { current: 0.14, previous: null, delta: null, unit: "ratio" },
      l2_rent_share_of_l1_fees: { current: 0.15, previous: null, delta: null, unit: "ratio" },
    },
    sources: ["coinmetrics-community:SplyCur", "growthepie:rent_paid_eth"],
    source_status: [], stale_data: [], confidence: 0.8,
    capabilities: { byok_active: [], paid_sources_active: [] },
    gaps: [{ code: "partial_result", detail: "one optional source missing" }],
    methodology_version: "eth-value-capture-v1",
  };
}

const unusedHandlerContext = {} as HandlerContext;

describe("createEthValueCaptureCollector", () => {
  it("emits canonical observations and preserves explicit source gaps", async () => {
    const collector = createEthValueCaptureCollector({
      handlerContext: unusedHandlerContext,
      now: () => new Date("2026-08-21T00:06:00.000Z"),
      fetchSnapshot: async () => snapshot(),
    });
    const result = await collector.collect("2026-08-21T00:06:00.000Z");
    expect(result.observations).toHaveLength(7);
    expect(result.gaps).toContain("partial_result:one optional source missing");
  });

  it("does not leak a snapshot ingested after the research cutoff", async () => {
    const collector = createEthValueCaptureCollector({
      handlerContext: unusedHandlerContext,
      now: () => new Date("2026-08-21T00:06:00.000Z"),
      fetchSnapshot: async () => snapshot(),
    });
    const result = await collector.collect("2026-08-21T00:05:30.000Z");
    expect(result.observations).toEqual([]);
    expect(result.gaps).toContain("eth-value-capture:no-observations-at-cutoff");
  });
});
