import { describe, expect, it } from "vitest";
import {
  EthCollateralDemandSnapshotSchema,
  type EthCollateralDemandSnapshot,
} from "../../src/eth_collateral_demand/types.js";
import { getEthCollateralDemand } from "../../src/tools/get_eth_collateral_demand.js";

const ASSETS = [
  ["WETH", "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"],
  ["wstETH", "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0"],
  ["cbETH", "0xBe9895146f7AF43049ca1c1AE358B0541Ea49704"],
  ["rETH", "0xae78736Cd615f374D3085123A210448E74Fc6393"],
  ["weETH", "0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee"],
  ["osETH", "0xf1C9acDc66974dFB6dEcB12aA385b9cD01190E38"],
  ["ETHx", "0xA35b1B31Ce002FBF2058D22F30f95D405200A15b"],
  ["rsETH", "0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7"],
  ["tETH", "0xD11c452fc99cF405034ee446803b6F6c1F6d5ED8"],
  ["ezETH", "0xbf5495Efe5DB9ce00f80364C8B423567e58d2110"],
] as const;

function exact() {
  return { wei_floor: "0", eth_floor: "0", remainder: "0", denominator: "1" };
}

function verifiedSnapshot(): EthCollateralDemandSnapshot {
  return {
    status: "verified",
    summary: "https://rpc.example/credential must not become public text",
    methodology: "eth-collateral-demand-aave-v3-v1",
    verified_block: { number: 256, hash: `0x${"a".repeat(64)}`, timestamp: 101 },
    metrics: {
      eth_family_supplied: exact(), collateral_eligible_supplied: exact(),
      actual_user_collateral: null, net_eth_locked: null,
      gross_eth_collateral: null, rehypothecation_ratio: null,
    },
    assets: ASSETS.map(([symbol, underlying]) => ({
      symbol, underlying, decimals: 18 as const, active: true as const,
      collateral_enabled: true, supplied_raw: "0", oracle_price: "1", eth_equivalent: exact(),
    })),
    identities: { supplied_equals_asset_sum: true, eligible_equals_enabled_asset_sum: true },
    coverage: {
      aave_v3_ethereum_core_complete: true,
      user_collateral_usage_complete: false,
      net_eth_locked_complete: false,
      gross_collateral_complete: false,
      rehypothecation_complete: false,
    },
    sources: ["ethereum_rpc"],
    source_status: [{ source: "ethereum_rpc", role: "aave_v3_finalized_reserve_evidence", stale: false }],
    gaps: [
      { code: "actual_user_collateral_not_indexed", detail: "Not indexed." },
      { code: "net_eth_locked_not_reconciled", detail: "Not reconciled." },
      { code: "gross_collateral_not_reconciled", detail: "Not reconciled." },
      { code: "rehypothecation_not_reconciled", detail: "Not reconciled." },
    ],
    capabilities: { ethereum_rpc_active: true },
  };
}

describe("getEthCollateralDemand", () => {
  it("localizes verified Aave V3 Core ETH-family supplied capacity in English", () => {
    const result = getEthCollateralDemand({ lang: "en", adapterSnapshot: verifiedSnapshot() });

    expect(result.summary).toBe("Aave V3 Core ETH-family supplied capacity was verified at a finalized Ethereum block.");
    expect(result.summary).not.toMatch(/actual user|net|gross|locked|issuance/i);
    expect(result.metrics.actual_user_collateral).toBeNull();
    expect(EthCollateralDemandSnapshotSchema.parse(result)).toEqual(result);
    expect(JSON.stringify(result)).not.toContain("rpc.example");
  });

  it("localizes verified supplied capacity in Korean without a collateral-usage claim", () => {
    const result = getEthCollateralDemand({ lang: "ko", adapterSnapshot: verifiedSnapshot() });

    expect(result.summary).toBe("최종화된 이더리움 블록 기준으로 Aave V3 Core ETH 계열 공급 수용량을 검증했습니다.");
    expect(result.metrics.net_eth_locked).toBeNull();
  });

  it("localizes unavailable evidence and strips adapter-provided credentials", () => {
    const result = getEthCollateralDemand({
      lang: "ko",
      adapterSnapshot: {
        ...verifiedSnapshot(),
        status: "unavailable",
        summary: "https://rpc.example/credential must not become public text",
        verified_block: null,
        metrics: {
          eth_family_supplied: null, collateral_eligible_supplied: null,
          actual_user_collateral: null, net_eth_locked: null,
          gross_eth_collateral: null, rehypothecation_ratio: null,
        },
        assets: [], identities: null,
        coverage: {
          aave_v3_ethereum_core_complete: false,
          user_collateral_usage_complete: false,
          net_eth_locked_complete: false,
          gross_collateral_complete: false,
          rehypothecation_complete: false,
        },
        sources: [], source_status: [],
        gaps: [{ code: "rpc_access_gap", detail: "Sanitized failure." }],
        capabilities: { ethereum_rpc_active: false },
      },
    });

    expect(result.summary).toBe("Aave V3 Core ETH 계열 공급 수용량 증거를 현재 사용할 수 없습니다.");
    expect(JSON.stringify(result)).not.toContain("rpc.example");
    expect(result.assets).toEqual([]);
  });

  it("rejects an adapter payload that fabricates a non-null broader metric", () => {
    const malformed = verifiedSnapshot() as unknown as { metrics: { gross_eth_collateral: unknown } };
    malformed.metrics.gross_eth_collateral = exact();
    expect(() => getEthCollateralDemand({ lang: "en", adapterSnapshot: malformed as unknown as EthCollateralDemandSnapshot })).toThrow();
  });
});
