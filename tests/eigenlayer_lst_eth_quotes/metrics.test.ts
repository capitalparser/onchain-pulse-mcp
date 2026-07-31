import { describe, expect, it } from "vitest";
import {
  buildUnavailableEigenLayerLstEthQuotesSnapshot,
  buildVerifiedEigenLayerLstEthQuotesSnapshot,
  EigenLayerLstEthQuotesDomainError,
} from "../../src/eigenlayer_lst_eth_quotes/metrics.js";
import {
  EIGENLAYER_LST_ETH_QUOTES_PERMANENT_GAP_CODES,
  EIGENLAYER_UNQUOTED_LST_STRATEGY_LABELS,
} from "../../src/eigenlayer_lst_eth_quotes/types.js";

const sourceStatus = [{ source: "ethereum_rpc" as const, role: "eigenlayer_finalized_lst_eth_quote_evidence" as const, stale: false }];
const block = { number: 1, hash: `0x${"ab".repeat(32)}`, timestamp: 2 };
const expectedStrategies = [
  { label: "stETH", strategy: "0x93c4b944D05dfe6df7645A86cd2206016c51564D", underlying_token: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84", decimals: 18 },
  { label: "rETH", strategy: "0x1BeE69b7dFFfA4E2d53C2a2Df135C388AD25dCD2", underlying_token: "0xae78736Cd615f374D3085123A210448E74Fc6393", decimals: 18 },
  { label: "cbETH", strategy: "0x54945180dB7943c0ed0FEE7EdaB2Bd24620256bc", underlying_token: "0xBe9895146f7AF43049ca1c1AE358B0541Ea49704", decimals: 18 },
  { label: "osETH", strategy: "0x57ba429517c3473B6d34CA9aCd56c0e735b94c02", underlying_token: "0xf1C9acDc66974dFB6dEcB12aA385b9cD01190E38", decimals: 18 },
  { label: "mETH", strategy: "0x298aFB19A105D59E74658C4C334Ff360BadE6dd2", underlying_token: "0xd5F7838F5C461fefF7FE49ea5ebaF7728bB0ADfa", decimals: 18 },
] as const;

function quotes(): any[] {
  return [
    { ...expectedStrategies[0], underlyingToken: expectedStrategies[0].underlying_token, shareAccountingTokenAmount: 100n, tokenCustodyTokenAmount: 90n },
    { ...expectedStrategies[1], underlyingToken: expectedStrategies[1].underlying_token, shareAccountingTokenAmount: 200n, tokenCustodyTokenAmount: 180n, directShareAccountingEthQuote: 251n, directTokenCustodyEthQuote: 226n },
    { ...expectedStrategies[2], underlyingToken: expectedStrategies[2].underlying_token, shareAccountingTokenAmount: 301n, tokenCustodyTokenAmount: 271n, cbethExchangeRate: 1_500_000_000_000_000_000n },
    { ...expectedStrategies[3], underlyingToken: expectedStrategies[3].underlying_token, shareAccountingTokenAmount: 400n, tokenCustodyTokenAmount: 380n, directShareAccountingEthQuote: 460n, directTokenCustodyEthQuote: 431n },
    { ...expectedStrategies[4], underlyingToken: expectedStrategies[4].underlying_token, shareAccountingTokenAmount: 500n, tokenCustodyTokenAmount: 470n, directShareAccountingEthQuote: 555n, directTokenCustodyEthQuote: 521n },
  ];
}

function build(candidate = quotes()) {
  return buildVerifiedEigenLayerLstEthQuotesSnapshot({ block, quotes: candidate, sources: ["ethereum_rpc"], sourceStatus });
}

describe("EigenLayer covered LST ETH quote metrics", () => {
  it("computes exact five-token independent/direct/floor quotes and partial sums", () => {
    const snapshot = build();
    expect(snapshot.methodology).toBe("eigenlayer-covered-lst-eth-quotes-v2");
    expect(snapshot.covered_quotes.map((quote) => ({ label: quote.label, share: quote.share_accounting_eth_quote_wei, custody: quote.token_custody_eth_quote_wei, kind: quote.quote_kind, trust: quote.trust_basis }))).toEqual([
      { label: "stETH", share: "100", custody: "90", kind: "steth_token_wei_identity_quote", trust: "lido_pooled_eth_accounting" },
      { label: "rETH", share: "251", custody: "226", kind: "rocket_pool_direct_aggregate_quote", trust: "rocket_pool_network_accounting" },
      { label: "cbETH", share: "451", custody: "406", kind: "coinbase_oracle_accounting_quote", trust: "coinbase_oracle_controlled_rate" },
      { label: "osETH", share: "460", custody: "431", kind: "stakewise_v3_direct_controller_quote", trust: "stakewise_v3_keeper_reward_accounting" },
      { label: "mETH", share: "555", custody: "521", kind: "mantle_staking_direct_oracle_quote", trust: "mantle_oracle_reported_accounting" },
    ]);
    expect(snapshot.metrics).toEqual({
      covered_share_accounting_eth_equivalent_wei: "1817", covered_token_custody_eth_equivalent_wei: "1674",
      lst_restaked_eth_equivalent_wei: null, native_restaked_eth_wei: null,
      eigenlayer_eth_family_exposure_eth_wei: null, unique_net_eth_locked: null,
      combined_aave_spark_lido_sky_eigenlayer_demand: null, rehypothecation_ratio: null,
      executable_withdrawal_capacity_eth_wei: null,
    });
    expect(snapshot.coverage).toEqual({ quoted_strategy_count: 5, fixed_strategy_count: 12, unquoted_strategy_labels: EIGENLAYER_UNQUOTED_LST_STRATEGY_LABELS });
    expect(snapshot.gaps.map((gap) => gap.code)).toEqual(EIGENLAYER_LST_ETH_QUOTES_PERMANENT_GAP_CODES);
  });

  it("accepts coherent all-zero token amounts and direct quotes with a nonzero cbETH rate", () => {
    const zero = quotes();
    for (const quote of zero) {
      quote.shareAccountingTokenAmount = 0n; quote.tokenCustodyTokenAmount = 0n;
      if ("directShareAccountingEthQuote" in quote) quote.directShareAccountingEthQuote = 0n;
      if ("directTokenCustodyEthQuote" in quote) quote.directTokenCustodyEthQuote = 0n;
    }
    zero[2]!.cbethExchangeRate = 1n;
    const snapshot = build(zero);
    expect(snapshot.metrics.covered_share_accounting_eth_equivalent_wei).toBe("0");
    expect(snapshot.metrics.covered_token_custody_eth_equivalent_wei).toBe("0");
  });

  it("fails closed for reordered, substituted, duplicate, non-18-decimal, or incomplete inputs", () => {
    const mutations: Array<(value: any[]) => void> = [
      (value) => { value.reverse(); }, (value) => { value[3] = { ...value[4] }; },
      (value) => { value[4]!.strategy = value[3]!.strategy; },
      (value) => { value[3]!.underlyingToken = value[4]!.underlyingToken; },
      (value) => { value[4]!.decimals = 17; }, (value) => { value.pop(); },
    ];
    for (const mutate of mutations) {
      const candidate = quotes(); mutate(candidate);
      expect(() => build(candidate)).toThrow(EigenLayerLstEthQuotesDomainError);
    }
  });

  it("requires independent direct rETH, osETH, and mETH aggregate results without rate material", () => {
    for (const mutate of [
      (value: any[]) => { delete value[1]!.directShareAccountingEthQuote; },
      (value: any[]) => { delete value[3]!.directTokenCustodyEthQuote; },
      (value: any[]) => { delete value[4]!.directShareAccountingEthQuote; },
      (value: any[]) => { value[3]!.cbethExchangeRate = 1n; },
      (value: any[]) => { value[4]!.cbethExchangeRate = 1n; },
      (value: any[]) => { value[4]!.rethExchangeRate = 1n; },
      (value: any[]) => { value[4]!.fabricatedConversionRate = 1n; },
    ]) {
      const candidate = quotes(); mutate(candidate);
      expect(() => build(candidate)).toThrow(EigenLayerLstEthQuotesDomainError);
    }
  });

  it("rejects negative, missing, malformed, non-bigint, uint256, product, or partial-sum overflow", () => {
    const max = (2n ** 256n) - 1n;
    const mutations: Array<(value: any[]) => void> = [
      (value) => { value[3]!.shareAccountingTokenAmount = -1n; },
      (value) => { delete value[4]!.directTokenCustodyEthQuote; },
      (value) => { value[3]!.directShareAccountingEthQuote = "460"; },
      (value) => { value[4]!.directTokenCustodyEthQuote = 460; },
      (value) => { value[4]!.directShareAccountingEthQuote = 2n ** 256n; },
      (value) => { value[2]!.cbethExchangeRate = 0n; },
      (value) => { value[2]!.shareAccountingTokenAmount = max; value[2]!.cbethExchangeRate = 2n; },
      (value) => { value[0]!.shareAccountingTokenAmount = max; value[1]!.directShareAccountingEthQuote = 1n; },
    ];
    for (const mutate of mutations) {
      const candidate = quotes(); mutate(candidate);
      expect(() => build(candidate)).toThrow(EigenLayerLstEthQuotesDomainError);
    }
  });

  it("rejects caller-supplied stETH/cbETH quote results and keeps stale and unavailable evidence bounded", () => {
    const steth = quotes(); steth[0]!.directShareAccountingEthQuote = 101n;
    const cbeth = quotes(); cbeth[2]!.directTokenCustodyEthQuote = 999n;
    expect(() => build(steth)).toThrow(EigenLayerLstEthQuotesDomainError);
    expect(() => build(cbeth)).toThrow(EigenLayerLstEthQuotesDomainError);
    const stale = buildVerifiedEigenLayerLstEthQuotesSnapshot({ block, quotes: quotes(), sources: ["ethereum_rpc"], sourceStatus, stale: true });
    expect(stale.gaps.filter((gap) => gap.code === "source_stale")).toHaveLength(1);
    const unavailable = buildUnavailableEigenLayerLstEthQuotesSnapshot({ summary: "unavailable", gaps: [{ code: "rpc_access_gap", detail: "bounded" }], sources: ["ethereum_rpc"], sourceStatus });
    expect(unavailable).toMatchObject({ status: "unavailable", verified_block: null, covered_quotes: [], identities: null, coverage: null });
  });
});
