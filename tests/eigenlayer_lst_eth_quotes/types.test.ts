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
    methodology: "eigenlayer-covered-lst-eth-quotes-v1",
    verified_block: { number: 1, hash: `0x${"ab".repeat(32)}`, timestamp: 2 },
    covered_quotes: [
      {
        ...EIGENLAYER_COVERED_LST_STRATEGIES[0],
        share_accounting_token_amount: "100",
        token_custody_token_amount: "90",
        quote_kind: "steth_token_wei_identity_quote",
        trust_basis: "lido_pooled_eth_accounting",
        share_accounting_eth_quote_wei: "100",
        token_custody_eth_quote_wei: "90",
        cbeth_exchange_rate_wei: null,
      },
      {
        ...EIGENLAYER_COVERED_LST_STRATEGIES[1],
        share_accounting_token_amount: "200",
        token_custody_token_amount: "180",
        quote_kind: "rocket_pool_direct_aggregate_quote",
        trust_basis: "rocket_pool_network_accounting",
        share_accounting_eth_quote_wei: "250",
        token_custody_eth_quote_wei: "225",
        cbeth_exchange_rate_wei: null,
      },
      {
        ...EIGENLAYER_COVERED_LST_STRATEGIES[2],
        share_accounting_token_amount: "300",
        token_custody_token_amount: "270",
        quote_kind: "coinbase_oracle_accounting_quote",
        trust_basis: "coinbase_oracle_controlled_rate",
        share_accounting_eth_quote_wei: "450",
        token_custody_eth_quote_wei: "405",
        cbeth_exchange_rate_wei: "1500000000000000000",
      },
    ],
    metrics: {
      covered_share_accounting_eth_equivalent_wei: "800",
      covered_token_custody_eth_equivalent_wei: "720",
      lst_restaked_eth_equivalent_wei: null,
      native_restaked_eth_wei: null,
      eigenlayer_eth_family_exposure_eth_wei: null,
      unique_net_eth_locked: null,
      combined_aave_spark_lido_sky_eigenlayer_demand: null,
      rehypothecation_ratio: null,
      executable_withdrawal_capacity_eth_wei: null,
    },
    identities: {
      covered_strategy_order_verified: true,
      covered_token_identities_verified: true,
      covered_token_decimals_verified: true,
      token_amounts_and_quotes_independent: true,
      partial_aggregates_only: true,
    },
    coverage: {
      quoted_strategy_count: 3,
      fixed_strategy_count: 12,
      unquoted_strategy_labels: [...EIGENLAYER_UNQUOTED_LST_STRATEGY_LABELS],
    },
    sources: ["ethereum_rpc"],
    source_status: [{ source: "ethereum_rpc", role: "eigenlayer_finalized_lst_eth_quote_evidence", stale: false }],
    gaps: permanentGaps.map((gap) => ({ ...gap })),
    capabilities: { ethereum_rpc_active: true },
  };
}

function unavailable(): any {
  const value = verified();
  return {
    ...value,
    status: "unavailable",
    summary: "unavailable",
    verified_block: null,
    covered_quotes: [],
    metrics: {
      ...value.metrics,
      covered_share_accounting_eth_equivalent_wei: null,
      covered_token_custody_eth_equivalent_wei: null,
    },
    identities: null,
    coverage: null,
    gaps: [{ code: "rpc_access_gap", detail: "bounded" }],
    capabilities: { ethereum_rpc_active: false },
  };
}

