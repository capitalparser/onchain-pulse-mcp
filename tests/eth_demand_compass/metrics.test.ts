import { describe, expect, it } from "vitest";
import type { EthCollateralDemandSnapshot } from "../../src/eth_collateral_demand/types.js";
import type { EthValueCaptureSnapshot } from "../../src/eth_value_capture/types.js";
import type { LidoPooledEthBackingSnapshot } from "../../src/lido_pooled_eth_backing/types.js";
import type { ToolResponse } from "../../src/types.js";
import { EthDemandCompassSnapshotSchema } from "../../src/eth_demand_compass/types.js";
import { getEthDemandCompass } from "../../src/tools/get_eth_demand_compass.js";

function valueCapture(overrides: Record<string, unknown> = {}): EthValueCaptureSnapshot {
  return {
    summary: "complete",
    window: "30d",
    cutoff_day: "2026-08-01",
    as_of: "2026-08-01T00:00:00.000Z",
    status: "complete",
    metrics: {
      gross_l1_fees_eth: { current: 20, previous: 10, delta: 10, pct_change: 1, unit: "ETH" },
      base_fee_burn_eth: { current: 12, previous: 6, delta: 6, pct_change: 1, unit: "ETH" },
      blob_fee_burn_eth: { current: 4, previous: 2, delta: 2, pct_change: 1, unit: "ETH" },
      priority_fee_eth: { current: 4, previous: 2, delta: 2, pct_change: 1, unit: "ETH" },
      total_burn_eth: { current: 16, previous: 8, delta: 8, pct_change: 1, unit: "ETH" },
      consensus_issuance_eth: { current: 10, previous: 11, delta: -1, pct_change: null, unit: "ETH" },
      net_issuance_eth: { current: -6, previous: 3, delta: -9, pct_change: null, unit: "ETH" },
      l2_rent_paid_eth: { current: 8, previous: 4, delta: 4, pct_change: 1, unit: "ETH" },
      l2_calldata_fee_eth: { current: 2, previous: 1, delta: 1, pct_change: 1, unit: "ETH" },
      l2_blob_fee_eth: { current: 4, previous: 2, delta: 2, pct_change: 1, unit: "ETH" },
      l2_verification_fee_eth: { current: 2, previous: 1, delta: 1, pct_change: 1, unit: "ETH" },
    },
    ratios: {
      blob_share_of_total_burn: { current: 0.25, previous: 0.25, delta: 0, unit: "ratio" },
      l2_rent_share_of_l1_fees: { current: 0.4, previous: 0.4, delta: 0, unit: "ratio" },
    },
    sources: ["coinmetrics-community:SplyCur", "growthepie:rent_paid_eth"],
    source_status: [],
    stale_data: [],
    confidence: 1,
    capabilities: { byok_active: [], paid_sources_active: [] },
    gaps: [],
    methodology_version: "eth-value-capture-v1",
    ...overrides,
  } as EthValueCaptureSnapshot;
}

function stablecoin(delta: number | null = 0.03): ToolResponse {
  return {
    summary: "stablecoin",
    score: null,
    reading: "unknown",
    as_of: "2026-08-01T00:00:00.000Z",
    inputs: delta === null ? {} : { stablecoin_7d_delta_pct: delta },
    sources: ["defillama-stablecoins"],
    stale_data: [],
    confidence: 1,
    capabilities: { byok_active: [] },
  };
}

function aave(status: "verified" | "unavailable" = "verified"): EthCollateralDemandSnapshot {
  return {
    status,
    summary: "aave",
    methodology: "eth-collateral-demand-aave-v3-v1",
    verified_block: null,
    metrics: { eth_family_supplied: status === "verified" ? { wei_floor: "1000000000000000000", eth_floor: "1", remainder: "0", denominator: "1" } : null, collateral_eligible_supplied: null, actual_user_collateral: null, net_eth_locked: null, gross_eth_collateral: null, rehypothecation_ratio: null },
    assets: [], identities: null,
    coverage: { aave_v3_ethereum_core_complete: status === "verified", user_collateral_usage_complete: false, net_eth_locked_complete: false, gross_collateral_complete: false, rehypothecation_complete: false },
    sources: status === "verified" ? ["ethereum_rpc"] : [], source_status: [],
    gaps: [], capabilities: { ethereum_rpc_active: status === "verified" },
  } as EthCollateralDemandSnapshot;
}

