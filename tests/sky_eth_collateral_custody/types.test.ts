import { describe, expect, it } from "vitest";
import {
  SKY_ETH_CUSTODY_ILKS,
  SkyEthCollateralCustodySnapshotSchema,
} from "../../src/sky_eth_collateral_custody/types.js";

const address = (value: string) => `0x${value.padStart(40, "0")}`;
const hash = `0x${"ab".repeat(32)}`;

function verified() {
  const vat = address("1");
  const joins = SKY_ETH_CUSTODY_ILKS.map((_, index) => address(String(index + 10)));
  return {
    status: "verified",
    summary: "verified",
    methodology: "sky-eth-collateral-adapter-custody-v1",
    verified_block: { number: 1, hash, timestamp: 2 },
    resolved_contracts: {
      vat,
      weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      wsteth: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
      reth: "0xae78736Cd615f374D3085123A210448E74Fc6393",
    },
    ilks: SKY_ETH_CUSTODY_ILKS.map((expected, index) => ({
      ...expected,
      join: joins[index], vat, token: expected.expected_token, decimals: 18, live: 1,
      raw_custody: String(index + 1),
    })),
    buckets: [
      { asset: "WETH", raw_custody: "6", quoted_eth_wei: "6" },
      { asset: "wstETH", raw_custody: "9", quoted_eth_wei: "10" },
      { asset: "rETH", raw_custody: "6", quoted_eth_wei: "7" },
    ],
    quote_inputs: { wsteth_raw: "9", reth_raw: "6" },
    metrics: {
      sky_eth_family_adapter_custody_eth_wei: "23",
      active_vault_collateral_eth: null,
      actual_user_collateral_eth: null,
      unique_net_eth_locked: null,
      combined_aave_spark_lido_sky_demand: null,
      rehypothecation_ratio: null,
    },
    identities: {
      ilk_raw_custody_equals_bucket_sums: true,
      weth_quote_equals_raw_custody: true,
      wsteth_quote_uses_aggregate_amount: true,
      reth_quote_uses_aggregate_amount: true,
      total_quoted_custody_equals_bucket_sum: true,
    },
    coverage: {
      fixed_ilk_universe_complete: true,
      active_vault_collateral_complete: false,
      actual_user_collateral_complete: false,
      unique_net_eth_locked_complete: false,
      combined_aave_spark_lido_sky_demand_complete: false,
      rehypothecation_ratio_complete: false,
    },
    sources: ["ethereum_rpc"],
    source_status: [{ source: "ethereum_rpc", role: "sky_chainlog_finalized_adapter_custody_evidence", stale: false }],
    gaps: [
      { code: "active_vault_collateral_not_measured", detail: "not measured" },
      { code: "actual_user_collateral_not_measured", detail: "not measured" },
      { code: "unique_net_eth_locked_not_reconciled", detail: "not reconciled" },
      { code: "combined_aave_spark_lido_sky_demand_not_reconciled", detail: "not reconciled" },
      { code: "rehypothecation_ratio_not_measured", detail: "not measured" },
    ],
    capabilities: { ethereum_rpc_active: true },
  };
}

describe("SkyEthCollateralCustodySnapshotSchema", () => {
  it("accepts one exact fresh six-ilk finalized custody snapshot", () => {
    expect(SkyEthCollateralCustodySnapshotSchema.safeParse(verified()).success).toBe(true);
  });

  it.each([
    ["a duplicate ilk", (value: any) => { value.ilks[1].ilk = "ETH-A"; }],
    ["a fabricated bucket total", (value: any) => { value.buckets[0].raw_custody = "7"; }],
    ["a fabricated total quote", (value: any) => { value.metrics.sky_eth_family_adapter_custody_eth_wei = "24"; }],
    ["a mismatched join Vat", (value: any) => { value.ilks[0].vat = address("99"); }],
    ["an overflowed uint256", (value: any) => { value.ilks[0].raw_custody = (2n ** 256n).toString(); }],
    ["mixed fresh and stale evidence", (value: any) => { value.source_status.push({ source: "other", role: "other", stale: true }); }],
  ])("rejects %s without throwing", (_name, mutate) => {
    const value = verified();
    mutate(value);
    expect(() => SkyEthCollateralCustodySnapshotSchema.safeParse(value)).not.toThrow();
    expect(SkyEthCollateralCustodySnapshotSchema.safeParse(value).success).toBe(false);
  });

  it("rejects an unavailable snapshot with partial observed evidence", () => {
    const value: any = verified();
    value.status = "unavailable";
    value.verified_block = null;
    expect(SkyEthCollateralCustodySnapshotSchema.safeParse(value).success).toBe(false);
  });
});
