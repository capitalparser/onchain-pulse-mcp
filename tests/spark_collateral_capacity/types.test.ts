import { describe, expect, it } from "vitest";
import { SparkCollateralCapacitySnapshotSchema } from "../../src/spark_collateral_capacity/types.js";

const exact = { wei_floor: "1", eth_floor: "0.000000000000000001", remainder: "0", denominator: "1" };
const aggregate = { wei_floor: "6", eth_floor: "0.000000000000000006", remainder: "0", denominator: "1" };
const permanentGaps = [
  "aave_spark_overlap_not_reconciled",
  "actual_user_collateral_not_indexed",
  "net_eth_locked_not_reconciled",
  "gross_collateral_not_reconciled",
  "rehypothecation_not_reconciled",
].map((code) => ({ code, detail: code }));
const assets = [
  ["WETH", "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"],
  ["wstETH", "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0"],
  ["rETH", "0xae78736Cd615f374D3085123A210448E74Fc6393"],
  ["weETH", "0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee"],
  ["rsETH", "0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7"],
  ["ezETH", "0xbf5495Efe5DB9ce00f80364C8B423567e58d2110"],
].map(([symbol, underlying]) => ({
  symbol, underlying, decimals: 18, active: true, collateral_enabled: true,
  supplied_raw: "1", oracle_price: "1", eth_equivalent: exact,
}));

function verified() {
  return {
    status: "verified", summary: "verified", methodology: "spark-eth-collateral-capacity-v1",
    verified_block: { number: 1, hash: `0x${"a".repeat(64)}`, timestamp: 1 },
    metrics: {
      spark_eth_family_supplied: aggregate, spark_collateral_eligible_supplied: aggregate,
      combined_aave_spark_supplied: null, actual_user_collateral: null, net_eth_locked: null,
      gross_eth_collateral: null, rehypothecation_ratio: null,
    },
    assets, identities: { supplied_equals_asset_sum: true, eligible_equals_enabled_asset_sum: true },
    coverage: {
      spark_lend_ethereum_complete: true, aave_spark_overlap_reconciled: false,
      user_collateral_usage_complete: false, net_eth_locked_complete: false,
      gross_collateral_complete: false, rehypothecation_complete: false,
    },
    sources: ["ethereum_rpc"],
    source_status: [{ source: "ethereum_rpc", role: "spark_lend_finalized_reserve_evidence", stale: false }],
    gaps: permanentGaps, capabilities: { ethereum_rpc_active: true },
  };
}

function unavailable(code: "rpc_not_configured" | "rpc_access_gap" = "rpc_access_gap") {
  const configured = code !== "rpc_not_configured";
  return {
    status: "unavailable", summary: "unavailable", methodology: "spark-eth-collateral-capacity-v1",
    verified_block: null,
    metrics: {
      spark_eth_family_supplied: null, spark_collateral_eligible_supplied: null,
      combined_aave_spark_supplied: null, actual_user_collateral: null, net_eth_locked: null,
      gross_eth_collateral: null, rehypothecation_ratio: null,
    },
    assets: [], identities: null,
    coverage: {
      spark_lend_ethereum_complete: false, aave_spark_overlap_reconciled: false,
      user_collateral_usage_complete: false, net_eth_locked_complete: false,
      gross_collateral_complete: false, rehypothecation_complete: false,
    },
    sources: configured ? ["ethereum_rpc"] : [],
    source_status: configured ? [{ source: "ethereum_rpc", role: "spark_lend_finalized_reserve_evidence", stale: false }] : [],
    gaps: [{ code, detail: code }], capabilities: { ethereum_rpc_active: false },
  };
}

describe("SparkCollateralCapacitySnapshotSchema", () => {
  it("accepts the strict complete six-asset verified fixture", () => {
    expect(SparkCollateralCapacitySnapshotSchema.safeParse(verified()).success).toBe(true);
  });

  it.each([
    ["a fabricated aggregate", (value: ReturnType<typeof verified>) => { value.metrics.spark_eth_family_supplied = { ...exact, wei_floor: "2", eth_floor: "0.000000000000000002" }; }],
    ["a missing permanent overlap gap", (value: ReturnType<typeof verified>) => { value.gaps = value.gaps.slice(1); }],
    ["non-null cross-protocol capacity", (value: ReturnType<typeof verified>) => { (value.metrics as { combined_aave_spark_supplied: unknown }).combined_aave_spark_supplied = exact; }],
    ["partial asset coverage", (value: ReturnType<typeof verified>) => { value.assets = value.assets.slice(1); }],
    ["mismatched provenance", (value: ReturnType<typeof verified>) => { value.source_status = []; }],
    ["an unmarked stale source", (value: ReturnType<typeof verified>) => { value.source_status[0]!.stale = true; }],
    ["a duplicate permanent gap", (value: ReturnType<typeof verified>) => { value.gaps.push({ ...value.gaps[0]! }); }],
    ["an arbitrary verified gap", (value: ReturnType<typeof verified>) => { value.gaps.push({ code: "rpc_access_gap", detail: "not verified" }); }],
  ])("rejects %s", (_name, mutate) => {
    const value = verified();
    mutate(value);
    expect(SparkCollateralCapacitySnapshotSchema.safeParse(value).success).toBe(false);
  });

  it.each([
    ["rpc_not_configured provenance", (() => { const value = unavailable("rpc_not_configured"); value.sources = ["ethereum_rpc"]; value.source_status = [{ source: "ethereum_rpc", role: "role", stale: false }]; return value; })()],
    ["configured failure without provenance", (() => { const value = unavailable(); value.sources = []; value.source_status = []; return value; })()],
    ["mismatched unavailable source sets", (() => { const value = unavailable(); value.source_status = []; return value; })()],
    ["a stale unavailable source", (() => { const value = unavailable(); value.source_status[0]!.stale = true; return value; })()],
    ["source_stale unavailable gap", (() => { const value = unavailable(); (value.gaps as Array<{ code: string; detail: string }>).push({ code: "source_stale", detail: "bad" }); return value; })()],
  ])("rejects incoherent unavailable %s", (_name, value) => {
    expect(SparkCollateralCapacitySnapshotSchema.safeParse(value).success).toBe(false);
  });

  it("accepts coherent configured and unconfigured bounded failures", () => {
    expect(SparkCollateralCapacitySnapshotSchema.safeParse(unavailable()).success).toBe(true);
    expect(SparkCollateralCapacitySnapshotSchema.safeParse(unavailable("rpc_not_configured")).success).toBe(true);
  });
});
