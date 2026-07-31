import { describe, expect, it } from "vitest";
import { buildUnavailableSparkCollateralSnapshot, buildVerifiedSparkCollateralSnapshot } from "../../src/spark_collateral_capacity/metrics.js";
import type { SparkReserveEvidenceInput } from "../../src/spark_collateral_capacity/types.js";

const reserves: SparkReserveEvidenceInput[] = [
  { symbol: "WETH", underlying: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18, active: true, suppliedRaw: 3n, oraclePrice: 3n, collateralEnabled: true },
  { symbol: "wstETH", underlying: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0", decimals: 18, active: true, suppliedRaw: 1n, oraclePrice: 2n, collateralEnabled: true },
  { symbol: "rETH", underlying: "0xae78736Cd615f374D3085123A210448E74Fc6393", decimals: 18, active: true, suppliedRaw: 1n, oraclePrice: 1n, collateralEnabled: false },
  { symbol: "weETH", underlying: "0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee", decimals: 18, active: true, suppliedRaw: 1n, oraclePrice: 1n, collateralEnabled: true },
  { symbol: "rsETH", underlying: "0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7", decimals: 18, active: true, suppliedRaw: 1n, oraclePrice: 1n, collateralEnabled: true },
  { symbol: "ezETH", underlying: "0xbf5495Efe5DB9ce00f80364C8B423567e58d2110", decimals: 18, active: true, suppliedRaw: 1n, oraclePrice: 1n, collateralEnabled: true },
];
const block = { number: 1, hash: `0x${"a".repeat(64)}`, timestamp: 1 };
const sourceStatus = [{ source: "ethereum_rpc", role: "spark_lend_finalized_reserve_evidence", stale: false }];

describe("Spark collateral metrics", () => {
  it("derives non-divisible asset fractions and canonically reduced aggregate identities", () => {
    const result = buildVerifiedSparkCollateralSnapshot({ block, reserves, sources: ["ethereum_rpc"], sourceStatus });
    expect(result.metrics.spark_eth_family_supplied).toEqual({ wei_floor: "5", eth_floor: "0.000000000000000005", remainder: "0", denominator: "1" });
    expect(result.metrics.spark_collateral_eligible_supplied).toEqual({ wei_floor: "4", eth_floor: "0.000000000000000004", remainder: "2", denominator: "3" });
    expect(result.metrics).toMatchObject({ combined_aave_spark_supplied: null, actual_user_collateral: null, net_eth_locked: null, gross_eth_collateral: null, rehypothecation_ratio: null });
    expect(result.gaps.map((gap) => gap.code)).toContain("aave_spark_overlap_not_reconciled");
  });

  it("marks only verified raw evidence stale after refresh failure", () => {
    const result = buildVerifiedSparkCollateralSnapshot({ block, reserves, sources: ["ethereum_rpc"], sourceStatus, stale: true });
    expect(result.gaps.filter((gap) => gap.code === "source_stale")).toHaveLength(1);
    expect(result.source_status.every((status) => status.stale)).toBe(true);
  });

  it.each([
    ["wrong reserve decimals", { ...reserves[0]!, decimals: 17 }],
    ["inactive reserve", { ...reserves[0]!, active: false }],
    ["zero price", { ...reserves[0]!, oraclePrice: 0n }],
    ["negative supply", { ...reserves[0]!, suppliedRaw: -1n }],
  ])("rejects %s without returning a partial snapshot", (_name, bad) => {
    expect(() => buildVerifiedSparkCollateralSnapshot({ block, reserves: [bad, ...reserves.slice(1)], sources: ["ethereum_rpc"], sourceStatus })).toThrow();
  });

  it("builds an unavailable snapshot with no observed evidence", () => {
    const result = buildUnavailableSparkCollateralSnapshot({ summary: "unavailable", gaps: [{ code: "rpc_access_gap", detail: "bounded" }], sources: ["ethereum_rpc"], sourceStatus });
    expect(result).toMatchObject({ status: "unavailable", verified_block: null, assets: [], identities: null });
    expect(result.metrics.spark_eth_family_supplied).toBeNull();
  });
});
