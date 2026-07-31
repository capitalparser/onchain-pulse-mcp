import { describe, expect, it, vi } from "vitest";
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

describe.skipIf(runLive)("disabled EigenLayer covered LST ETH quote live gate", () => {
  it("does not invoke transport without both explicit live gates", async () => {
    const fetchImpl = vi.fn();
    const env = { byok: {}, lang: "en" as const, historyPath: "/tmp/live-disabled-history.json", ethereumRpcUrl: undefined, ethereumBeaconApiUrl: undefined };

    const snapshot = await fetchEigenLayerLstEthQuotes(
      { rpcUrl: env.ethereumRpcUrl },
      makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }),
    );

    expect(snapshot.status).toBe("unavailable");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

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
      "stakewise_v3_direct_controller_quote",
      "liquid_collective_river_direct_share_quote",
      "mantle_staking_direct_oracle_quote",
    ]);
    expect(snapshot.covered_quotes.map((quote) => quote.trust_basis)).toEqual([
      "lido_pooled_eth_accounting",
      "rocket_pool_network_accounting",
      "coinbase_oracle_controlled_rate",
      "stakewise_v3_keeper_reward_accounting",
      "liquid_collective_oracle_reported_accounting",
      "mantle_oracle_reported_accounting",
    ]);

    const [steth, reth, cbeth, oseth, lseth, meth] = snapshot.covered_quotes;
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
    expect(cbeth!.share_accounting_eth_quote_wei).toBe(
      ((BigInt(cbeth!.share_accounting_token_amount) * cbethRate) / (10n ** 18n)).toString(),
    );
    expect(cbeth!.token_custody_eth_quote_wei).toBe(
      ((BigInt(cbeth!.token_custody_token_amount) * cbethRate) / (10n ** 18n)).toString(),
    );
    expect(oseth!.cbeth_exchange_rate_wei).toBeNull();
    expect(lseth!.cbeth_exchange_rate_wei).toBeNull();
    expect(meth!.cbeth_exchange_rate_wei).toBeNull();
    for (const directQuote of [
      oseth!.share_accounting_eth_quote_wei,
      oseth!.token_custody_eth_quote_wei,
      lseth!.share_accounting_eth_quote_wei,
      lseth!.token_custody_eth_quote_wei,
      meth!.share_accounting_eth_quote_wei,
      meth!.token_custody_eth_quote_wei,
    ]) {
      expect(directQuote).toMatch(/^(0|[1-9]\d*)$/);
    }

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
      quoted_strategy_count: 6,
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
    expect(snapshot.gaps.map((gap) => gap.code)).toEqual(expect.arrayContaining([
      "lst_quote_coverage_partial",
      "cbeth_exchange_rate_freshness_not_verified",
      "oseth_virtual_rewards_freshness_not_verified",
      "oseth_backing_not_reconciled",
      "lseth_oracle_report_freshness_not_verified",
      "lseth_proxy_upgradeability_not_verified",
      "lseth_backing_not_reconciled",
      "meth_oracle_record_freshness_not_verified",
      "meth_backing_not_reconciled",
      "native_restaked_eth_not_measured",
      "lst_restaked_eth_equivalent_not_measured",
      "eigenlayer_eth_family_exposure_not_measured",
      "unique_net_eth_locked_not_reconciled",
      "combined_aave_spark_lido_sky_eigenlayer_demand_not_reconciled",
      "rehypothecation_ratio_not_measured",
      "executable_withdrawal_capacity_not_measured",
    ]));
    expect(snapshot.report_context?.lseth_last_completed_epoch_id).toMatch(/^(0|[1-9]\d*)$/);
    expect(snapshot.gaps).toHaveLength(16);
    expect(snapshot.summary).toContain("executable withdrawal/liquidity");
    expect(snapshot.summary.length).toBeLessThanOrEqual(500);
  }, 30_000);
});
