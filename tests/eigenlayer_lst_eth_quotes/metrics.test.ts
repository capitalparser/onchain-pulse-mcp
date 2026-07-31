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
  { label: "swETH", strategy: "0x0Fe4F44beE93503346A3Ac9EE5A26b130a5796d6", underlying_token: "0xf951E335afb289353dc249e82926178EaC7DEd78", decimals: 18 },
  { label: "lsETH", strategy: "0xAe60d8180437b5C34bB956822ac2710972584473", underlying_token: "0x8c1BEd5b9a0928467c9B1341Da1D7BD5e10b6549", decimals: 18 },
  { label: "mETH", strategy: "0x298aFB19A105D59E74658C4C334Ff360BadE6dd2", underlying_token: "0xd5F7838F5C461fefF7FE49ea5ebaF7728bB0ADfa", decimals: 18 },
] as const;

function candidate(index: number, fields: Record<string, bigint> = {}) {
  const strategy = expectedStrategies[index]!;
  return { ...strategy, underlyingToken: strategy.underlying_token, ...fields };
}
function quotes(): any[] {
  return [
    candidate(0, { shareAccountingTokenAmount: 100n, tokenCustodyTokenAmount: 90n }),
    candidate(1, { shareAccountingTokenAmount: 200n, tokenCustodyTokenAmount: 180n, directShareAccountingEthQuote: 251n, directTokenCustodyEthQuote: 226n }),
    candidate(2, { shareAccountingTokenAmount: 301n, tokenCustodyTokenAmount: 271n, cbethExchangeRate: 1_500_000_000_000_000_000n }),
    candidate(3, { shareAccountingTokenAmount: 400n, tokenCustodyTokenAmount: 380n, directShareAccountingEthQuote: 460n, directTokenCustodyEthQuote: 431n }),
    candidate(4, { shareAccountingTokenAmount: 400n, tokenCustodyTokenAmount: 380n, directShareAccountingEthQuote: 460n, directTokenCustodyEthQuote: 431n }),
    candidate(5, { shareAccountingTokenAmount: 700n, tokenCustodyTokenAmount: 650n, swethToEthRate: 1_000_000_000_000_000_000n }),
    candidate(6, { shareAccountingTokenAmount: 600n, tokenCustodyTokenAmount: 570n, directShareAccountingEthQuote: 650n, directTokenCustodyEthQuote: 620n }),
    candidate(7, { shareAccountingTokenAmount: 500n, tokenCustodyTokenAmount: 470n, directShareAccountingEthQuote: 555n, directTokenCustodyEthQuote: 521n }),
  ];
}
function build(candidateQuotes = quotes(), lsethLastCompletedEpochId = 123n, ethxOracleReportingBlockNumber = 1n, swethLastRepriceUnix = 0n) {
  return buildVerifiedEigenLayerLstEthQuotesSnapshot({ block, quotes: candidateQuotes, lsethLastCompletedEpochId, ethxOracleReportingBlockNumber, swethLastRepriceUnix, sources: ["ethereum_rpc"], sourceStatus });
}

