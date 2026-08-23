import { describe, expect, it } from "vitest";
import type { EthDemandCompassSnapshot } from "../../src/eth_demand_compass/types.js";
import type { EthEcosystemCaptureSnapshot } from "../../src/eth_ecosystem_capture/types.js";
import type { EthValueCaptureSnapshot } from "../../src/eth_value_capture/types.js";
import {
  EthFrontendOverviewSnapshotSchema,
  buildEthFrontendOverview,
} from "../../src/frontend_contract/eth_overview.js";

function ethMetric(current: number | null, previous: number | null) {
  return {
    current,
    previous,
    delta: current === null || previous === null ? null : current - previous,
    pct_change: current === null || previous === null || previous === 0
      ? null
      : (current - previous) / previous,
    unit: "ETH" as const,
  };
}

function usdMetric(current: number | null, previous: number | null) {
  return {
    current,
    previous,
    delta: current === null || previous === null ? null : current - previous,
    pct_change: current === null || previous === null || previous === 0
      ? null
      : (current - previous) / previous,
    unit: "USD" as const,
  };
}

function ratioMetric(current: number | null, previous: number | null) {
  return {
    current,
    previous,
    delta: current === null || previous === null ? null : current - previous,
    unit: "ratio" as const,
  };
}

function valueCapture(overrides: Partial<EthValueCaptureSnapshot> = {}): EthValueCaptureSnapshot {
  return {
    summary: "Protocol fee and supply evidence is complete.",
    window: "30d",
    cutoff_day: "2026-08-22",
    as_of: "2026-08-22T01:00:00.000Z",
    status: "complete",
    metrics: {
      gross_l1_fees_eth: ethMetric(100, 90),
      base_fee_burn_eth: ethMetric(60, 50),
      blob_fee_burn_eth: ethMetric(10, 8),
      priority_fee_eth: ethMetric(30, 32),
      total_burn_eth: ethMetric(70, 58),
      consensus_issuance_eth: ethMetric(50, 55),
      net_issuance_eth: ethMetric(-20, -3),
      l2_rent_paid_eth: ethMetric(15, 12),
      l2_calldata_fee_eth: ethMetric(4, 5),
      l2_blob_fee_eth: ethMetric(8, 5),
      l2_verification_fee_eth: ethMetric(3, 2),
    },
    ratios: {
      blob_share_of_total_burn: ratioMetric(10 / 70, 8 / 58),
      l2_rent_share_of_l1_fees: ratioMetric(0.15, 12 / 90),
    },
    sources: ["coinmetrics-community:SplyCur", "growthepie:rent_paid_eth"],
    source_status: [
      {
        source: "coinmetrics-community:SplyCur",
        role: "ETH supply boundary",
        as_of: "2026-08-22T00:00:00.000Z",
        stale: false,
      },
      {
        source: "growthepie",
        role: "L2 rent paid to Ethereum",
        as_of: "2026-08-22T00:00:00.000Z",
        stale: false,
      },
    ],
    stale_data: [],
    confidence: 1,
    capabilities: { byok_active: [], paid_sources_active: [] },
    gaps: [],
    methodology_version: "eth-value-capture-v1",
    ...overrides,
  };
}

function ecosystemCapture(
  overrides: Partial<EthEcosystemCaptureSnapshot> = {},
): EthEcosystemCaptureSnapshot {
  return {
    summary: "Ethereum ecosystem and settlement evidence is complete.",
    window: "30d",
    cutoff_day: "2026-08-22",
    as_of: "2026-08-22T01:05:00.000Z",
    status: "complete",
    metrics: {
      l2_user_fees_usd: usdMetric(120_000_000, 100_000_000),
      l2_rent_paid_usd: usdMetric(12_000_000, 9_000_000),
      l2_settlement_cost_share: ratioMetric(0.1, 0.09),
      ethereum_l1_stablecoin_supply_usd: usdMetric(90_000_000_000, 88_000_000_000),
      ethereum_l2_stablecoin_supply_usd: usdMetric(20_000_000_000, 18_000_000_000),
      ethereum_ecosystem_stablecoin_supply_usd: usdMetric(110_000_000_000, 106_000_000_000),
    },
    coverage: {
      included_l2_count: 2,
      included_l2_origins: ["arbitrum", "base"],
      excluded_external_da_origins: ["external-da-example"],
    },
    sources: [
      "growthepie:fees_paid_usd",
      "growthepie:rent_paid_usd",
      "growthepie:stables_mcap",
    ],
    source_status: [
      {
        source: "growthepie:master",
        role: "chain scope metadata",
        as_of: "2026-08-22T00:00:00.000Z",
        stale: false,
      },
      {
        source: "growthepie:fees_paid_usd",
        role: "L2 user fees",
        as_of: "2026-08-22T00:00:00.000Z",
        stale: false,
      },
      {
        source: "growthepie:rent_paid_usd",
        role: "L2 rent paid to Ethereum",
        as_of: "2026-08-22T00:00:00.000Z",
        stale: false,
      },
      {
        source: "growthepie:stables_mcap",
        role: "Ethereum ecosystem stablecoin supply",
        as_of: "2026-08-22T00:00:00.000Z",
        stale: false,
      },
    ],
    stale_data: [],
    confidence: 1,
    gaps: [],
    methodology_version: "eth-ecosystem-capture-v1",
    ...overrides,
  };
}

