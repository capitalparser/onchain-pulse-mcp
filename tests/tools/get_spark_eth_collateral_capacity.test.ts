import { describe, expect, it } from "vitest";
import { buildUnavailableSparkCollateralSnapshot, buildVerifiedSparkCollateralSnapshot } from "../../src/spark_collateral_capacity/metrics.js";
import { SparkCollateralCapacitySnapshotSchema, type SparkReserveEvidenceInput } from "../../src/spark_collateral_capacity/types.js";
import { getSparkEthCollateralCapacity } from "../../src/tools/get_spark_eth_collateral_capacity.js";

const reserves: SparkReserveEvidenceInput[] = [
  { symbol: "WETH", underlying: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18, active: true, collateralEnabled: true, suppliedRaw: 1n, oraclePrice: 1n },
  { symbol: "wstETH", underlying: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0", decimals: 18, active: true, collateralEnabled: true, suppliedRaw: 1n, oraclePrice: 1n },
  { symbol: "rETH", underlying: "0xae78736Cd615f374D3085123A210448E74Fc6393", decimals: 18, active: true, collateralEnabled: true, suppliedRaw: 1n, oraclePrice: 1n },
  { symbol: "weETH", underlying: "0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee", decimals: 18, active: true, collateralEnabled: true, suppliedRaw: 1n, oraclePrice: 1n },
  { symbol: "rsETH", underlying: "0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7", decimals: 18, active: true, collateralEnabled: true, suppliedRaw: 1n, oraclePrice: 1n },
  { symbol: "ezETH", underlying: "0xbf5495Efe5DB9ce00f80364C8B423567e58d2110", decimals: 18, active: true, collateralEnabled: true, suppliedRaw: 1n, oraclePrice: 1n },
];
const sourceStatus = [{ source: "ethereum_rpc", role: "spark_lend_finalized_reserve_evidence", stale: false }];

function verified(stale = false) {
  return buildVerifiedSparkCollateralSnapshot({
    block: { number: 1, hash: `0x${"a".repeat(64)}`, timestamp: 1 }, reserves,
    sources: ["ethereum_rpc"], sourceStatus, stale,
  });
}

describe("getSparkEthCollateralCapacity", () => {
  it("localizes verified Spark supplied capacity in English without a broader-collateral claim", () => {
    const result = getSparkEthCollateralCapacity({ lang: "en", adapterSnapshot: { ...verified(), summary: "https://rpc.example/secret" } });
    expect(result.summary).toBe("SparkLend ETH-family supplied capacity was verified at a finalized Ethereum block.");
    expect(result.summary).not.toMatch(/actual user|combined|net|gross|locked|rehypothecation/i);
    expect(result.metrics).toMatchObject({ combined_aave_spark_supplied: null, actual_user_collateral: null, net_eth_locked: null, gross_eth_collateral: null, rehypothecation_ratio: null });
    expect(result.gaps).toHaveLength(5);
    expect(JSON.stringify(result)).not.toContain("rpc.example");
    expect(SparkCollateralCapacitySnapshotSchema.parse(result)).toEqual(result);
  });

  it("localizes stale Spark supplied capacity in Korean", () => {
    const result = getSparkEthCollateralCapacity({ lang: "ko", adapterSnapshot: verified(true) });
    expect(result.summary).toBe("새로고침 실패 후 캐시된 최종화 이더리움 블록의 SparkLend ETH 계열 공급 수용량을 사용합니다.");
    expect(result.gaps.map((gap) => gap.code)).toContain("source_stale");
  });

  it("localizes unavailable evidence and rejects fabricated broader metrics", () => {
    const unavailable = buildUnavailableSparkCollateralSnapshot({ summary: "https://rpc.example/secret", gaps: [{ code: "rpc_access_gap", detail: "bounded" }], sources: ["ethereum_rpc"], sourceStatus });
    expect(getSparkEthCollateralCapacity({ lang: "ko", adapterSnapshot: unavailable }).summary).toBe("SparkLend ETH 계열 공급 수용량 증거를 현재 사용할 수 없습니다.");
    const malformed = verified() as unknown as { metrics: { combined_aave_spark_supplied: unknown } };
    malformed.metrics.combined_aave_spark_supplied = { wei_floor: "1", eth_floor: "0.000000000000000001", remainder: "0", denominator: "1" };
    expect(() => getSparkEthCollateralCapacity({ lang: "en", adapterSnapshot: malformed as never })).toThrow();
  });
});