describe("EigenLayer covered LST ETH quote metrics", () => {
  it("computes exact eight-token independent/direct/floor quotes and partial sums", () => {
    const snapshot = build();
    expect(snapshot.methodology).toBe("eigenlayer-covered-lst-eth-quotes-v5");
    expect(snapshot.covered_quotes.map((quote) => [quote.label, quote.quote_kind, quote.trust_basis, quote.share_accounting_eth_quote_wei, quote.token_custody_eth_quote_wei])).toEqual([
      ["stETH", "steth_token_wei_identity_quote", "lido_pooled_eth_accounting", "100", "90"], ["rETH", "rocket_pool_direct_aggregate_quote", "rocket_pool_network_accounting", "251", "226"], ["cbETH", "coinbase_oracle_accounting_quote", "coinbase_oracle_controlled_rate", "451", "406"], ["ETHx", "stader_direct_pool_accounting_quote", "stader_oracle_reported_accounting", "460", "431"], ["osETH", "stakewise_v3_direct_controller_quote", "stakewise_v3_keeper_reward_accounting", "460", "431"], ["swETH", "swell_reprice_rate_floor_quote", "swell_reprice_role_controlled_rate", "700", "650"], ["lsETH", "liquid_collective_river_direct_share_quote", "liquid_collective_oracle_reported_accounting", "650", "620"], ["mETH", "mantle_staking_direct_oracle_quote", "mantle_oracle_reported_accounting", "555", "521"],
    ]);
    expect(snapshot.report_context).toEqual({ lseth_last_completed_epoch_id: "123", ethx_oracle_reporting_block_number: "1", sweth_last_reprice_unix: "0" });
    expect(snapshot.metrics).toMatchObject({ covered_share_accounting_eth_equivalent_wei: "3627", covered_token_custody_eth_equivalent_wei: "3375" });
    expect(snapshot.coverage).toEqual({ quoted_strategy_count: 8, fixed_strategy_count: 12, unquoted_strategy_labels: EIGENLAYER_UNQUOTED_LST_STRATEGY_LABELS });
    expect(snapshot.gaps.map((gap) => gap.code)).toEqual(EIGENLAYER_LST_ETH_QUOTES_PERMANENT_GAP_CODES);
    expect(snapshot.gaps).toEqual(expect.arrayContaining([{ code: "sweth_reprice_freshness_not_verified", detail: expect.any(String) }, { code: "sweth_proxy_upgradeability_not_verified", detail: expect.any(String) }, { code: "sweth_backing_not_reconciled", detail: expect.any(String) }]));
  });

  it("accepts the zero/default pair and permits a full-precision intermediate above uint256 when its floor fits", () => {
    const zero = quotes();
    for (const value of zero) { value.shareAccountingTokenAmount = 0n; value.tokenCustodyTokenAmount = 0n; if ("directShareAccountingEthQuote" in value) value.directShareAccountingEthQuote = 0n; if ("directTokenCustodyEthQuote" in value) value.directTokenCustodyEthQuote = 0n; }
    zero[2]!.cbethExchangeRate = 1n;
    expect(build(zero, 0n).metrics.covered_share_accounting_eth_equivalent_wei).toBe("0");
    const high = quotes(); const max = (2n ** 256n) - 1n;
    high[5]!.shareAccountingTokenAmount = max - 2927n; high[5]!.tokenCustodyTokenAmount = 0n;
    const snapshot = build(high);
    expect(snapshot.covered_quotes[5]!.share_accounting_eth_quote_wei).toBe((max - 2927n).toString());
    expect(snapshot.metrics.covered_share_accounting_eth_equivalent_wei).toBe(max.toString());
  });

  it("fails closed for malformed swETH rate, future/default mismatch, final overflow, or cross-kind evidence", () => {
    const max = (2n ** 256n) - 1n;
    const cases: Array<() => unknown> = [
      () => { const x = quotes(); x[5]!.swethToEthRate = 0n; return build(x); },
      () => build(quotes(), 123n, 1n, 3n),
      () => { const x = quotes(); x[5]!.swethToEthRate = 2n; return build(x); },
      () => { const x = quotes(); x[5]!.shareAccountingTokenAmount = max; x[5]!.swethToEthRate = 2_000_000_000_000_000_000n; return build(x, 123n, 1n, 1n); },
      () => { const x = quotes(); x[5]!.directShareAccountingEthQuote = 1n; return build(x); },
      () => { const x = quotes(); x[4]!.swethToEthRate = 1n; return build(x); },
      () => build([...quotes()].reverse()),
    ];
    for (const attempt of cases) expect(attempt).toThrow(EigenLayerLstEthQuotesDomainError);
  });

  it("keeps stale and unavailable evidence bounded", () => {
    const stale = buildVerifiedEigenLayerLstEthQuotesSnapshot({ block, quotes: quotes(), lsethLastCompletedEpochId: 123n, ethxOracleReportingBlockNumber: 1n, swethLastRepriceUnix: 0n, sources: ["ethereum_rpc"], sourceStatus, stale: true });
    expect(stale.gaps.filter((gap) => gap.code === "source_stale")).toHaveLength(1);
    const unavailable = buildUnavailableEigenLayerLstEthQuotesSnapshot({ summary: "unavailable", gaps: [{ code: "rpc_access_gap", detail: "bounded" }], sources: ["ethereum_rpc"], sourceStatus });
    expect(unavailable).toMatchObject({ status: "unavailable", verified_block: null, covered_quotes: [], report_context: null, identities: null, coverage: null });
  });
});