describe("EigenLayer covered LST ETH quote domain", () => {
  it("pins the exact ordered stETH, rETH, and cbETH strategy-token universe", () => {
    expect(EIGENLAYER_COVERED_LST_STRATEGIES).toEqual([
      {
        label: "stETH",
        strategy: "0x93c4b944D05dfe6df7645A86cd2206016c51564D",
        underlying_token: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
        decimals: 18,
      },
      {
        label: "rETH",
        strategy: "0x1BeE69b7dFFfA4E2d53C2a2Df135C388AD25dCD2",
        underlying_token: "0xae78736Cd615f374D3085123A210448E74Fc6393",
        decimals: 18,
      },
      {
        label: "cbETH",
        strategy: "0x54945180dB7943c0ed0FEE7EdaB2Bd24620256bc",
        underlying_token: "0xBe9895146f7AF43049ca1c1AE358B0541Ea49704",
        decimals: 18,
      },
    ]);
  });

  it("accepts one exact fresh verified 3-of-12 partial quote snapshot", () => {
    expect(EIGENLAYER_UNQUOTED_LST_STRATEGY_LABELS).toEqual([
      "ETHx", "ankrETH", "oETH", "osETH", "swETH", "wBETH", "sfrxETH", "lsETH", "mETH",
    ]);
    expect(EigenLayerLstEthQuotesSnapshotSchema.safeParse(verified()).success).toBe(true);
  });

  it("rejects reordered, substituted, non-18-decimal, duplicate, or fabricated quote evidence", () => {
    const mutations: Array<(value: ReturnType<typeof verified>) => void> = [
      (value) => { value.covered_quotes.reverse(); },
      (value) => { value.covered_quotes[1]!.label = "stETH"; },
      (value) => { value.covered_quotes[0]!.underlying_token = value.covered_quotes[1]!.underlying_token; },
      (value) => { value.covered_quotes[2]!.strategy = value.covered_quotes[1]!.strategy; },
      (value) => { value.covered_quotes[0]!.decimals = 17; },
      (value) => { value.covered_quotes[0]!.share_accounting_eth_quote_wei = "101"; },
      (value) => { value.covered_quotes[2]!.share_accounting_eth_quote_wei = "451"; },
      (value) => { value.metrics.covered_share_accounting_eth_equivalent_wei = "801"; },
      (value) => { value.coverage.unquoted_strategy_labels.reverse(); },
    ];
    for (const mutate of mutations) {
      const value = verified();
      mutate(value);
      expect(() => EigenLayerLstEthQuotesSnapshotSchema.safeParse(value)).not.toThrow();
      expect(EigenLayerLstEthQuotesSnapshotSchema.safeParse(value).success).toBe(false);
    }
  });

  it("rejects malformed or overflowed public uint256 values without throwing", () => {
    const mutations: Array<(value: ReturnType<typeof verified>) => void> = [
      (value) => { value.covered_quotes[0]!.share_accounting_token_amount = "01"; },
      (value) => { value.covered_quotes[0]!.token_custody_token_amount = (2n ** 256n).toString(); },
      (value) => { value.covered_quotes[2]!.cbeth_exchange_rate_wei = "0"; },
      (value) => { value.verified_block.number = Number.MAX_SAFE_INTEGER + 1; },
      (value) => { value.summary = "x".repeat(501); },
      (value) => { value.gaps[0]!.detail = "x".repeat(241); },
    ];
    for (const mutate of mutations) {
      const value = verified();
      mutate(value);
      expect(() => EigenLayerLstEthQuotesSnapshotSchema.safeParse(value)).not.toThrow();
      expect(EigenLayerLstEthQuotesSnapshotSchema.safeParse(value).success).toBe(false);
    }
  });

  it("requires every permanent gap and exactly one coherent stale marker", () => {
    const stale = verified();
    stale.source_status[0]!.stale = true;
    stale.gaps.push({ code: "source_stale", detail: "cached" });
    expect(EigenLayerLstEthQuotesSnapshotSchema.safeParse(stale).success).toBe(true);

    const mutations: Array<(value: ReturnType<typeof verified>) => void> = [
      (value) => { value.gaps.pop(); },
      (value) => { value.gaps.push({ ...value.gaps[0]! }); },
      (value) => { value.source_status[0]!.stale = true; },
      (value) => { value.gaps.push({ code: "rpc_access_gap", detail: "not verified evidence" }); },
      (value) => { value.capabilities.ethereum_rpc_active = false; },
      (value) => { value.coverage.quoted_strategy_count = 2; },
    ];
    for (const mutate of mutations) {
      const value = verified();
      mutate(value);
      expect(EigenLayerLstEthQuotesSnapshotSchema.safeParse(value).success).toBe(false);
    }
  });

  it("accepts unavailable evidence atomically and rejects every partial-evidence leak", () => {
    expect(EigenLayerLstEthQuotesSnapshotSchema.safeParse(unavailable()).success).toBe(true);
    const noRpc = unavailable();
    noRpc.gaps = [{ code: "rpc_not_configured", detail: "not configured" }];
    noRpc.sources = [];
    noRpc.source_status = [];
    expect(EigenLayerLstEthQuotesSnapshotSchema.safeParse(noRpc).success).toBe(true);

    const mutations: Array<(value: ReturnType<typeof unavailable>) => void> = [
      (value) => { value.verified_block = verified().verified_block; },
      (value) => { value.covered_quotes = verified().covered_quotes; },
      (value) => { value.metrics.covered_share_accounting_eth_equivalent_wei = "1"; },
      (value) => { value.identities = verified().identities; },
      (value) => { value.coverage = verified().coverage; },
      (value) => { value.gaps.push({ code: "rpc_schema_drift", detail: "second" }); },
      (value) => { value.source_status[0]!.stale = true; },
      (value) => { value.capabilities.ethereum_rpc_active = true; },
    ];
    for (const mutate of mutations) {
      const value = unavailable();
      mutate(value);
      expect(EigenLayerLstEthQuotesSnapshotSchema.safeParse(value).success).toBe(false);
    }
  });
});
