import { describe, expect, it } from "vitest";
import { makeContext } from "../../src/adapters/base.js";
import { fetchSkyEthCollateralCustody } from "../../src/adapters/sky_eth_collateral_rpc.js";
import { loadEnv } from "../../src/env.js";
import { getSkyEthCollateralCustody } from "../../src/tools/get_sky_eth_collateral_custody.js";

const runLive = process.env.RUN_LIVE_SKY_ETH_CUSTODY === "1" && Boolean(process.env.ETHEREUM_RPC_URL?.trim());

describe.skipIf(!runLive)("Sky ETH adapter custody", () => {
  it("recomputes token buckets and preserves all five non-measurement boundaries", async () => {
    const env = loadEnv(process.env);
    const snapshot = getSkyEthCollateralCustody({
      lang: env.lang,
      adapterSnapshot: await fetchSkyEthCollateralCustody({ rpcUrl: env.ethereumRpcUrl }, makeContext({ env })),
    });
    expect(snapshot.status).toBe("verified");
    if (snapshot.status !== "verified") return;
    const byAsset = new Map(snapshot.ilks.map((ilk) => [ilk.asset, 0n]));
    for (const ilk of snapshot.ilks) byAsset.set(ilk.asset, byAsset.get(ilk.asset)! + BigInt(ilk.raw_custody));
    for (const bucket of snapshot.buckets) expect(BigInt(bucket.raw_custody)).toBe(byAsset.get(bucket.asset));
    expect(BigInt(snapshot.metrics.sky_eth_family_adapter_custody_eth_wei!)).toBe(snapshot.buckets.reduce((sum, bucket) => sum + BigInt(bucket.quoted_eth_wei), 0n));
    expect(snapshot.metrics).toMatchObject({
      active_vault_collateral_eth: null, actual_user_collateral_eth: null, unique_net_eth_locked: null,
      combined_aave_spark_lido_sky_demand: null, rehypothecation_ratio: null,
    });
  }, 30_000);
});
