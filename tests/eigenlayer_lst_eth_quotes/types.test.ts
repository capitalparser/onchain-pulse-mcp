import { describe, expect, it } from "vitest";
import {
  EIGENLAYER_COVERED_LST_STRATEGIES,
  EIGENLAYER_LST_ETH_QUOTES_PERMANENT_GAP_CODES,
  EIGENLAYER_UNQUOTED_LST_STRATEGY_LABELS,
  EigenLayerLstEthQuotesSnapshotSchema,
} from "../../src/eigenlayer_lst_eth_quotes/types.js";

const permanentGaps = EIGENLAYER_LST_ETH_QUOTES_PERMANENT_GAP_CODES.map((code) => ({ code, detail: "bounded" }));

function quote(index: number, amounts: readonly [string, string, string, string], quote_kind: string, trust_basis: string, rates = {}) {
  return {
    ...EIGENLAYER_COVERED_LST_STRATEGIES[index],
    share_accounting_token_amount: amounts[0], token_custody_token_amount: amounts[1],
    quote_kind, trust_basis, share_accounting_eth_quote_wei: amounts[2], token_custody_eth_quote_wei: amounts[3],
    cbeth_exchange_rate_wei: null, sweth_to_eth_rate_wei: null, ...rates,
  };
}

function verified(): any {
  return {
    status: "verified", summary: "verified", methodology: "eigenlayer-covered-lst-eth-quotes-v5",
    verified_block: { number: 1, hash: `0x${"ab".repeat(32)}`, timestamp: 2 },
    covered_quotes: [
      quote(0, ["100", "90", "100", "90"], "steth_token_wei_identity_quote", "lido_pooled_eth_accounting"),
      quote(1, ["200", "180", "251", "226"], "rocket_pool_direct_aggregate_quote", "rocket_pool_network_accounting"),
      quote(2, ["301", "271", "451", "406"], "coinbase_oracle_accounting_quote", "coinbase_oracle_controlled_rate", { cbeth_exchange_rate_wei: "1500000000000000000" }),
      quote(3, ["400", "380", "460", "431"], "stader_direct_pool_accounting_quote", "stader_oracle_reported_accounting"),
      quote(4, ["400", "380", "460", "431"], "stakewise_v3_direct_controller_quote", "stakewise_v3_keeper_reward_accounting"),
      quote(5, ["700", "650", "700", "650"], "swell_reprice_rate_floor_quote", "swell_reprice_role_controlled_rate", { sweth_to_eth_rate_wei: "1000000000000000000" }),
      quote(6, ["600", "570", "650", "620"], "liquid_collective_river_direct_share_quote", "liquid_collective_oracle_reported_accounting"),
      quote(7, ["500", "470", "555", "521"], "mantle_staking_direct_oracle_quote", "mantle_oracle_reported_accounting"),
    ],
    report_context: { lseth_last_completed_epoch_id: "123", ethx_oracle_reporting_block_number: "1", sweth_last_reprice_unix: "0" },
    metrics: {
      covered_share_accounting_eth_equivalent_wei: "3627", covered_token_custody_eth_equivalent_wei: "3375",
      lst_restaked_eth_equivalent_wei: null, native_restaked_eth_wei: null, eigenlayer_eth_family_exposure_eth_wei: null,
      unique_net_eth_locked: null, combined_aave_spark_lido_sky_eigenlayer_demand: null, rehypothecation_ratio: null,
      executable_withdrawal_capacity_eth_wei: null,
    },
    identities: { covered_strategy_order_verified: true, covered_token_identities_verified: true, covered_token_decimals_verified: true, token_amounts_and_quotes_independent: true, partial_aggregates_only: true },
    coverage: { quoted_strategy_count: 8, fixed_strategy_count: 12, unquoted_strategy_labels: [...EIGENLAYER_UNQUOTED_LST_STRATEGY_LABELS] },
    sources: ["ethereum_rpc"], source_status: [{ source: "ethereum_rpc", role: "eigenlayer_finalized_lst_eth_quote_evidence", stale: false }],
    gaps: permanentGaps.map((gap) => ({ ...gap })), capabilities: { ethereum_rpc_active: true },
  };
}

function unavailable(): any {
  const value = verified();
  return {
    ...value, status: "unavailable", summary: "unavailable", verified_block: null, covered_quotes: [], report_context: null,
    metrics: { ...value.metrics, covered_share_accounting_eth_equivalent_wei: null, covered_token_custody_eth_equivalent_wei: null },
    identities: null, coverage: null, gaps: [{ code: "rpc_access_gap", detail: "bounded" }], capabilities: { ethereum_rpc_active: false },
  };
}

