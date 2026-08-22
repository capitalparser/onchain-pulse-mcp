import { describe, expect, it } from "vitest";
import type { EthCollateralDemandSnapshot } from "../../src/eth_collateral_demand/types.js";
import type { EthEcosystemCaptureSnapshot } from "../../src/eth_ecosystem_capture/types.js";
import type { EthValueCaptureSnapshot } from "../../src/eth_value_capture/types.js";
import type { LidoPooledEthBackingSnapshot } from "../../src/lido_pooled_eth_backing/types.js";
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
      l2_rent_share_of_l1_fees: { current: 0.4, previous: 0.3, delta: 0.1, unit: "ratio" },
    },
    sources: [
      "coinmetrics-community:SplyCur",
      "dune:gas.fees",
      "growthepie:rent_paid_eth",
    ],
    source_status: [],
    stale_data: [],
    confidence: 1,
    capabilities: { byok_active: [], paid_sources_active: [] },
    gaps: [],
    methodology_version: "eth-value-capture-v1",
    ...overrides,
  } as EthValueCaptureSnapshot;
}

function ecosystemCapture(
  overrides: Partial<EthEcosystemCaptureSnapshot> = {},
): EthEcosystemCaptureSnapshot {
  return {
    summary: "complete",
    window: "30d",
    cutoff_day: "2026-08-01",
    as_of: "2026-07-31T00:00:00.000Z",
    status: "complete",
    metrics: {
      l2_user_fees_usd: { current: 200, previous: 100, delta: 100, pct_change: 1, unit: "USD" },
      l2_rent_paid_usd: { current: 40, previous: 15, delta: 25, pct_change: 25 / 15, unit: "USD" },
      l2_settlement_cost_share: { current: 0.2, previous: 0.15, delta: 0.05, unit: "ratio" },
      ethereum_l1_stablecoin_supply_usd: { current: 1_000, previous: 900, delta: 100, pct_change: 1 / 9, unit: "USD" },
      ethereum_l2_stablecoin_supply_usd: { current: 500, previous: 300, delta: 200, pct_change: 2 / 3, unit: "USD" },
      ethereum_ecosystem_stablecoin_supply_usd: { current: 1_500, previous: 1_200, delta: 300, pct_change: 0.25, unit: "USD" },
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
    confidence: 1,
    gaps: [],
    methodology_version: "eth-ecosystem-capture-v1",
    ...overrides,
  };
}

function unavailableEcosystem(): EthEcosystemCaptureSnapshot {
  const emptyUsd = { current: null, previous: null, delta: null, pct_change: null, unit: "USD" as const };
  const emptyRatio = { current: null, previous: null, delta: null, unit: "ratio" as const };
  return ecosystemCapture({
    status: "unavailable",
    metrics: {
      l2_user_fees_usd: emptyUsd,
      l2_rent_paid_usd: emptyUsd,
      l2_settlement_cost_share: emptyRatio,
      ethereum_l1_stablecoin_supply_usd: emptyUsd,
      ethereum_l2_stablecoin_supply_usd: emptyUsd,
      ethereum_ecosystem_stablecoin_supply_usd: emptyUsd,
    },
    coverage: {
      included_l2_count: 0,
      included_l2_origins: [],
      excluded_external_da_origins: [],
    },
    sources: [],
    confidence: 0,
    gaps: [{ code: "source_access_gap", detail: "offline" }],
  });
}

function aave(status: "verified" | "unavailable" = "verified"): EthCollateralDemandSnapshot {
  return {
    status,
    summary: "aave",
    methodology: "eth-collateral-demand-aave-v3-v1",
    verified_block: null,
    metrics: {
      eth_family_supplied: status === "verified"
        ? { wei_floor: "1000000000000000000", eth_floor: "1", remainder: "0", denominator: "1" }
        : null,
      collateral_eligible_supplied: null,
      actual_user_collateral: null,
      net_eth_locked: null,
      gross_eth_collateral: null,
      rehypothecation_ratio: null,
    },
    assets: [],
    identities: null,
    coverage: {
      aave_v3_ethereum_core_complete: status === "verified",
      user_collateral_usage_complete: false,
      net_eth_locked_complete: false,
      gross_collateral_complete: false,
      rehypothecation_complete: false,
    },
    sources: status === "verified" ? ["ethereum_rpc"] : [],
    source_status: [],
    gaps: [],
    capabilities: { ethereum_rpc_active: status === "verified" },
  } as EthCollateralDemandSnapshot;
}

function lido(status: "verified" | "unavailable" = "verified"): LidoPooledEthBackingSnapshot {
  return {
    status,
    summary: "lido",
    methodology: "lido-pooled-eth-backing-v1",
    verified_block: null,
    accounting: null,
    metrics: { total_pooled_eth_wei: status === "verified" ? "1000000000000000000" : null },
    identities: null,
    coverage: { lido_v4_mainnet_accounting_complete: status === "verified" },
    sources: status === "verified" ? ["ethereum_rpc"] : [],
    source_status: [],
    gaps: [],
    capabilities: { ethereum_rpc_active: status === "verified" },
  } as unknown as LidoPooledEthBackingSnapshot;
}

function run(args: {
  valueCapture?: EthValueCaptureSnapshot;
  ecosystemCapture?: EthEcosystemCaptureSnapshot;
  aave?: EthCollateralDemandSnapshot;
  lido?: LidoPooledEthBackingSnapshot;
} = {}) {
  return getEthDemandCompass({
    valueCapture: args.valueCapture ?? valueCapture(),
    ecosystemCapture: args.ecosystemCapture ?? ecosystemCapture(),
    aave: args.aave ?? aave(),
    lido: args.lido ?? lido(),
    now: new Date("2026-08-01T01:00:00Z"),
  });
}

describe("getEthDemandCompass", () => {
  it("separates ecosystem expansion from ETH capture and withholds structural status without collateral confirmation", () => {
    const result = run();

    expect(result.ecosystem_state).toBe("expanding");
    expect(result.eth_capture_state).toBe("strengthening");
    expect(result.classification).toBe("growth_with_capture");
    expect(result.capture_tier).toBe("fee_and_supply");
    expect(result.judgment).toBe("flow-driven");
    expect(result.axes.ecosystem_activity).toMatchObject({ status: "improving", score: 1 });
    expect(result.axes.settlement_capture).toMatchObject({ status: "improving", score: 1 });
    expect(result.axes.collateral_demand).toMatchObject({ status: "unknown", score: null });
    expect(result.gaps.map((gap) => gap.code)).toContain("collateral_confirmation_missing");
    expect(EthDemandCompassSnapshotSchema.parse(result)).toEqual(result);
  });

  it("identifies ecosystem growth without matching ETH capture", () => {
    const base = valueCapture();
    const weakValue = valueCapture({
      metrics: {
        ...base.metrics,
        gross_l1_fees_eth: { current: 5, previous: 10, delta: -5, pct_change: -0.5, unit: "ETH" },
        total_burn_eth: { current: 4, previous: 8, delta: -4, pct_change: -0.5, unit: "ETH" },
        blob_fee_burn_eth: { current: 1, previous: 2, delta: -1, pct_change: -0.5, unit: "ETH" },
        l2_rent_paid_eth: { current: 2, previous: 4, delta: -2, pct_change: -0.5, unit: "ETH" },
        l2_blob_fee_eth: { current: 1, previous: 2, delta: -1, pct_change: -0.5, unit: "ETH" },
        net_issuance_eth: { current: 6, previous: 3, delta: 3, pct_change: 1, unit: "ETH" },
      },
      ratios: {
        ...base.ratios,
        l2_rent_share_of_l1_fees: { current: 0.2, previous: 0.4, delta: -0.2, unit: "ratio" },
      },
    });
    const ecosystem = ecosystemCapture();
    const weakSettlement = ecosystemCapture({
      metrics: {
        ...ecosystem.metrics,
        l2_rent_paid_usd: { current: 10, previous: 20, delta: -10, pct_change: -0.5, unit: "USD" },
        l2_settlement_cost_share: { current: 0.05, previous: 0.2, delta: -0.15, unit: "ratio" },
      },
    });
    const result = run({ valueCapture: weakValue, ecosystemCapture: weakSettlement });

    expect(result.ecosystem_state).toBe("expanding");
    expect(result.eth_capture_state).toBe("weakening");
    expect(result.classification).toBe("growth_without_capture");
    expect(result.judgment).toBe("flow-driven");
    expect(result.gaps.map((gap) => gap.code)).toContain("ecosystem_growth_without_capture");
  });

  it("keeps absent sources unknown with explicit gaps and refuses a composite", () => {
    const complete = valueCapture();
    const unavailableValue = valueCapture({
      status: "unavailable",
      metrics: Object.fromEntries(Object.entries(complete.metrics).map(([key, metric]) => [
        key,
        { ...metric, current: null, previous: null, delta: null, pct_change: null },
      ])),
      ratios: Object.fromEntries(Object.entries(complete.ratios).map(([key, metric]) => [
        key,
        { ...metric, current: null, previous: null, delta: null },
      ])),
    });
    const result = run({
      valueCapture: unavailableValue,
      ecosystemCapture: unavailableEcosystem(),
      aave: aave("unavailable"),
      lido: lido("unavailable"),
    });

    expect(result.judgment).toBe("data-warning");
    expect(result.classification).toBe("data_warning");
    expect(Object.values(result.axes).every((axis) => axis.status === "unknown" && axis.score === null)).toBe(true);
    expect(result.gaps.map((gap) => gap.code)).toEqual(expect.arrayContaining([
      "ecosystem_metrics_missing",
      "usage_metrics_missing",
      "l2_metrics_missing",
      "settlement_capture_missing",
      "net_issuance_missing",
      "collateral_sources_missing",
      "stablecoin_delta_missing",
      "insufficient_trend_coverage",
    ]));
    expect(result.confidence).toBe(0);
  });

  it("reports collateral observations without inventing an actual-collateral trend", () => {
    const result = run();

    expect(result.axes.collateral_demand).toMatchObject({ status: "unknown", score: null });
    expect(result.axes.collateral_demand.evidence.join(" ")).toMatch(/actual collateral|prior comparable/i);
    expect(result.gaps.map((gap) => gap.code)).toContain("collateral_trend_not_available");
  });

  it("does not form a top-level classification from an incomplete L2 feature set", () => {
    const complete = valueCapture();
    const result = run({
      valueCapture: valueCapture({
        metrics: {
          ...complete.metrics,
          l2_blob_fee_eth: {
            ...complete.metrics.l2_blob_fee_eth,
            current: null,
            previous: null,
            delta: null,
            pct_change: null,
          },
        },
      }),
    });

    expect(result.axes.l2_settlement).toMatchObject({ status: "unknown", score: null });
    expect(result.classification).toBe("data_warning");
    expect(result.judgment).toBe("data-warning");
  });

  it("fails closed when either source snapshot is partial even if values are present", () => {
    const result = run({
      valueCapture: valueCapture({
        status: "partial",
        gaps: [{ code: "partial_result", detail: "rent delayed" }],
      }),
      ecosystemCapture: ecosystemCapture({
        status: "partial",
        gaps: [{ code: "partial_result", detail: "stablecoin delayed" }],
      }),
    });

    expect(result.classification).toBe("data_warning");
    expect(result.axes.ecosystem_activity).toMatchObject({ status: "unknown", score: null });
    expect(result.axes.usage_demand).toMatchObject({ status: "unknown", score: null });
    expect(result.axes.settlement_capture).toMatchObject({ status: "unknown", score: null });
  });

  it("rejects unbounded evidence, unknown fields, and unsupported structural promotion", () => {
    const result = run();
    expect(() => EthDemandCompassSnapshotSchema.parse({ ...result, unexpected: true })).toThrow();
    expect(() => EthDemandCompassSnapshotSchema.parse({ ...result, evidence: ["a", "b", "c", "d", "e"] })).toThrow();
    expect(() => EthDemandCompassSnapshotSchema.parse({
      ...result,
      judgment: "structural",
    })).toThrow(/collateral-and-reserve/);
    expect(() => EthDemandCompassSnapshotSchema.parse({
      ...result,
      axes: {
        ...result.axes,
        usage_demand: { ...result.axes.usage_demand, status: "improving", score: -1 },
      },
    })).toThrow();
  });
});
