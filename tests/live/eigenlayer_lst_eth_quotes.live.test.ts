import { describe, expect, it } from "vitest";
import { makeContext } from "../../src/adapters/base.js";
import { fetchEigenLayerLstEthQuotes } from "../../src/adapters/eigenlayer_lst_eth_quotes_rpc.js";
import { loadEnv } from "../../src/env.js";
import {
  EIGENLAYER_COVERED_LST_STRATEGIES,
  EIGENLAYER_UNQUOTED_LST_STRATEGY_LABELS,
} from "../../src/eigenlayer_lst_eth_quotes/types.js";
import { getEigenLayerLstEthQuotes } from "../../src/tools/get_eigenlayer_lst_eth_quotes.js";

const runLive = process.env.RUN_LIVE_EIGENLAYER_LST_ETH_QUOTES === "1"
  && Boolean(process.env.ETHEREUM_RPC_URL?.trim());

describe.skipIf(!runLive)("EigenLayer covered LST ETH quotes", () => {
  it("independently verifies exact covered quotes, partial sums, and permanent null boundaries", async () => {
    const env = loadEnv(process.env);
    const snapshot = getEigenLayerLstEthQuotes({
      lang: env.lang,
      adapterSnapshot: await fetchEigenLayerLstEthQuotes({ rpcUrl: env.ethereumRpcUrl }, makeContext({ env })),
    });
    expect(snapshot.status).toBe("verified");
    if (snapshot.status !== "verified") return;

    expect(snapshot.covered_quotes.map(({ label, strategy, underlying_token, decimals }) => ({
      label,
      strategy,
      underlying_token,
      decimals,
    }))).toEqual(EIGENLAYER_COVERED_LST_STRATEGIES);
    expect(snapshot.covered_quotes.map((quote) => quote.quote_kind)).toEqual([
      "steth_token_wei_identity_quote",
      "rocket_pool_direct_aggregate_quote",
      "coinbase_oracle_accounting_quote",
    ]);

    const [steth, reth, cbeth] = snapshot.covered_quotes;
    expect(steth!.share_accounting_eth_quote_wei).toBe(steth!.share_accounting_token_amount);
    expect(steth!.token_custody_eth_quote_wei).toBe(steth!.token_custody_token_amount);
    expect(steth!.cbeth_exchange_rate_wei).toBeNull();
    expect(reth!.cbeth_exchange_rate_wei).toBeNull();

    const cbethRate = BigInt(cbeth!.cbeth_exchange_rate_wei!);
    expect(cbethRate).toBeGreaterThan(0n);
    expect(BigInt(cbeth!.share_accounting_eth_quote_wei)).toBe(
      (BigInt(cbeth!.share_accounting_token_amount) * cbethRate) / (10n ** 18n),
    );
    expect(BigInt(cbeth!.token_custody_eth_quote_wei)).toBe(
      (BigInt(cbeth!.token_custody_token_amount) * cbethRate) / (10n ** 18n),
    );
    expect(snapshot.gaps.map((gap) => gap.code)).toContain("cbeth_exchange_rate_freshness_not_verified");

    const shareSum = snapshot.covered_quotes.reduce(
      (sum, quote) => sum + BigInt(quote.share_accounting_eth_quote_wei),
      0n,
    );
    const custodySum = snapshot.covered_quotes.reduce(
      (sum, quote) => sum + BigInt(quote.token_custody_eth_quote_wei),
      0n,
    );
    expect(snapshot.metrics.covered_share_accounting_eth_equivalent_wei).toBe(shareSum.toString());
    expect(snapshot.metrics.covered_token_custody_eth_equivalent_wei).toBe(custodySum.toString());
    expect(snapshot.coverage).toEqual({
      quoted_strategy_count: 3,
      fixed_strategy_count: 12,
      unquoted_strategy_labels: EIGENLAYER_UNQUOTED_LST_STRATEGY_LABELS,
    });
    expect(snapshot.metrics).toMatchObject({
      lst_restaked_eth_equivalent_wei: null,
      native_restaked_eth_wei: null,
      eigenlayer_eth_family_exposure_eth_wei: null,
      unique_net_eth_locked: null,
      combined_aave_spark_lido_sky_eigenlayer_demand: null,
      rehypothecation_ratio: null,
      executable_withdrawal_capacity_eth_wei: null,
    });
    expect(snapshot.summary).toContain("executable withdrawal capacity");
  }, 30_000);
});