function axis(status: "improving" | "weakening" | "neutral" | "unknown") {
  return {
    status,
    score: status === "improving" ? 1 : status === "weakening" ? -1 : status === "neutral" ? 0 : null,
    evidence: [`${status} evidence.`],
    sources: ["derived:test"],
    confidence: status === "unknown" ? 0 : 1,
  };
}

function compass(overrides: Partial<EthDemandCompassSnapshot> = {}): EthDemandCompassSnapshot {
  return {
    summary: "Ethereum ecosystem growth is accompanied by improving fee and settlement capture.",
    as_of: "2026-08-22T01:10:00.000Z",
    window: "30d",
    judgment: "flow-driven",
    ecosystem_state: "expanding",
    eth_capture_state: "strengthening",
    classification: "growth_with_capture",
    capture_tier: "fee_and_supply",
    axes: {
      ecosystem_activity: axis("improving"),
      usage_demand: axis("improving"),
      l2_settlement: axis("improving"),
      settlement_capture: axis("improving"),
      supply_absorption: axis("improving"),
      collateral_demand: axis("unknown"),
      monetary_settlement: axis("improving"),
    },
    evidence: [
      "L2 user fees increased.",
      "Rent paid to Ethereum increased.",
      "Collateral demand remains unconfirmed.",
    ],
    sources: ["growthepie", "coinmetrics-community:SplyCur"],
    confidence: 0.85,
    gaps: [],
    methodology_version: "eth-demand-compass-v2",
    ...overrides,
  } as EthDemandCompassSnapshot;
}

describe("buildEthFrontendOverview", () => {
  it("projects a compact ready-state contract for the analytical web console", () => {
    const result = buildEthFrontendOverview({
      valueCapture: valueCapture(),
      ecosystemCapture: ecosystemCapture(),
      compass: compass(),
      generatedAt: new Date("2026-08-22T01:11:00.000Z"),
    });

    expect(result.status).toBe("ready");
    expect(result.decision).toMatchObject({
      ecosystem_state: "expanding",
      eth_capture_state: "strengthening",
      classification: "growth_with_capture",
      capture_tier: "fee_and_supply",
    });
    expect(result.hero_metrics.l2_settlement_cost_share.current).toBe(0.1);
    expect(result.coverage.included_l2_origins).toEqual(["arbitrum", "base"]);
    expect(result.data_quality.aligned_cutoff).toBe(true);
    expect(result.data_quality.source_count).toBe(result.data_quality.sources.length);
    expect(EthFrontendOverviewSnapshotSchema.parse(result)).toEqual(result);
    expect(JSON.stringify(result)).not.toMatch(/byok|paid_sources|credential/i);
  });

  it("downgrades the front contract to partial when analytical cutoffs do not align", () => {
    const result = buildEthFrontendOverview({
      valueCapture: valueCapture(),
      ecosystemCapture: ecosystemCapture({ cutoff_day: "2026-08-21" }),
      compass: compass(),
      generatedAt: new Date("2026-08-22T01:11:00.000Z"),
    });

    expect(result.status).toBe("partial");
    expect(result.cutoff_day).toBeNull();
    expect(result.data_quality.aligned_cutoff).toBe(false);
  });

  it("rejects legacy V1 compass snapshots because the new front requires explicit ecosystem and capture states", () => {
    const legacyCompass: EthDemandCompassSnapshot = {
      summary: "Legacy compass",
      as_of: "2026-08-22T01:10:00.000Z",
      window: "30d",
      judgment: "neutral",
      axes: {
        usage_demand: axis("neutral"),
        l2_settlement: axis("neutral"),
        supply_absorption: axis("neutral"),
        collateral_demand: axis("unknown"),
        monetary_settlement: axis("neutral"),
      },
      evidence: [],
      sources: [],
      confidence: 0.5,
      gaps: [],
      methodology_version: "eth-demand-compass-v1",
    };

    expect(() => buildEthFrontendOverview({
      valueCapture: valueCapture(),
      ecosystemCapture: ecosystemCapture(),
      compass: legacyCompass,
      generatedAt: new Date("2026-08-22T01:11:00.000Z"),
    })).toThrow();
  });

  it("rejects generation timestamps that predate source availability", () => {
    expect(() => buildEthFrontendOverview({
      valueCapture: valueCapture(),
      ecosystemCapture: ecosystemCapture(),
      compass: compass(),
      generatedAt: new Date("2026-08-22T01:09:00.000Z"),
    })).toThrow(/generatedAt/);
  });
});
