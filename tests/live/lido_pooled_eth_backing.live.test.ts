import { describe, expect, it } from "vitest";
import { makeContext } from "../../src/adapters/base.js";
import { fetchLidoPooledEthBacking } from "../../src/adapters/lido_pooled_eth_rpc.js";
import { loadEnv } from "../../src/env.js";
import { getLidoPooledEthBacking } from "../../src/tools/get_lido_pooled_eth_backing.js";

const runLive = process.env.RUN_LIVE_LIDO_BACKING === "1" && Boolean(process.env.ETHEREUM_RPC_URL?.trim());

describe.skipIf(!runLive)("Lido pooled ETH backing", () => {
  it("reads one finalized snapshot with independently recomputed identities and null boundaries", async () => {
    const env = loadEnv(process.env);
    const snapshot = getLidoPooledEthBacking({
      lang: env.lang,
      adapterSnapshot: await fetchLidoPooledEthBacking({ rpcUrl: env.ethereumRpcUrl }, makeContext({ env })),
    });
    expect(snapshot.status).toBe("verified");
    if (snapshot.status !== "verified" || snapshot.accounting === null) return;
    const accounting = snapshot.accounting;
    const internalEther = BigInt(accounting.buffered_ether_wei) + BigInt(accounting.cl_validators_balance_at_last_report_wei)
      + BigInt(accounting.cl_pending_balance_at_last_report_wei) + BigInt(accounting.deposited_since_last_report_wei);
    const internalShares = BigInt(accounting.total_shares) - BigInt(accounting.external_shares);
    const externalEther = BigInt(accounting.external_shares) * internalEther / internalShares;
    const totalPooled = internalEther + externalEther;
    expect(BigInt(accounting.external_ether_wei)).toBe(externalEther);
    expect(BigInt(accounting.total_pooled_ether_wei)).toBe(totalPooled);
    expect(BigInt(accounting.total_supply_wei)).toBe(totalPooled);
    expect(snapshot.metrics).toMatchObject({
      total_pooled_eth_wei: totalPooled.toString(), internal_pooled_eth_wei: internalEther.toString(),
      external_pooled_eth_wei: externalEther.toString(), internal_shares: internalShares.toString(),
      all_ethereum_native_staked_eth: null, unique_net_eth_locked: null, defi_eth_collateral: null,
      combined_aave_spark_lido_demand: null, rehypothecation_ratio: null,
    });
  }, 30_000);
});
