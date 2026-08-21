import { describe, expect, it } from "vitest";
import type { EthValueCaptureSnapshot } from "../../src/eth_value_capture/types.js";
import { runEthValueCaptureCollectionOnce } from "../../src/intelligence_core/collection_run.js";
import type { MetricObservationStore } from "../../src/intelligence_core/store.js";
import type { MetricObservation } from "../../src/intelligence_core/types.js";
import type { HandlerContext } from "../../src/server.js";

class MemoryStore implements MetricObservationStore {
  rows: MetricObservation[] = [];
  async append(observation: MetricObservation): Promise<void> { this.rows.push(observation); }
  async readAll(): Promise<MetricObservation[]> { return [...this.rows]; }
  async query(): Promise<MetricObservation[]> { return [...this.rows]; }
}

function metric(current: number | null, unit: "ETH" = "ETH") {
  return { current, previous: null, delta: null, pct_change: null, unit };
}

function snapshot(): EthValueCaptureSnapshot {
  return {
    summary: "test", window: "30d", cutoff_day: "2026-08-20", as_of: "2026-08-21T00:05:00.000Z", status: "complete",
    metrics: {
      gross_l1_fees_eth: metric(100), base_fee_burn_eth: metric(60), blob_fee_burn_eth: metric(10), priority_fee_eth: metric(30),
      total_burn_eth: metric(70), consensus_issuance_eth: metric(50), net_issuance_eth: metric(-20), l2_rent_paid_eth: metric(15),
      l2_calldata_fee_eth: metric(4), l2_blob_fee_eth: metric(8), l2_verification_fee_eth: metric(3),
    },
    ratios: {
      blob_share_of_total_burn: { current: 0.14, previous: null, delta: null, unit: "ratio" },
      l2_rent_share_of_l1_fees: { current: 0.15, previous: null, delta: null, unit: "ratio" },
    },
    sources: ["coinmetrics-community:SplyCur", "growthepie:rent_paid_eth"], source_status: [], stale_data: [], confidence: 0.8,
    capabilities: { byok_active: [], paid_sources_active: [] }, gaps: [], methodology_version: "eth-value-capture-v1",
  };
}

const unusedHandlerContext = {} as HandlerContext;

describe("runEthValueCaptureCollectionOnce", () => {
  it("persists canonical observations and records ingestion time", async () => {
    const store = new MemoryStore();
    const result = await runEthValueCaptureCollectionOnce({
      handlerContext: unusedHandlerContext,
      store,
      now: () => new Date("2026-08-21T00:06:00.000Z"),
      fetchSnapshot: async () => snapshot(),
    });
    expect(result.emitted_observation_ids).toHaveLength(7);
    expect(store.rows).toHaveLength(7);
    expect(store.rows.every((row) => row.ingested_at === "2026-08-21T00:06:00.000Z")).toBe(true);
  });

  it("is idempotent for an identical canonical snapshot", async () => {
    const store = new MemoryStore();
    const args = {
      handlerContext: unusedHandlerContext,
      store,
      now: () => new Date("2026-08-21T00:06:00.000Z"),
      fetchSnapshot: async () => snapshot(),
    };
    await runEthValueCaptureCollectionOnce(args);
    const second = await runEthValueCaptureCollectionOnce(args);
    expect(second.emitted_observation_ids).toEqual([]);
    expect(second.skipped_duplicate_ids).toHaveLength(7);
    expect(store.rows).toHaveLength(7);
  });
});
