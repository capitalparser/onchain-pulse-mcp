import { describe, expect, it } from "vitest";
import { buildUnavailableEigenLayerLstEthQuotesSnapshot, buildVerifiedEigenLayerLstEthQuotesSnapshot, EigenLayerLstEthQuotesDomainError } from "../../src/eigenlayer_lst_eth_quotes/metrics.js";
import { EIGENLAYER_LST_ETH_QUOTES_PERMANENT_GAP_CODES, EIGENLAYER_UNQUOTED_LST_STRATEGY_LABELS } from "../../src/eigenlayer_lst_eth_quotes/types.js";

const sourceStatus = [{ source: "ethereum_rpc" as const, role: "eigenlayer_finalized_lst_eth_quote_evidence" as const, stale: false }];
const block = { number: 1, hash: `0x${"ab".repeat(32)}`, timestamp: 2 };
const expectedStrategies = [
  { label: "stETH", strategy: "0x93c4b944D05dfe6df7645A86cd2206016c51564D", underlying_token: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84", decimals: 18 },
  { label: "rETH", strategy: "0x1BeE69b7dFFfA4E2d53C2a2Df135C388AD25dCD2", underlying_token: "0xae78736Cd615f374D3085123A210448E74Fc6393", decimals: 18 },
  { label: "cbETH", strategy: "0x54945180dB7943c0ed0FEE7EdaB2Bd24620256bc", underlying_token: "0xBe9895146f7AF43049ca1c1AE358B0541Ea49704", decimals: 18 },
  { label: "ETHx", strategy: "0x9d7eD45EE2E8FC5482fa2428f15C971e6369011d", underlying_token: "0xA35b1B31Ce002FBF2058D22F30f95D405200A15b", decimals: 18 },
  { label: "osETH", strategy: "0x57ba429517c3473B6d34CA9aCd56c0e735b94c02", underlying_token: "0xf1C9acDc66974dFB6dEcB12aA385b9cD01190E38", decimals: 18 },
  { label: "lsETH", strategy: "0xAe60d8180437b5C34bB956822ac2710972584473", underlying_token: "0x8c1BEd5b9a0928467c9B1341Da1D7BD5e10b6549", decimals: 18 },
  { label: "mETH", strategy: "0x298aFB19A105D59E74658C4C334Ff360BadE6dd2", underlying_token: "0xd5F7838F5C461fefF7FE49ea5ebaF7728bB0ADfa", decimals: 18 },
] as const;

function quotes(): any[] {
  return [
    { ...expectedStrategies[0], underlyingToken: expectedStrategies[0].underlying_token, shareAccountingTokenAmount: 100n, tokenCustodyTokenAmount: 90n },
    { ...expectedStrategies[1], underlyingToken: expectedStrategies[1].underlying_token, shareAccountingTokenAmount: 200n, tokenCustodyTokenAmount: 180n, directShareAccountingEthQuote: 251n, directTokenCustodyEthQuote: 226n },
    { ...expectedStrategies[2], underlyingToken: expectedStrategies[2].underlying_token, shareAccountingTokenAmount: 301n, tokenCustodyTokenAmount: 271n, cbethExchangeRate: 1_500_000_000_000_000_000n },
    { ...expectedStrategies[3], underlyingToken: expectedStrategies[3].underlying_token, shareAccountingTokenAmount: 400n, tokenCustodyTokenAmount: 380n, directShareAccountingEthQuote: 460n, directTokenCustodyEthQuote: 431n },
    { ...expectedStrategies[4], underlyingToken: expectedStrategies[4].underlying_token, shareAccountingTokenAmount: 400n, tokenCustodyTokenAmount: 380n, directShareAccountingEthQuote: 460n, directTokenCustodyEthQuote: 431n },
    { ...expectedStrategies[5], underlyingToken: expectedStrategies[5].underlying_token, shareAccountingTokenAmount: 600n, tokenCustodyTokenAmount: 570n, directShareAccountingEthQuote: 650n, directTokenCustodyEthQuote: 620n },
    { ...expectedStrategies[6], underlyingToken: expectedStrategies[6].underlying_token, shareAccountingTokenAmount: 500n, tokenCustodyTokenAmount: 470n, directShareAccountingEthQuote: 555n, directTokenCustodyEthQuote: 521n },
  ];
}
function build(candidate = quotes(), lsethLastCompletedEpochId = 123n, ethxOracleReportingBlockNumber = 1n) {
  return buildVerifiedEigenLayerLstEthQuotesSnapshot({ block, quotes: candidate, lsethLastCompletedEpochId, ethxOracleReportingBlockNumber, sources: ["ethereum_rpc"], sourceStatus });
}

describe("EigenLayer covered LST ETH quote metrics", () => {
  it("computes exact seven-token independent/direct/floor quotes and partial sums", () => {
    const snapshot = build();
    expect(snapshot.methodology).toBe("eigenlayer-covered-lst-eth-quotes-v4");
    expect(snapshot.covered_quotes.map((quote) => ({ label: quote.label, share: quote.share_accounting_eth_quote_wei, custody: quote.token_custody_eth_quote_wei, kind: quote.quote_kind, trust: quote.trust_basis }))).toEqual([
      { label: "stETH", share: "100", custody: "90", kind: "steth_token_wei_identity_quote", trust: "lido_pooled_eth_accounting" }, { label: "rETH", share: "251", custody: "226", kind: "rocket_pool_direct_aggregate_quote", trust: "rocket_pool_network_accounting" }, { label: "cbETH", share: "451", custody: "406", kind: "coinbase_oracle_accounting_quote", trust: "coinbase_oracle_controlled_rate" }, { label: "ETHx", share: "460", custody: "431", kind: "stader_direct_pool_accounting_quote", trust: "stader_oracle_reported_accounting" }, { label: "osETH", share: "460", custody: "431", kind: "stakewise_v3_direct_controller_quote", trust: "stakewise_v3_keeper_reward_accounting" }, { label: "lsETH", share: "650", custody: "620", kind: "liquid_collective_river_direct_share_quote", trust: "liquid_collective_oracle_reported_accounting" }, { label: "mETH", share: "555", custody: "521", kind: "mantle_staking_direct_oracle_quote", trust: "mantle_oracle_reported_accounting" },
    ]);
    expect(snapshot.report_context).toEqual({ lseth_last_completed_epoch_id: "123", ethx_oracle_reporting_block_number: "1" });
    expect(snapshot.metrics.covered_share_accounting_eth_equivalent_wei).toBe("2927");
    expect(snapshot.metrics.covered_token_custody_eth_equivalent_wei).toBe("2725");
    expect(snapshot.coverage).toEqual({ quoted_strategy_count: 7, fixed_strategy_count: 12, unquoted_strategy_labels: EIGENLAYER_UNQUOTED_LST_STRATEGY_LABELS });
    expect(snapshot.summary).toContain("cover seven of twelve fixed strategies");
    expect(snapshot.gaps).toEqual(expect.arrayContaining([
      { code: "lst_quote_coverage_partial", detail: "Only seven of the twelve fixed legacy EigenLayer LST strategies have bounded ETH accounting quotes." },
      { code: "lst_restaked_eth_equivalent_not_measured", detail: "Seven covered quotes do not establish a full EigenLayer LST ETH-equivalent total." },
    ]));
    expect(snapshot.gaps.map((gap) => gap.code)).toEqual(EIGENLAYER_LST_ETH_QUOTES_PERMANENT_GAP_CODES);
  });

  it("preserves valid zero direct lsETH quote outputs and epoch zero", () => {
    const zero = quotes();
    for (const quote of zero) { quote.shareAccountingTokenAmount = 0n; quote.tokenCustodyTokenAmount = 0n; if ("directShareAccountingEthQuote" in quote) quote.directShareAccountingEthQuote = 0n; if ("directTokenCustodyEthQuote" in quote) quote.directTokenCustodyEthQuote = 0n; }
    zero[2]!.cbethExchangeRate = 1n;
    const snapshot = build(zero, 0n);
    expect(snapshot.metrics.covered_share_accounting_eth_equivalent_wei).toBe("0");
    expect(snapshot.report_context?.lseth_last_completed_epoch_id).toBe("0");
  });

  it("fails closed for reordered, substituted, incomplete, invalid direct lsETH, invalid epoch, or overflow inputs", () => {
    const max = (2n ** 256n) - 1n;
    const cases: Array<() => unknown> = [
      () => build([...quotes()].reverse()), () => { const x = quotes(); delete x[4]!.directShareAccountingEthQuote; return build(x); },
      () => { const x = quotes(); x[4]!.cbethExchangeRate = 1n; return build(x); }, () => { const x = quotes(); x[4]!.directTokenCustodyEthQuote = -1n; return build(x); },
      () => build(quotes(), -1n), () => build(quotes(), 2n ** 256n), () => { const x = quotes(); x[2]!.shareAccountingTokenAmount = max; x[2]!.cbethExchangeRate = 2n; return build(x); },
    ];
    for (const attempt of cases) expect(attempt).toThrow(EigenLayerLstEthQuotesDomainError);
  });

  it("requires direct lsETH results without rate material and keeps other quote kinds isolated", () => {
    const cases: Array<() => unknown> = [
      () => { const x = quotes(); x[4]!.cbethExchangeRate = 1n; return build(x); },
      () => { const x = quotes(); x[4]!.fabricatedConversionRate = 1n; return build(x); },
      () => { const x = quotes(); x[0]!.directShareAccountingEthQuote = 101n; return build(x); },
      () => { const x = quotes(); x[2]!.directTokenCustodyEthQuote = 999n; return build(x); },
    ];
    for (const attempt of cases) expect(attempt).toThrow(EigenLayerLstEthQuotesDomainError);
  });

  it("keeps stale and unavailable evidence bounded", () => {
    const stale = buildVerifiedEigenLayerLstEthQuotesSnapshot({ block, quotes: quotes(), lsethLastCompletedEpochId: 123n, ethxOracleReportingBlockNumber: 1n, sources: ["ethereum_rpc"], sourceStatus, stale: true });
    expect(stale.gaps.filter((gap) => gap.code === "source_stale")).toHaveLength(1);
    const unavailable = buildUnavailableEigenLayerLstEthQuotesSnapshot({ summary: "unavailable", gaps: [{ code: "rpc_access_gap", detail: "bounded" }], sources: ["ethereum_rpc"], sourceStatus });
    expect(unavailable).toMatchObject({ status: "unavailable", verified_block: null, covered_quotes: [], report_context: null, identities: null, coverage: null });
  });
});
