import { describe, expect, it } from "vitest";
import { makeContext } from "../../src/adapters/base.js";
import { fetchEigenLayerEthRestakingExposure } from "../../src/adapters/eigenlayer_eth_restaking_rpc.js";
import { loadEnv } from "../../src/env.js";
import { EIGENLAYER_ETH_LST_STRATEGIES } from "../../src/eigenlayer_eth_restaking/types.js";
import { getEigenLayerEthRestakingExposure } from "../../src/tools/get_eigenlayer_eth_restaking_exposure.js";

const runLive = process.env.RUN_LIVE_EIGENLAYER_ETH_RESTAKING === "1"
  && Boolean(process.env.ETHEREUM_RPC_URL?.trim());

describe.skipIf(!runLive)("EigenLayer ETH restaking exposure", () => {
  it("independently verifies fixed token-unit evidence, diagnostics, and null boundaries", async () => {
    const env = loadEnv(process.env);
    const snapshot = getEigenLayerEthRestakingExposure({
      lang: env.lang,
      adapterSnapshot: await fetchEigenLayerEthRestakingExposure({ rpcUrl: env.ethereumRpcUrl }, makeContext({ env })),
    });
    expect(snapshot.status).toBe("verified");
    if (snapshot.status !== "verified") return;

    expect(snapshot.strategies.map(({ label, strategy }) => ({ label, strategy }))).toEqual(EIGENLAYER_ETH_LST_STRATEGIES);
    const tokens = snapshot.strategies.map((strategy) => strategy.underlying_token.toLowerCase());
    expect(new Set(tokens).size).toBe(EIGENLAYER_ETH_LST_STRATEGIES.length);
    for (const strategy of snapshot.strategies) {
      expect(strategy.underlying_token).not.toMatch(/^0x0{40}$/i);
      expect(Number.isInteger(strategy.decimals) && strategy.decimals >= 0 && strategy.decimals <= 255).toBe(true);
      expect(typeof strategy.whitelisted).toBe("boolean");
      expect(strategy.share_quote_exceeds_custody).toBe(
        BigInt(strategy.share_accounting_underlying) > BigInt(strategy.token_custody),
      );
    }

    expect(snapshot.identities?.token_native_amounts_not_aggregated).toBe(true);
    expect(snapshot.native_diagnostics).toMatchObject({
      num_pods: expect.stringMatching(/^(0|[1-9]\d*)$/),
      burnable_eth_shares: expect.stringMatching(/^(0|[1-9]\d*)$/),
    });
    expect(snapshot.native_diagnostics).not.toHaveProperty("native_restaked_eth_wei");
    expect(snapshot.metrics).toEqual({
      native_restaked_eth_wei: null,
      lst_restaked_eth_equivalent_wei: null,
      eigenlayer_eth_family_exposure_eth_wei: null,
      unique_net_eth_locked: null,
      combined_aave_spark_lido_sky_eigenlayer_demand: null,
      rehypothecation_ratio: null,
    });
    expect(snapshot.summary).toContain("not executable withdrawal capacity");
  }, 30_000);
});
