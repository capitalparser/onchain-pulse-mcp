import { describe, expect, it } from "vitest";
import {
  buildUnavailableSkyEthCollateralCustodySnapshot,
  buildVerifiedSkyEthCollateralCustodySnapshot,
  SkyEthCollateralCustodyDomainError,
} from "../../src/sky_eth_collateral_custody/metrics.js";
import { SKY_ETH_CUSTODY_ILKS } from "../../src/sky_eth_collateral_custody/types.js";

const address = (value: string) => `0x${value.padStart(40, "0")}`;
const contracts = {
  vat: address("1"),
  weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  wsteth: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
  reth: "0xae78736Cd615f374D3085123A210448E74Fc6393",
} as const;

function evidence() {
  return SKY_ETH_CUSTODY_ILKS.map((expected, index) => ({
    ...expected, join: address(String(index + 10)), vat: contracts.vat,
    token: expected.expected_token, decimals: 18, live: 1, rawCustody: BigInt(index + 1),
  }));
}

describe("Sky ETH adapter custody metrics", () => {
  it("recomputes fixed bucket and total quoted custody while preserving the five null boundaries", () => {
    const snapshot = buildVerifiedSkyEthCollateralCustodySnapshot({
      block: { number: 1, hash: `0x${"ab".repeat(32)}`, timestamp: 2 }, contracts,
      ilks: evidence(), wstethQuotedEthWei: 10n, rethQuotedEthWei: 7n,
      sources: ["ethereum_rpc"],
      sourceStatus: [{ source: "ethereum_rpc", role: "sky_chainlog_finalized_adapter_custody_evidence", stale: false }],
    });

    expect(snapshot.buckets).toEqual([
      { asset: "WETH", raw_custody: "6", quoted_eth_wei: "6" },
      { asset: "wstETH", raw_custody: "9", quoted_eth_wei: "10" },
      { asset: "rETH", raw_custody: "6", quoted_eth_wei: "7" },
    ]);
    expect(snapshot.quote_inputs).toEqual({ wsteth_raw: "9", reth_raw: "6" });
    expect(snapshot.metrics).toEqual({
      sky_eth_family_adapter_custody_eth_wei: "23",
      active_vault_collateral_eth: null, actual_user_collateral_eth: null,
      unique_net_eth_locked: null, combined_aave_spark_lido_sky_demand: null, rehypothecation_ratio: null,
    });
  });

  it("fails closed when ordered join evidence is not the six-ilk universe", () => {
    const ilks = evidence();
    ilks.reverse();
    expect(() => buildVerifiedSkyEthCollateralCustodySnapshot({
      block: { number: 1, hash: `0x${"ab".repeat(32)}`, timestamp: 2 }, contracts,
      ilks, wstethQuotedEthWei: 10n, rethQuotedEthWei: 7n,
      sources: ["ethereum_rpc"], sourceStatus: [{ source: "ethereum_rpc", role: "sky_chainlog_finalized_adapter_custody_evidence", stale: false }],
    })).toThrow(SkyEthCollateralCustodyDomainError);
  });

  it("creates unavailable output with no partial custody evidence", () => {
    const snapshot = buildUnavailableSkyEthCollateralCustodySnapshot({
      summary: "unavailable", gaps: [{ code: "rpc_access_gap", detail: "bounded" }],
      sources: ["ethereum_rpc"],
      sourceStatus: [{ source: "ethereum_rpc", role: "sky_chainlog_finalized_adapter_custody_evidence", stale: false }],
    });
    expect(snapshot).toMatchObject({ status: "unavailable", verified_block: null, resolved_contracts: null, ilks: [], buckets: [] });
  });
});
