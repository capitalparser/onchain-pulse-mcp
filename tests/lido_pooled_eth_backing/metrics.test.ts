import { describe, expect, it } from "vitest";
import { buildUnavailableLidoPooledEthBackingSnapshot, buildVerifiedLidoPooledEthBackingSnapshot } from "../../src/lido_pooled_eth_backing/metrics.js";

const block = { number: 1, hash: `0x${"a".repeat(64)}`, timestamp: 1 };
const sourceStatus = [{ source: "ethereum_rpc", role: "lido_v4_finalized_accounting", stale: false }];
const accounting = {
  totalSupply: 37n, totalPooledEther: 37n, totalShares: 50n, externalShares: 10n,
  bufferedEther: 3n, clValidatorsBalanceAtLastReport: 20n, clPendingBalanceAtLastReport: 4n,
  depositedSinceLastReport: 3n, depositedForCurrentReport: 2n,
};

describe("Lido pooled ETH backing metrics", () => {
  it("derives every exact bigint identity and retains literal broader nulls", () => {
    const result = buildVerifiedLidoPooledEthBackingSnapshot({ block, accounting, sources: ["ethereum_rpc"], sourceStatus });
    expect(result.metrics).toMatchObject({
      total_pooled_eth_wei: "37", internal_pooled_eth_wei: "30", external_pooled_eth_wei: "7",
      internal_shares: "40", external_shares: "10", all_ethereum_native_staked_eth: null,
      unique_net_eth_locked: null, defi_eth_collateral: null, combined_aave_spark_lido_demand: null,
      rehypothecation_ratio: null,
    });
    expect(result.identities).toEqual({
      internal_ether_equals_components: true, internal_shares_equals_total_minus_external: true,
      external_ether_equals_floor_share_ratio: true, total_pooled_ether_equals_internal_plus_external: true,
      total_supply_equals_total_pooled_ether: true,
    });
    expect(result.gaps).toHaveLength(5);
  });

  it("marks only fully verified evidence stale after refresh failure", () => {
    const result = buildVerifiedLidoPooledEthBackingSnapshot({ block, accounting, sources: ["ethereum_rpc"], sourceStatus, stale: true });
    expect(result.source_status.every((status) => status.stale)).toBe(true);
    expect(result.gaps.filter((gap) => gap.code === "source_stale")).toHaveLength(1);
  });

  it.each([
    ["negative evidence", { ...accounting, bufferedEther: -1n }],
    ["external shares equal to total shares", { ...accounting, externalShares: 50n }],
    ["inconsistent total supply", { ...accounting, totalSupply: 41n }],
    ["deposited current above deposited since", { ...accounting, depositedForCurrentReport: 4n }],
  ])("rejects %s without returning partial metrics", (_name, bad) => {
    expect(() => buildVerifiedLidoPooledEthBackingSnapshot({ block, accounting: bad, sources: ["ethereum_rpc"], sourceStatus })).toThrow();
  });

  it("builds a bounded unavailable snapshot with no observed partials", () => {
    const result = buildUnavailableLidoPooledEthBackingSnapshot({ summary: "unavailable", gaps: [{ code: "rpc_access_gap", detail: "bounded" }], sources: ["ethereum_rpc"], sourceStatus });
    expect(result).toMatchObject({ status: "unavailable", verified_block: null, accounting: null, identities: null });
    expect(result.metrics.total_pooled_eth_wei).toBeNull();
  });
});
