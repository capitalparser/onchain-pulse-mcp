import { describe, expect, it } from "vitest";
import { buildUnavailableSkyEthCollateralCustodySnapshot, buildVerifiedSkyEthCollateralCustodySnapshot } from "../../src/sky_eth_collateral_custody/metrics.js";
import { SKY_ETH_CUSTODY_ILKS, type SkyEthCollateralSourceStatus } from "../../src/sky_eth_collateral_custody/types.js";
import { getSkyEthCollateralCustody } from "../../src/tools/get_sky_eth_collateral_custody.js";

const address = (value: string) => `0x${value.padStart(40, "0")}`;
const contracts = {
  vat: address("1"), weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  wsteth: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0", reth: "0xae78736Cd615f374D3085123A210448E74Fc6393",
} as const;
const sourceStatus: SkyEthCollateralSourceStatus[] = [{ source: "ethereum_rpc", role: "sky_chainlog_finalized_adapter_custody_evidence", stale: false }];

function verified(stale = false) {
  return buildVerifiedSkyEthCollateralCustodySnapshot({
    block: { number: 1, hash: `0x${"a".repeat(64)}`, timestamp: 1 }, contracts,
    ilks: SKY_ETH_CUSTODY_ILKS.map((expected, index) => ({ ...expected, join: address(String(index + 10)), vat: contracts.vat, token: expected.expected_token, decimals: 18, live: 1, rawCustody: BigInt(index + 1) })),
    wstethQuotedEthWei: 10n, rethQuotedEthWei: 7n, sources: ["ethereum_rpc"], sourceStatus, stale,
  });
}

describe("getSkyEthCollateralCustody", () => {
  it("localizes verified legacy adapter-held custody in English without widening the measurement", () => {
    const result = getSkyEthCollateralCustody({ lang: "en", adapterSnapshot: { ...verified(), summary: "https://rpc.example/secret" } });
    expect(result.summary).toContain("Legacy Maker/Sky ETH-family adapter-held token custody was verified");
    expect(result.summary).toMatch(/does not measure active Vault collateral, actual user collateral, unique or net ETH locked, combined Aave\/Spark\/Lido\/Sky demand, or rehypothecation/i);
    expect(result.metrics).toMatchObject({
      active_vault_collateral_eth: null, actual_user_collateral_eth: null, unique_net_eth_locked: null,
      combined_aave_spark_lido_sky_demand: null, rehypothecation_ratio: null,
    });
    expect(JSON.stringify(result)).not.toContain("rpc.example");
  });

  it("localizes verified and stale evidence in both languages while retaining every permanent gap", () => {
    const koreanVerified = getSkyEthCollateralCustody({ lang: "ko", adapterSnapshot: verified() });
    const englishStale = getSkyEthCollateralCustody({ lang: "en", adapterSnapshot: verified(true) });
    const koreanStale = getSkyEthCollateralCustody({ lang: "ko", adapterSnapshot: verified(true) });
    expect(koreanVerified.summary).toMatch(/레거시 Maker\/Sky ETH 계열 어댑터 보관 토큰을 검증했습니다/);
    expect(englishStale.summary).toMatch(/Cached finalized Ethereum legacy Maker\/Sky ETH-family adapter-held token custody/);
    expect(koreanStale.summary).toMatch(/레거시 Maker\/Sky ETH 계열 어댑터 보관 토큰/);
    expect(koreanStale.summary).toMatch(/활성 Vault 담보|실제 사용자 담보|고유 또는 순 ETH 락업|Aave\/Spark\/Lido\/Sky 통합 수요|재담보화/);
    expect(koreanStale.gaps).toHaveLength(6);
    expect(koreanStale.gaps.filter((gap) => gap.code === "source_stale")).toHaveLength(1);
  });

  it("localizes unavailable evidence without fabricating custody or broader metrics", () => {
    const unavailable = buildUnavailableSkyEthCollateralCustodySnapshot({
      summary: "https://rpc.example/secret", gaps: [{ code: "rpc_access_gap", detail: "bounded" }],
      sources: ["ethereum_rpc"], sourceStatus,
    });
    const english = getSkyEthCollateralCustody({ lang: "en", adapterSnapshot: unavailable });
    const korean = getSkyEthCollateralCustody({ lang: "ko", adapterSnapshot: unavailable });
    expect(english.summary).toMatch(/Legacy Maker\/Sky ETH-family adapter-held token custody evidence is unavailable/);
    expect(korean.summary).toMatch(/레거시 Maker\/Sky ETH 계열 어댑터 보관 토큰 증거를 현재 사용할 수 없습니다/);
    expect(korean).toMatchObject({ status: "unavailable", resolved_contracts: null, ilks: [], buckets: [] });
  });
});
