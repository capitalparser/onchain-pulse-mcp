import { describe, expect, it } from "vitest";
import {
  EIGENLAYER_COVERED_LST_STRATEGIES,
  EIGENLAYER_LST_ETH_QUOTES_PERMANENT_GAP_CODES,
  EIGENLAYER_UNQUOTED_LST_STRATEGY_BLOCKERS,
  EIGENLAYER_UNQUOTED_LST_STRATEGY_LABELS,
  EigenLayerLstEthQuotesSnapshotSchema,
} from "../../src/eigenlayer_lst_eth_quotes/types.js";

const permanentGaps = EIGENLAYER_LST_ETH_QUOTES_PERMANENT_GAP_CODES.map((code) => ({
  code,
  detail: EIGENLAYER_UNQUOTED_LST_STRATEGY_BLOCKERS.find((blocker) => blocker.code === code)?.detail ?? "bounded",
}));

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
    status: "verified", summary: "verified", methodology: "eigenlayer-covered-lst-eth-quotes-v7",
    verified_block: { number: 1, hash: `0x${"ab".repeat(32)}`, timestamp: 2 },
    covered_quotes: [
      quote(0, ["100", "90", "100", "90"], "steth_token_wei_identity_quote", "lido_pooled_eth_accounting"),
      quote(1, ["200", "180", "251", "226"], "rocket_pool_direct_aggregate_quote", "rocket_pool_network_accounting"),
      quote(2, ["301", "271", "451", "406"], "coinbase_oracle_accounting_quote", "coinbase_oracle_controlled_rate", { cbeth_exchange_rate_wei: "1500000000000000000" }),
      quote(3, ["400", "380", "460", "431"], "stader_direct_pool_accounting_quote", "stader_oracle_reported_accounting"),
      quote(4, ["800", "750", "800", "750"], "origin_oeth_vault_unit_identity_quote", "origin_vault_nominal_withdrawal_unit_accounting"),
      quote(5, ["400", "380", "460", "431"], "stakewise_v3_direct_controller_quote", "stakewise_v3_keeper_reward_accounting"),
      quote(6, ["700", "650", "700", "650"], "swell_reprice_rate_floor_quote", "swell_reprice_role_controlled_rate", { sweth_to_eth_rate_wei: "1000000000000000000" }),
      quote(7, ["600", "570", "650", "620"], "liquid_collective_river_direct_share_quote", "liquid_collective_oracle_reported_accounting"),
      quote(8, ["500", "470", "555", "521"], "mantle_staking_direct_oracle_quote", "mantle_oracle_reported_accounting"),
    ],
    report_context: {
      lseth_last_completed_epoch_id: "123", ethx_oracle_reporting_block_number: "1", sweth_last_reprice_unix: "0",
      oeth_last_rebase_unix: "0", oeth_rebase_paused: true, oeth_withdrawal_claim_delay_seconds: "0",
    },
    metrics: {
      covered_share_accounting_eth_equivalent_wei: "4427", covered_token_custody_eth_equivalent_wei: "4125",
      lst_restaked_eth_equivalent_wei: null, native_restaked_eth_wei: null, eigenlayer_eth_family_exposure_eth_wei: null,
      unique_net_eth_locked: null, combined_aave_spark_lido_sky_eigenlayer_demand: null, rehypothecation_ratio: null,
      executable_withdrawal_capacity_eth_wei: null,
    },
    identities: { covered_strategy_order_verified: true, covered_token_identities_verified: true, covered_token_decimals_verified: true, token_amounts_and_quotes_independent: true, partial_aggregates_only: true },
    coverage: {
      quoted_strategy_count: 9,
      fixed_strategy_count: 12,
      unquoted_strategy_labels: [...EIGENLAYER_UNQUOTED_LST_STRATEGY_LABELS],
      unquoted_strategy_blockers: EIGENLAYER_UNQUOTED_LST_STRATEGY_BLOCKERS.map((blocker) => ({ ...blocker })),
    },
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
  it("pins oETH as the fifth quote in the exact ordered nine-token universe", () => {
    expect(EIGENLAYER_COVERED_LST_STRATEGIES.map((strategy) => strategy.label)).toEqual(["stETH", "rETH", "cbETH", "ETHx", "oETH", "osETH", "swETH", "lsETH", "mETH"]);
    expect(EIGENLAYER_COVERED_LST_STRATEGIES[4]).toEqual({ label: "oETH", strategy: "0xa4C637e0F704745D182e4D38cAb7E7485321d059", underlying_token: "0x856c4Efb76C1D1AE02e20CEB03A2A6a08b0b8dC3", decimals: 18 });
    expect(EIGENLAYER_UNQUOTED_LST_STRATEGY_LABELS).toEqual(["ankrETH", "wBETH", "sfrxETH"]);
  });

  it("accepts one exact v7 verified 9-of-12 snapshot with immutable ordered unquoted blockers", () => {
    const snapshot = verified();
    expect(snapshot.covered_quotes[4]).toMatchObject({ label: "oETH", quote_kind: "origin_oeth_vault_unit_identity_quote", trust_basis: "origin_vault_nominal_withdrawal_unit_accounting", share_accounting_eth_quote_wei: "800", token_custody_eth_quote_wei: "750" });
    expect(snapshot.report_context).toMatchObject({ oeth_last_rebase_unix: "0", oeth_rebase_paused: true, oeth_withdrawal_claim_delay_seconds: "0" });
    expect(snapshot.coverage?.unquoted_strategy_blockers).toEqual(EIGENLAYER_UNQUOTED_LST_STRATEGY_BLOCKERS);
    expect(snapshot.coverage?.unquoted_strategy_blockers.every((blocker: { detail: string }) => blocker.detail.length <= 240)).toBe(true);
    expect(snapshot.coverage?.unquoted_strategy_blockers.slice(0, 2).every(
      (blocker: { detail: string }) => blocker.detail.startsWith("Pinned evidence does not verify"),
    )).toBe(true);
    expect(snapshot.metrics).toMatchObject({ covered_share_accounting_eth_equivalent_wei: "4427", covered_token_custody_eth_equivalent_wei: "4125", executable_withdrawal_capacity_eth_wei: null });
    expect(snapshot.gaps.map((gap: any) => gap.code)).toEqual(EIGENLAYER_LST_ETH_QUOTES_PERMANENT_GAP_CODES);
    expect(EigenLayerLstEthQuotesSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(EigenLayerLstEthQuotesSnapshotSchema.safeParse({ ...snapshot, methodology: "eigenlayer-covered-lst-eth-quotes-v6" }).success).toBe(false);
  });

  it("accepts zero OETH context, paused true, and delay zero without implying redeemability", () => {
    const value = verified();
    value.covered_quotes[4].share_accounting_token_amount = "0"; value.covered_quotes[4].share_accounting_eth_quote_wei = "0";
    value.covered_quotes[4].token_custody_token_amount = "0"; value.covered_quotes[4].token_custody_eth_quote_wei = "0";
    value.metrics.covered_share_accounting_eth_equivalent_wei = "3627"; value.metrics.covered_token_custody_eth_equivalent_wei = "3375";
    expect(EigenLayerLstEthQuotesSnapshotSchema.safeParse(value).success).toBe(true);
  });

  it("rejects future OETH rebase, non-identity quotes, rate material, reordered evidence, or blocker mutation", () => {
    const mutations: Array<(value: any) => void> = [
      (value) => { value.report_context.oeth_last_rebase_unix = "3"; },
      (value) => { value.covered_quotes[4].share_accounting_eth_quote_wei = "801"; },
      (value) => { value.covered_quotes[4].sweth_to_eth_rate_wei = "1"; },
      (value) => { value.covered_quotes[4].quote_kind = "steth_token_wei_identity_quote"; },
      (value) => { value.covered_quotes.reverse(); },
      (value) => { value.covered_quotes[4].strategy = value.covered_quotes[5].strategy; },
      (value) => { value.coverage.unquoted_strategy_blockers[0].code = "sfrxeth_quote_terminates_in_frxeth_not_eth"; },
      (value) => { value.coverage.unquoted_strategy_blockers.reverse(); },
      (value) => { value.coverage.unquoted_strategy_blockers[1].detail = "mutated"; },
      (value) => { value.coverage.unquoted_strategy_blockers[2].detail = "x".repeat(241); },
    ];
    for (const mutate of mutations) { const value = verified(); mutate(value); expect(EigenLayerLstEthQuotesSnapshotSchema.safeParse(value).success).toBe(false); }
  });

  it("preserves full-precision swETH behavior at its shifted index", () => {
    const value = verified(); const max = (2n ** 256n) - 1n;
    const amount = max - 3727n;
    value.covered_quotes[6].share_accounting_token_amount = amount.toString(); value.covered_quotes[6].share_accounting_eth_quote_wei = amount.toString();
    value.covered_quotes[6].token_custody_token_amount = "0"; value.covered_quotes[6].token_custody_eth_quote_wei = "0";
    value.metrics.covered_share_accounting_eth_equivalent_wei = max.toString(); value.metrics.covered_token_custody_eth_equivalent_wei = "3475";
    expect(EigenLayerLstEthQuotesSnapshotSchema.safeParse(value).success).toBe(true);
  });

  it("requires all 29 permanent gaps including the exact three quote ceilings and rejects partial evidence", () => {
    expect(EIGENLAYER_LST_ETH_QUOTES_PERMANENT_GAP_CODES).toHaveLength(29);
    expect(EIGENLAYER_LST_ETH_QUOTES_PERMANENT_GAP_CODES.slice(-3)).toEqual([
      "ankreth_official_immutable_source_and_freshness_not_verified",
      "wbeth_official_immutable_source_proxy_and_freshness_not_verified",
      "sfrxeth_quote_terminates_in_frxeth_not_eth",
    ]);
    for (const mutate of [(value: any) => { value.gaps.pop(); }, (value: any) => { value.coverage.quoted_strategy_count = 8; }, (value: any) => { delete value.report_context.oeth_rebase_paused; }]) {
      const value = verified(); mutate(value); expect(EigenLayerLstEthQuotesSnapshotSchema.safeParse(value).success).toBe(false);
    }
  });

  it("rejects a ceiling permanent gap whose detail does not match its canonical blocker", () => {
    const value = verified();
    const gap = value.gaps.find(({ code }: { code: string }) => code === "ankreth_official_immutable_source_and_freshness_not_verified");
    gap.detail = "bounded but mismatched";
    expect(EigenLayerLstEthQuotesSnapshotSchema.safeParse(value).success).toBe(false);
  });

  it("accepts unavailable evidence atomically and rejects partial-evidence leaks", () => {
    expect(EigenLayerLstEthQuotesSnapshotSchema.safeParse(unavailable()).success).toBe(true);
    for (const mutate of [(value: any) => { value.verified_block = verified().verified_block; }, (value: any) => { value.covered_quotes = verified().covered_quotes; }, (value: any) => { value.report_context = verified().report_context; }]) {
      const value = unavailable(); mutate(value); expect(EigenLayerLstEthQuotesSnapshotSchema.safeParse(value).success).toBe(false);
    }
  });
});