function lido(status: "verified" | "unavailable" = "verified"): LidoPooledEthBackingSnapshot {
  return {
    status,
    summary: "lido",
    methodology: "lido-pooled-eth-backing-v1",
    verified_block: null, accounting: null,
    metrics: { total_pooled_eth_wei: status === "verified" ? "1000000000000000000" : null },
    identities: null,
    coverage: { lido_v4_mainnet_accounting_complete: status === "verified" },
    sources: status === "verified" ? ["ethereum_rpc"] : [], source_status: [], gaps: [], capabilities: { ethereum_rpc_active: status === "verified" },
  } as unknown as LidoPooledEthBackingSnapshot;
}

describe("getEthDemandCompass", () => {
  it("returns a structural judgment only when the three core trend axes improve", () => {
    const result = getEthDemandCompass({ valueCapture: valueCapture(), stablecoin: stablecoin(), aave: aave(), lido: lido(), now: new Date("2026-08-01T01:00:00Z") });

    expect(result.judgment).toBe("structural");
    expect(result.axes.usage_demand).toMatchObject({ status: "improving", score: 1 });
    expect(result.axes.l2_settlement).toMatchObject({ status: "improving", score: 1 });
    expect(result.axes.supply_absorption).toMatchObject({ status: "improving", score: 1 });
    expect(result.axes.collateral_demand).toMatchObject({ status: "unknown", score: null });
    expect(result.axes.monetary_settlement).toMatchObject({ status: "improving", score: 1 });
    expect(result.evidence).toHaveLength(3);
    expect(EthDemandCompassSnapshotSchema.parse(result)).toEqual(result);
  });

  it("keeps absent sources unknown with explicit gaps and refuses a composite", () => {
    const unavailable = valueCapture({ status: "unavailable", metrics: Object.fromEntries(Object.entries(valueCapture().metrics).map(([key, metric]) => [key, { ...metric, current: null, previous: null, delta: null, pct_change: null }])), ratios: Object.fromEntries(Object.entries(valueCapture().ratios).map(([key, metric]) => [key, { ...metric, current: null, previous: null, delta: null }])) });
    const result = getEthDemandCompass({ valueCapture: unavailable, stablecoin: stablecoin(null), aave: aave("unavailable"), lido: lido("unavailable"), now: new Date("2026-08-01T01:00:00Z") });

    expect(result.judgment).toBe("data-warning");
    expect(Object.values(result.axes).every((axis) => axis.status === "unknown" && axis.score === null)).toBe(true);
    expect(result.gaps.map((gap) => gap.code)).toEqual(expect.arrayContaining(["usage_metrics_missing", "l2_metrics_missing", "net_issuance_missing", "collateral_sources_missing", "stablecoin_delta_missing", "insufficient_trend_coverage"]));
    expect(result.confidence).toBe(0);
  });

  it("reports collateral observations without inventing a trend", () => {
    const result = getEthDemandCompass({ valueCapture: valueCapture({ metrics: { ...valueCapture().metrics, gross_l1_fees_eth: { ...valueCapture().metrics.gross_l1_fees_eth, current: null, previous: null } } }), stablecoin: stablecoin(null), aave: aave(), lido: lido(), now: new Date("2026-08-01T01:00:00Z") });

    expect(result.axes.collateral_demand).toMatchObject({ status: "unknown", score: null });
    expect(result.axes.collateral_demand.evidence.join(" ")).toMatch(/point-in-time/i);
    expect(result.gaps.map((gap) => gap.code)).toContain("collateral_trend_not_available");
  });

  it("does not form a top-level composite from an incomplete L2 feature set", () => {
    const complete = valueCapture();
    const result = getEthDemandCompass({
      valueCapture: valueCapture({
        metrics: {
          ...complete.metrics,
          l2_blob_fee_eth: { ...complete.metrics.l2_blob_fee_eth, current: null, previous: null, delta: null, pct_change: null },
        },
      }),
      stablecoin: stablecoin(),
      aave: aave(),
      lido: lido(),
      now: new Date("2026-08-01T01:00:00Z"),
    });

    expect(result.axes.l2_settlement).toMatchObject({ status: "unknown", score: null });
    expect(result.judgment).toBe("data-warning");
  });

  it("rejects unbounded evidence and unknown schema fields", () => {
    const result = getEthDemandCompass({ valueCapture: valueCapture(), stablecoin: stablecoin(), aave: aave(), lido: lido(), now: new Date("2026-08-01T01:00:00Z") });
    expect(() => EthDemandCompassSnapshotSchema.parse({ ...result, unexpected: true })).toThrow();
    expect(() => EthDemandCompassSnapshotSchema.parse({ ...result, evidence: ["a", "b", "c", "d"] })).toThrow();
  });
});
