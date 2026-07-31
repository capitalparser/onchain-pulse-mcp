import { describe, expect, it } from "vitest";
import { buildUnavailableEigenLayerLstEthQuotesSnapshot, buildVerifiedEigenLayerLstEthQuotesSnapshot, EigenLayerLstEthQuotesDomainError } from "../../src/eigenlayer_lst_eth_quotes/metrics.js";
import { EIGENLAYER_LST_ETH_QUOTES_PERMANENT_GAP_CODES, EIGENLAYER_UNQUOTED_LST_STRATEGY_BLOCKERS, EIGENLAYER_UNQUOTED_LST_STRATEGY_LABELS } from "../../src/eigenlayer_lst_eth_quotes/types.js";

const sourceStatus = [{ source: "ethereum_rpc" as const, role: "eigenlayer_finalized_lst_eth_quote_evidence" as const, stale: false }];
const block = { number: 1, hash: `0x${"ab".repeat(32)}`, timestamp: 2 };
const strategies = [
  ["stETH", "0x93c4b944D05dfe6df7645A86cd2206016c51564D", "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84"],
  ["rETH", "0x1BeE69b7dFFfA4E2d53C2a2Df135C388AD25dCD2", "0xae78736Cd615f374D3085123A210448E74Fc6393"],
  ["cbETH", "0x54945180dB7943c0ed0FEE7EdaB2Bd24620256bc", "0xBe9895146f7AF43049ca1c1AE358B0541Ea49704"],
  ["ETHx", "0x9d7eD45EE2E8FC5482fa2428f15C971e6369011d", "0xA35b1B31Ce002FBF2058D22F30f95D405200A15b"],
  ["oETH", "0xa4C637e0F704745D182e4D38cAb7E7485321d059", "0x856c4Efb76C1D1AE02e20CEB03A2A6a08b0b8dC3"],
  ["osETH", "0x57ba429517c3473B6d34CA9aCd56c0e735b94c02", "0xf1C9acDc66974dFB6dEcB12aA385b9cD01190E38"],
  ["swETH", "0x0Fe4F44beE93503346A3Ac9EE5A26b130a5796d6", "0xf951E335afb289353dc249e82926178EaC7DEd78"],
  ["lsETH", "0xAe60d8180437b5C34bB956822ac2710972584473", "0x8c1BEd5b9a0928467c9B1341Da1D7BD5e10b6549"],
  ["mETH", "0x298aFB19A105D59E74658C4C334Ff360BadE6dd2", "0xd5F7838F5C461fefF7FE49ea5ebaF7728bB0ADfa"],
] as const;
function candidate(index: number, fields: Record<string, bigint> = {}) {
  const [label, strategy, underlyingToken] = strategies[index]!;
  return { label, strategy, underlyingToken, decimals: 18, ...fields };
}
function quotes(): any[] {
  return [
    candidate(0, { shareAccountingTokenAmount: 100n, tokenCustodyTokenAmount: 90n }),
    candidate(1, { shareAccountingTokenAmount: 200n, tokenCustodyTokenAmount: 180n, directShareAccountingEthQuote: 251n, directTokenCustodyEthQuote: 226n }),
    candidate(2, { shareAccountingTokenAmount: 301n, tokenCustodyTokenAmount: 271n, cbethExchangeRate: 1_500_000_000_000_000_000n }),
    candidate(3, { shareAccountingTokenAmount: 400n, tokenCustodyTokenAmount: 380n, directShareAccountingEthQuote: 460n, directTokenCustodyEthQuote: 431n }),
    candidate(4, { shareAccountingTokenAmount: 800n, tokenCustodyTokenAmount: 750n }),
    candidate(5, { shareAccountingTokenAmount: 400n, tokenCustodyTokenAmount: 380n, directShareAccountingEthQuote: 460n, directTokenCustodyEthQuote: 431n }),
    candidate(6, { shareAccountingTokenAmount: 700n, tokenCustodyTokenAmount: 650n, swethToEthRate: 1_000_000_000_000_000_000n }),
    candidate(7, { shareAccountingTokenAmount: 600n, tokenCustodyTokenAmount: 570n, directShareAccountingEthQuote: 650n, directTokenCustodyEthQuote: 620n }),
    candidate(8, { shareAccountingTokenAmount: 500n, tokenCustodyTokenAmount: 470n, directShareAccountingEthQuote: 555n, directTokenCustodyEthQuote: 521n }),
  ];
}
function build(candidateQuotes = quotes(), context = { oethLastRebaseUnix: 0n, oethRebasePaused: true, oethWithdrawalClaimDelaySeconds: 0n }) {
  return buildVerifiedEigenLayerLstEthQuotesSnapshot({ block, quotes: candidateQuotes, lsethLastCompletedEpochId: 123n, ethxOracleReportingBlockNumber: 1n, swethLastRepriceUnix: 0n, ...context, sources: ["ethereum_rpc"], sourceStatus });
}

