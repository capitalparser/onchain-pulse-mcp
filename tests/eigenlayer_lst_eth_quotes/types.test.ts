import { describe, expect, it } from "vitest";
import {
  EIGENLAYER_COVERED_LST_STRATEGIES,
  EIGENLAYER_LST_ETH_QUOTES_PERMANENT_GAP_CODES,
  EIGENLAYER_UNQUOTED_LST_STRATEGY_LABELS,
  EigenLayerLstEthQuotesSnapshotSchema,
} from "../../src/eigenlayer_lst_eth_quotes/types.js";

const permanentGaps = EIGENLAYER_LST_ETH_QUOTES_PERMANENT_GAP_CODES.map((code) => ({ code, detail: "bounded" }));

function verified(): any {
  return {
    status: "verified",
    summary: "verified",
    methodology: "eigenlayer-covered-lst-eth-quotes-v3",
    verified_block: { number: 1, hash: `0x${"ab".repeat(32)}`, timestamp: 2 },
    covered_quotes: [
      { ...EIGENLAYER_COVERED_LST_STRATEGIES[0], share_accounting_token_amount: "100", token_custody_token_amount: "90", quote_kind: "steth_token_wei_identity_quote", trust_basis: "lido_pooled_eth_accounting", share_accounting_eth_quote_wei: "100", token_custody_eth_quote_wei: "90", cbeth_exchange_rate_wei: null },
      { ...EIGENLAYER_COVERED_LST_STRATEGIES[1], share_accounting_token_amount: "200", token_custody_token_amount: "180", quote_kind: "rocket_pool_direct_aggregate_quote", trust_basis: "rocket_pool_network_accounting", share_accounting_eth_quote_wei: "251", token_custody_eth_quote_wei: "226", cbeth_exchange_rate_wei: null },
      { ...EIGENLAYER_COVERED_LST_STRATEGIES[2], share_accounting_token_amount: "301", token_custody_token_amount: "271", quote_kind: "coinbase_oracle_accounting_quote", trust_basis: "coinbase_oracle_controlled_rate", share_accounting_eth_quote_wei: "451", token_custody_eth_quote_wei: "406", cbeth_exchange_rate_wei: "1500000000000000000" },
      { ...EIGENLAYER_COVERED_LST_STRATEGIES[3], share_accounting_token_amount: "400", token_custody_token_amount: "380", quote_kind: "stakewise_v3_direct_controller_quote", trust_basis: "stakewise_v3_keeper_reward_accounting", share_accounting_eth_quote_wei: "460", token_custody_eth_quote_wei: "431", cbeth_exchange_rate_wei: null },
      { ...EIGENLAYER_COVERED_LST_STRATEGIES[4], share_accounting_token_amount: "600", token_custody_token_amount: "570", quote_kind: "liquid_collective_river_direct_share_quote", trust_basis: "liquid_collective_oracle_reported_accounting", share_accounting_eth_quote_wei: "650", token_custody_eth_quote_wei: "620", cbeth_exchange_rate_wei: null },
      { ...EIGENLAYER_COVERED_LST_STRATEGIES[5], share_accounting_token_amount: "500", token_custody_token_amount: "470", quote_kind: "mantle_staking_direct_oracle_quote", trust_basis: "mantle_oracle_reported_accounting", share_accounting_eth_quote_wei: "555", token_custody_eth_quote_wei: "521", cbeth_exchange_rate_wei: null },
    ],
    report_context: { lseth_last_completed_epoch_id: "123" },
    metrics: {
      covered_share_accounting_eth_equivalent_wei: "2467", covered_token_custody_eth_equivalent_wei: "2294",
      lst_restaked_eth_equivalent_wei: null, native_restaked_eth_wei: null,
      eigenlayer_eth_family_exposure_eth_wei: null, unique_net_eth_locked: null,
      combined_aave_spark_lido_sky_eigenlayer_demand: null, rehypothecation_ratio: null,
      executable_withdrawal_capacity_eth_wei: null,
    },
    identities: { covered_strategy_order_verified: true, covered_token_identities_verified: true, covered_token_decimals_verified: true, token_amounts_and_quotes_independent: true, partial_aggregates_only: true },
    coverage: { quoted_strategy_count: 6, fixed_strategy_count: 12, unquoted_strategy_labels: [...EIGENLAYER_UNQUOTED_LST_STRATEGY_LABELS] },
    sources: ["ethereum_rpc"],
    source_status: [{ source: "ethereum_rpc", role: "eigenlayer_finalized_lst_eth_quote_evidence", stale: false }],
    gaps: permanentGaps.map((gap) => ({ ...gap })),
    capabilities: { ethereum_rpc_active: true },
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
  it("pins the exact ordered six-token strategy-token universe", () => {
    expect(EIGENLAYER_COVERED_LST_STRATEGIES).toEqual([
      { label: "stETH", strategy: "0x93c4b944D05dfe6df7645A86cd2206016c51564D", underlying_token: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84", decimals: 18 },
      { label: "rETH", strategy: "0x1BeE69b7dFFfA4E2d53C2a2Df135C388AD25dCD2", underlying_token: "0xae78736Cd615f374D3085123A210448E74Fc6393", decimals: 18 },
      { label: "cbETH", strategy: "0x54945180dB7943c0ed0FEE7EdaB2Bd24620256bc", underlying_token: "0xBe9895146f7AF43049ca1c1AE358B0541Ea49704", decimals: 18 },
      { label: "osETH", strategy: "0x57ba429517c3473B6d34CA9aCd56c0e735b94c02", underlying_token: "0xf1C9acDc66974dFB6dEcB12aA385b9cD01190E38", decimals: 18 },
      { label: "lsETH", strategy: "0xAe60d8180437b5C34bB956822ac2710972584473", underlying_token: "0x8c1BEd5b9a0928467c9B1341Da1D7BD5e10b6549", decimals: 18 },
      { label: "mETH", strategy: "0x298aFB19A105D59E74658C4C334Ff360BadE6dd2", underlying_token: "0xd5F7838F5C461fefF7FE49ea5ebaF7728bB0ADfa", decimals: 18 },
    ]);
  });

  it("accepts one exact v3 verified 6-of-12 snapshot with direct lsETH conversions and report context", () => {
    const snapshot = verified();
    expect(EIGENLAYER_UNQUOTED_LST_STRATEGY_LABELS).toEqual(["ETHx", "ankrETH", "oETH", "swETH", "wBETH", "sfrxETH"]);
    expect(snapshot.covered_quotes.map((quote: any) => [quote.label, quote.quote_kind, quote.trust_basis, quote.share_accounting_eth_quote_wei, quote.token_custody_eth_quote_wei])).toEqual([
      ["stETH", "steth_token_wei_identity_quote", "lido_pooled_eth_accounting", "100", "90"], ["rETH", "rocket_pool_direct_aggregate_quote", "rocket_pool_network_accounting", "251", "226"], ["cbETH", "coinbase_oracle_accounting_quote", "coinbase_oracle_controlled_rate", "451", "406"], ["osETH", "stakewise_v3_direct_controller_quote", "stakewise_v3_keeper_reward_accounting", "460", "431"], ["lsETH", "liquid_collective_river_direct_share_quote", "liquid_collective_oracle_reported_accounting", "650", "620"], ["mETH", "mantle_staking_direct_oracle_quote", "mantle_oracle_reported_accounting", "555", "521"],
    ]);
    expect(snapshot.methodology).toBe("eigenlayer-covered-lst-eth-quotes-v3");
    expect(snapshot.report_context).toEqual({ lseth_last_completed_epoch_id: "123" });
    expect(snapshot.coverage).toEqual({ quoted_strategy_count: 6, fixed_strategy_count: 12, unquoted_strategy_labels: [...EIGENLAYER_UNQUOTED_LST_STRATEGY_LABELS] });
    expect(snapshot.metrics.covered_share_accounting_eth_equivalent_wei).toBe("2467");
    expect(snapshot.metrics.covered_token_custody_eth_equivalent_wei).toBe("2294");
    expect(snapshot.gaps.map((gap: any) => gap.code)).toEqual(EIGENLAYER_LST_ETH_QUOTES_PERMANENT_GAP_CODES);
    expect(EigenLayerLstEthQuotesSnapshotSchema.safeParse(snapshot).success).toBe(true);
  });

  it("accepts zero direct lsETH results and epoch zero without inventing a rate", () => {
    const zero = verified();
    for (const quote of zero.covered_quotes) {
      quote.share_accounting_token_amount = "0"; quote.token_custody_token_amount = "0";
      quote.share_accounting_eth_quote_wei = "0"; quote.token_custody_eth_quote_wei = "0";
    }
    zero.covered_quotes[2]!.cbeth_exchange_rate_wei = "1";
    zero.report_context.lseth_last_completed_epoch_id = "0";
    zero.metrics.covered_share_accounting_eth_equivalent_wei = "0";
    zero.metrics.covered_token_custody_eth_equivalent_wei = "0";
    expect(EigenLayerLstEthQuotesSnapshotSchema.safeParse(zero).success).toBe(true);
  });

  it("rejects reordered, substituted, duplicate, invalid context, non-18-decimal, or fabricated six-token public evidence", () => {
    const mutations: Array<(value: ReturnType<typeof verified>) => void> = [
      (value) => { value.covered_quotes.reverse(); }, (value) => { value.covered_quotes[4]!.label = "mETH"; },
      (value) => { value.covered_quotes[5]!.strategy = value.covered_quotes[4]!.strategy; }, (value) => { value.covered_quotes[4]!.underlying_token = value.covered_quotes[5]!.underlying_token; },
      (value) => { value.covered_quotes[4]!.decimals = 17; }, (value) => { value.covered_quotes[4]!.cbeth_exchange_rate_wei = "1"; },
      (value) => { value.covered_quotes[4]!.quote_kind = "rocket_pool_direct_aggregate_quote"; }, (value) => { value.covered_quotes[4]!.direct_share_accounting_eth_quote = "650"; },
      (value) => { value.report_context.lseth_last_completed_epoch_id = "01"; }, (value) => { value.metrics.covered_share_accounting_eth_equivalent_wei = "2468"; },
      (value) => { value.coverage.quoted_strategy_count = 5; }, (value) => { value.coverage.unquoted_strategy_labels.reverse(); },
    ];
    for (const mutate of mutations) {
      const value = verified(); mutate(value);
      expect(EigenLayerLstEthQuotesSnapshotSchema.safeParse(value).success).toBe(false);
    }
  });

  it("requires every v3 permanent gap and a coherent stale marker", () => {
    const stale = verified(); stale.source_status[0]!.stale = true; stale.gaps.push({ code: "source_stale", detail: "cached" });
    expect(EigenLayerLstEthQuotesSnapshotSchema.safeParse(stale).success).toBe(true);
    for (const mutate of [
      (value: any) => { value.gaps.pop(); }, (value: any) => { value.gaps.push({ ...value.gaps[0] }); },
      (value: any) => { value.source_status[0].stale = true; }, (value: any) => { value.gaps.push({ code: "rpc_access_gap", detail: "not verified evidence" }); },
    ]) {
      const value = verified(); mutate(value); expect(EigenLayerLstEthQuotesSnapshotSchema.safeParse(value).success).toBe(false);
    }
  });

  it("accepts unavailable evidence atomically and rejects every partial-evidence leak", () => {
    expect(EigenLayerLstEthQuotesSnapshotSchema.safeParse(unavailable()).success).toBe(true);
    const noRpc = unavailable(); noRpc.gaps = [{ code: "rpc_not_configured", detail: "not configured" }]; noRpc.sources = []; noRpc.source_status = [];
    expect(EigenLayerLstEthQuotesSnapshotSchema.safeParse(noRpc).success).toBe(true);
    for (const mutate of [
      (value: any) => { value.verified_block = verified().verified_block; }, (value: any) => { value.covered_quotes = verified().covered_quotes; },
      (value: any) => { value.report_context = verified().report_context; }, (value: any) => { value.metrics.covered_share_accounting_eth_equivalent_wei = "1"; },
      (value: any) => { value.identities = verified().identities; }, (value: any) => { value.coverage = verified().coverage; },
    ]) {
      const value = unavailable(); mutate(value); expect(EigenLayerLstEthQuotesSnapshotSchema.safeParse(value).success).toBe(false);
    }
  });
});
