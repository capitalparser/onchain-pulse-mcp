import { describe, expect, it } from "vitest";
import type { EthEcosystemCaptureSnapshot } from "../../src/eth_ecosystem_capture/types.js";
import type { EthValueCaptureSnapshot } from "../../src/eth_value_capture/types.js";
import { runEthIntelligenceCollectionOnce } from "../../src/intelligence_core/collection_run.js";
import type { MetricObservationStore } from "../../src/intelligence_core/store.js";
import type { MetricObservation } from "../../src/intelligence_core/types.js";
import type { HandlerContext } from "../../src/server.js";

class MemoryStore implements MetricObservationStore {
  rows: MetricObservation[] = [];
  async append(observation: MetricObservation): Promise<void> { this.rows.push(observation); }
  async readAll(): Promise<MetricObservation[]> { return [...this.rows]; }
  async query(): Promise<MetricObservation[]> { return [...this.rows]; }
}

function ethMetric(current: number | null) {
  return { current, previous: null, delta: null, pct_change: null, unit: "ETH" as const };
}

function usdMetric(current: number | null) {
  return { current, previous: null, delta: null, pct_change: null, unit: "USD" as const };
}

function ratioMetric(current: number | null) {
  return { current, previous: null, delta: null, unit: "ratio" as const };
}

function valueSnapshot(): EthValueCaptureSnapshot {
  return {
    summary: "test",
    window: "30d",
    cutoff_day: "2026-08-20",
    as_of: "2026-08-21T00:05:00.000Z",
    status: "complete",
    metrics: {
      gross_l1_fees_eth: ethMetric(100),
      base_fee_burn_eth: ethMetric(60),
      blob_fee_burn_eth: ethMetric(10),
      priority_fee_eth: ethMetric(30),
      total_burn_eth: ethMetric(70),
      consensus_issuance_eth: ethMetric(50),
      net_issuance_eth: ethMetric(-20),
      l2_rent_paid_eth: ethMetric(15),
      l2_calldata_fee_eth: ethMetric(4),
      l2_blob_fee_eth: ethMetric(8),
      l2_verification_fee_eth: ethMetric(3),
    },
    ratios: {
      blob_share_of_total_burn: ratioMetric(0.14),
      l2_rent_share_of_l1_fees: ratioMetric(0.15),
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

function ecosystemSnapshot(): EthEcosystemCaptureSnapshot {
  return {
    summary: "test",
    window: "30d",
    cutoff_day: "2026-08-20",
    as_of: "2026-08-21T00:05:00.000Z",
    status: "complete",
    metrics: {
      l2_user_fees_usd: usdMetric(30_000_000),
      l2_rent_paid_usd: usdMetric(4_000_000),
      l2_settlement_cost_share: ratioMetric(4 / 30),
      ethereum_l1_stablecoin_supply_usd: usdMetric(90_000_000_000),
      ethereum_l2_stablecoin_supply_usd: usdMetric(20_000_000_000),
      ethereum_ecosystem_stablecoin_supply_usd: usdMetric(110_000_000_000),
    },
    coverage: {
      included_l2_count: 3,
      included_l2_origins: ["arbitrum", "base", "optimism"],
      excluded_external_da_origins: [],
    },
    sources: ["growthepie:fees_paid_usd", "growthepie:rent_paid_usd", "growthepie:stables_mcap"],
    source_status: [],
    stale_data: [],
    confidence: 0.85,
    gaps: [],
    methodology_version: "eth-ecosystem-capture-v1",
  };
}

const unusedHandlerContext = {} as HandlerContext;

describe("runEthIntelligenceCollectionOnce", () => {
  it("persists both protocol and ecosystem observations in one idempotent run", async () => {
    const store = new MemoryStore();
    const args = {
      handlerContext: unusedHandlerContext,
      store,
      now: () => new Date("2026-08-21T00:06:00.000Z"),
      fetchValueCaptureSnapshot: async () => valueSnapshot(),
      fetchEcosystemCaptureSnapshot: async () => ecosystemSnapshot(),
    };
    const first = await runEthIntelligenceCollectionOnce(args);
    expect(first.status).toBe("complete");
    expect(first.emitted_observation_ids).toHaveLength(13);
    expect(store.rows).toHaveLength(13);
    expect(store.rows.some((row) => row.metric_key === "eth.l2_settlement_cost_share")).toBe(true);
    expect(store.rows.some((row) => row.metric_key === "eth.total_burn_eth")).toBe(true);

    const second = await runEthIntelligenceCollectionOnce(args);
    expect(second.status).toBe("complete");
    expect(second.emitted_observation_ids).toEqual([]);
    expect(second.skipped_duplicate_ids).toHaveLength(13);
    expect(store.rows).toHaveLength(13);
  });

  it("keeps the successful source when the other source fails", async () => {
    const store = new MemoryStore();
    const result = await runEthIntelligenceCollectionOnce({
      handlerContext: unusedHandlerContext,
      store,
      now: () => new Date("2026-08-21T00:06:00.000Z"),
      fetchValueCaptureSnapshot: async () => valueSnapshot(),
      fetchEcosystemCaptureSnapshot: async () => {
        throw new Error("provider unavailable");
      },
    });

    expect(result.status).toBe("partial");
    expect(result.sources.value_capture.status).toBe("collected");
    expect(result.sources.ecosystem_capture.status).toBe("failed");
    expect(result.emitted_observation_ids).toHaveLength(7);
    expect(result.gaps).toContain("ecosystem_capture:collection_failed");
    expect(store.rows).toHaveLength(7);
  });
});