describe("EigenLayer covered LST ETH quote metrics", () => {
  it("computes nine ordered quotes with nominal OETH identity and only partial sums", () => {
    const snapshot = build();
    expect(snapshot.methodology).toBe("eigenlayer-covered-lst-eth-quotes-v7");
    expect(snapshot.summary).toBe("Finalized 9-of-12 ceiling: ankrETH lacks immutable source/proxy/freshness evidence; wBETH lacks issuer source, proxy, and freshness evidence; sfrxETH stops at frxETH, not ETH. ID119 remains final; no RPC calls added. Nominal OETH accounting is not backing, redeemability, or liquidity.");
    expect(snapshot.covered_quotes.map((quote) => [quote.label, quote.quote_kind, quote.trust_basis])).toEqual([
      ["stETH", "steth_token_wei_identity_quote", "lido_pooled_eth_accounting"], ["rETH", "rocket_pool_direct_aggregate_quote", "rocket_pool_network_accounting"], ["cbETH", "coinbase_oracle_accounting_quote", "coinbase_oracle_controlled_rate"], ["ETHx", "stader_direct_pool_accounting_quote", "stader_oracle_reported_accounting"], ["oETH", "origin_oeth_vault_unit_identity_quote", "origin_vault_nominal_withdrawal_unit_accounting"], ["osETH", "stakewise_v3_direct_controller_quote", "stakewise_v3_keeper_reward_accounting"], ["swETH", "swell_reprice_rate_floor_quote", "swell_reprice_role_controlled_rate"], ["lsETH", "liquid_collective_river_direct_share_quote", "liquid_collective_oracle_reported_accounting"], ["mETH", "mantle_staking_direct_oracle_quote", "mantle_oracle_reported_accounting"],
    ]);
    expect(snapshot.covered_quotes[4]).toMatchObject({ share_accounting_eth_quote_wei: "800", token_custody_eth_quote_wei: "750", cbeth_exchange_rate_wei: null, sweth_to_eth_rate_wei: null });
    expect(snapshot.report_context).toMatchObject({ oeth_last_rebase_unix: "0", oeth_rebase_paused: true, oeth_withdrawal_claim_delay_seconds: "0" });
    expect(snapshot.metrics).toMatchObject({ covered_share_accounting_eth_equivalent_wei: "4427", covered_token_custody_eth_equivalent_wei: "4125", executable_withdrawal_capacity_eth_wei: null });
    expect(snapshot.coverage).toEqual({ quoted_strategy_count: 9, fixed_strategy_count: 12, unquoted_strategy_labels: EIGENLAYER_UNQUOTED_LST_STRATEGY_LABELS, unquoted_strategy_blockers: EIGENLAYER_UNQUOTED_LST_STRATEGY_BLOCKERS });
    expect(snapshot.gaps.map((gap) => gap.code)).toEqual(EIGENLAYER_LST_ETH_QUOTES_PERMANENT_GAP_CODES);
    expect(snapshot.gaps).toHaveLength(29);
    expect(snapshot.gaps.filter((gap) => EIGENLAYER_UNQUOTED_LST_STRATEGY_BLOCKERS.some((blocker) => blocker.code === gap.code)))
      .toEqual(EIGENLAYER_UNQUOTED_LST_STRATEGY_BLOCKERS.map(({ code, detail }) => ({ code, detail })));
  });

  it("accepts zero rebase, paused true, and delay zero as context only", () => {
    const snapshot = build();
    expect(snapshot.report_context).toMatchObject({ oeth_last_rebase_unix: "0", oeth_rebase_paused: true, oeth_withdrawal_claim_delay_seconds: "0" });
    expect(snapshot.summary).toMatch(/Nominal OETH accounting is not backing/);
  });

  it("fails closed for future rebase, OETH conversion material, reorder, or identity drift", () => {
    const cases: Array<() => unknown> = [
      () => build(quotes(), { oethLastRebaseUnix: 3n, oethRebasePaused: false, oethWithdrawalClaimDelaySeconds: 0n }),
      () => { const x = quotes(); x[4]!.directShareAccountingEthQuote = 800n; return build(x); },
      () => { const x = quotes(); x[4]!.cbethExchangeRate = 1n; return build(x); },
      () => build([...quotes()].reverse()),
    ];
    for (const attempt of cases) expect(attempt).toThrow(EigenLayerLstEthQuotesDomainError);
  });

  it("preserves swETH full-precision and overflow behavior after index shift", () => {
    const high = quotes(); const max = (2n ** 256n) - 1n;
    high[6]!.shareAccountingTokenAmount = max - 3727n; high[6]!.tokenCustodyTokenAmount = 0n;
    expect(build(high).metrics.covered_share_accounting_eth_equivalent_wei).toBe(max.toString());
    high[6]!.shareAccountingTokenAmount = max; high[6]!.swethToEthRate = 2_000_000_000_000_000_000n;
    expect(() => build(high, { oethLastRebaseUnix: 1n, oethRebasePaused: false, oethWithdrawalClaimDelaySeconds: 1n })).toThrow(EigenLayerLstEthQuotesDomainError);
  });

  it("keeps stale v7 and unavailable evidence bounded", () => {
    const stale = buildVerifiedEigenLayerLstEthQuotesSnapshot({ block, quotes: quotes(), lsethLastCompletedEpochId: 123n, ethxOracleReportingBlockNumber: 1n, swethLastRepriceUnix: 0n, oethLastRebaseUnix: 0n, oethRebasePaused: false, oethWithdrawalClaimDelaySeconds: 1n, sources: ["ethereum_rpc"], sourceStatus, stale: true });
    expect(stale.gaps.filter((gap) => gap.code === "source_stale")).toHaveLength(1);
    const unavailable = buildUnavailableEigenLayerLstEthQuotesSnapshot({ summary: "unavailable", gaps: [{ code: "rpc_access_gap", detail: "bounded" }], sources: ["ethereum_rpc"], sourceStatus });
    expect(unavailable).toMatchObject({ methodology: "eigenlayer-covered-lst-eth-quotes-v7", status: "unavailable", verified_block: null, covered_quotes: [], report_context: null, coverage: null });
  });
});