describe("EigenLayer covered LST ETH quote domain", () => {
  it("pins the exact ordered eight-token strategy-token universe", () => {
    expect(EIGENLAYER_COVERED_LST_STRATEGIES.map((strategy) => strategy.label)).toEqual(["stETH", "rETH", "cbETH", "ETHx", "osETH", "swETH", "lsETH", "mETH"]);
    expect(EIGENLAYER_COVERED_LST_STRATEGIES[5]).toEqual({ label: "swETH", strategy: "0x0Fe4F44beE93503346A3Ac9EE5A26b130a5796d6", underlying_token: "0xf951E335afb289353dc249e82926178EaC7DEd78", decimals: 18 });
    expect(EIGENLAYER_UNQUOTED_LST_STRATEGY_LABELS).toEqual(["ankrETH", "oETH", "wBETH", "sfrxETH"]);
  });

  it("accepts one exact v5 verified 8-of-12 snapshot with Swell floor quotes and context", () => {
    const snapshot = verified();
    expect(snapshot.covered_quotes[5]).toMatchObject({ label: "swETH", quote_kind: "swell_reprice_rate_floor_quote", trust_basis: "swell_reprice_role_controlled_rate", sweth_to_eth_rate_wei: "1000000000000000000" });
    expect(snapshot.report_context).toEqual({ lseth_last_completed_epoch_id: "123", ethx_oracle_reporting_block_number: "1", sweth_last_reprice_unix: "0" });
    expect(snapshot.coverage).toEqual({ quoted_strategy_count: 8, fixed_strategy_count: 12, unquoted_strategy_labels: [...EIGENLAYER_UNQUOTED_LST_STRATEGY_LABELS] });
    expect(snapshot.metrics).toMatchObject({ covered_share_accounting_eth_equivalent_wei: "3627", covered_token_custody_eth_equivalent_wei: "3375" });
    expect(snapshot.gaps.map((gap: any) => gap.code)).toEqual(EIGENLAYER_LST_ETH_QUOTES_PERMANENT_GAP_CODES);
    expect(EigenLayerLstEthQuotesSnapshotSchema.safeParse(snapshot).success).toBe(true);
  });

  it("accepts the valid swETH default pair and recomputes full-precision floors", () => {
    const value = verified();
    value.covered_quotes[5].share_accounting_token_amount = "115792089237316195423570985008687907853269984665640564039457584007913129637008";
    value.covered_quotes[5].token_custody_token_amount = "0";
    value.covered_quotes[5].share_accounting_eth_quote_wei = "115792089237316195423570985008687907853269984665640564039457584007913129637008";
    value.covered_quotes[5].token_custody_eth_quote_wei = "0";
    value.metrics.covered_share_accounting_eth_equivalent_wei = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
    value.metrics.covered_token_custody_eth_equivalent_wei = "2725";
    expect(EigenLayerLstEthQuotesSnapshotSchema.safeParse(value).success).toBe(true);
  });

  it("rejects malformed, inconsistent, future, zero-rate, default-rate, or overflowing swETH evidence", () => {
    const max = (2n ** 256n) - 1n;
    const mutations: Array<(value: any) => void> = [
      (value) => { value.covered_quotes[5].sweth_to_eth_rate_wei = null; },
      (value) => { value.covered_quotes[5].sweth_to_eth_rate_wei = "0"; },
      (value) => { value.report_context.sweth_last_reprice_unix = "3"; },
      (value) => { value.covered_quotes[5].sweth_to_eth_rate_wei = "2"; },
      (value) => { value.covered_quotes[5].share_accounting_eth_quote_wei = "701"; },
      (value) => { value.covered_quotes[5].sweth_to_eth_rate_wei = max.toString(); value.covered_quotes[5].share_accounting_token_amount = max.toString(); },
      (value) => { value.covered_quotes[4].sweth_to_eth_rate_wei = "1"; },
    ];
    for (const mutate of mutations) {
      const value = verified(); mutate(value);
      expect(EigenLayerLstEthQuotesSnapshotSchema.safeParse(value).success).toBe(false);
    }
  });

  it("requires all 22 permanent gaps and rejects reordered or partial evidence", () => {
    expect(EIGENLAYER_LST_ETH_QUOTES_PERMANENT_GAP_CODES).toHaveLength(22);
    for (const mutate of [
      (value: any) => { value.covered_quotes.reverse(); }, (value: any) => { value.coverage.quoted_strategy_count = 7; },
      (value: any) => { value.gaps.pop(); }, (value: any) => { value.covered_quotes[5].strategy = value.covered_quotes[4].strategy; },
      (value: any) => { value.covered_quotes[6].cbeth_exchange_rate_wei = "1"; },
    ]) {
      const value = verified(); mutate(value);
      expect(EigenLayerLstEthQuotesSnapshotSchema.safeParse(value).success).toBe(false);
    }
  });

  it("accepts unavailable evidence atomically and rejects every partial-evidence leak", () => {
    expect(EigenLayerLstEthQuotesSnapshotSchema.safeParse(unavailable()).success).toBe(true);
    for (const mutate of [
      (value: any) => { value.verified_block = verified().verified_block; }, (value: any) => { value.covered_quotes = verified().covered_quotes; },
      (value: any) => { value.report_context = verified().report_context; }, (value: any) => { value.metrics.covered_share_accounting_eth_equivalent_wei = "1"; },
    ]) {
      const value = unavailable(); mutate(value);
      expect(EigenLayerLstEthQuotesSnapshotSchema.safeParse(value).success).toBe(false);
    }
  });
});
