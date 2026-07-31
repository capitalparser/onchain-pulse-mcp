import { describe, expect, it } from "vitest";
import {
  buildUnavailableEigenLayerLstEthQuotesSnapshot,
  buildVerifiedEigenLayerLstEthQuotesSnapshot,
  EigenLayerLstEthQuotesDomainError,
} from "../../src/eigenlayer_lst_eth_quotes/metrics.js";
import {
  EIGENLAYER_COVERED_LST_STRATEGIES,
  EIGENLAYER_LST_ETH_QUOTES_PERMANENT_GAP_CODES,
  EIGENLAYER_UNQUOTED_LST_STRATEGY_LABELS,
} from "../../src/eigenlayer_lst_eth_quotes/types.js";

const sourceStatus = [{
  source: "ethereum_rpc" as const,
  role: "eigenlayer_finalized_lst_eth_quote_evidence" as const,
  stale: false,
}];

function quotes() {
  return [
    {
      ...EIGENLAYER_COVERED_LST_STRATEGIES[0],
      underlyingToken: EIGENLAYER_COVERED_LST_STRATEGIES[0].underlying_token,
      shareAccountingTokenAmount: 100n,
      tokenCustodyTokenAmount: 90n,
    },
    {
      ...EIGENLAYER_COVERED_LST_STRATEGIES[1],
      underlyingToken: EIGENLAYER_COVERED_LST_STRATEGIES[1].underlying_token,
      shareAccountingTokenAmount: 200n,
      tokenCustodyTokenAmount: 180n,
      directShareAccountingEthQuote: 251n,
      directTokenCustodyEthQuote: 226n,
    },
    {
      ...EIGENLAYER_COVERED_LST_STRATEGIES[2],
      underlyingToken: EIGENLAYER_COVERED_LST_STRATEGIES[2].underlying_token,
      shareAccountingTokenAmount: 301n,
      tokenCustodyTokenAmount: 271n,
      cbethExchangeRate: 1_500_000_000_000_000_001n,
    },
  ];
}

describe("EigenLayer covered LST ETH quote metrics", () => {
  it("computes exact independent stETH, direct rETH, and floor cbETH quotes and partial sums", () => {
    const snapshot = buildVerifiedEigenLayerLstEthQuotesSnapshot({
      block: { number: 1, hash: `0x${"ab".repeat(32)}`, timestamp: 2 },
      quotes: quotes(),
      sources: ["ethereum_rpc"],
      sourceStatus,
    });

    expect(snapshot.covered_quotes.map((quote) => ({
      label: quote.label,
      share: quote.share_accounting_eth_quote_wei,
      custody: quote.token_custody_eth_quote_wei,
      kind: quote.quote_kind,
    }))).toEqual([
      { label: "stETH", share: "100", custody: "90", kind: "steth_token_wei_identity_quote" },
      { label: "rETH", share: "251", custody: "226", kind: "rocket_pool_direct_aggregate_quote" },
      { label: "cbETH", share: "451", custody: "406", kind: "coinbase_oracle_accounting_quote" },
    ]);
    expect(snapshot.metrics).toEqual({
      covered_share_accounting_eth_equivalent_wei: "802",
      covered_token_custody_eth_equivalent_wei: "722",
      lst_restaked_eth_equivalent_wei: null,
      native_restaked_eth_wei: null,
      eigenlayer_eth_family_exposure_eth_wei: null,
      unique_net_eth_locked: null,
      combined_aave_spark_lido_sky_eigenlayer_demand: null,
      rehypothecation_ratio: null,
      executable_withdrawal_capacity_eth_wei: null,
    });
    expect(snapshot.coverage).toEqual({
      quoted_strategy_count: 3,
      fixed_strategy_count: 12,
      unquoted_strategy_labels: EIGENLAYER_UNQUOTED_LST_STRATEGY_LABELS,
    });
    expect(snapshot.gaps.map((gap) => gap.code)).toEqual(EIGENLAYER_LST_ETH_QUOTES_PERMANENT_GAP_CODES);
    expect(snapshot.covered_quotes[1]!.cbeth_exchange_rate_wei).toBeNull();
    expect(snapshot.covered_quotes[2]!.cbeth_exchange_rate_wei).toBe("1500000000000000001");
  });

  it("fails closed for reordered, substituted, duplicate, or incomplete covered inputs", () => {
    const mutations: Array<(value: any[]) => void> = [
      (value) => { value.reverse(); },
      (value) => { value[1] = { ...value[0] }; },
      (value) => { value[0]!.underlyingToken = value[1]!.underlyingToken; },
      (value) => { value[2]!.strategy = value[1]!.strategy; },
      (value) => { value[0]!.decimals = 17; },
      (value) => { value.pop(); },
    ];
    for (const mutate of mutations) {
      const candidate: any[] = quotes();
      mutate(candidate);
      expect(() => buildVerifiedEigenLayerLstEthQuotesSnapshot({
        block: { number: 1, hash: `0x${"ab".repeat(32)}`, timestamp: 2 },
        quotes: candidate,
        sources: ["ethereum_rpc"],
        sourceStatus,
      })).toThrow(EigenLayerLstEthQuotesDomainError);
    }
  });

  it("requires two independent direct rETH aggregate results without a rate", () => {
    const missingShare: any[] = quotes();
    delete missingShare[1]!.directShareAccountingEthQuote;
    expect(() => buildVerifiedEigenLayerLstEthQuotesSnapshot({
      block: { number: 1, hash: `0x${"ab".repeat(32)}`, timestamp: 2 }, quotes: missingShare,
      sources: ["ethereum_rpc"], sourceStatus,
    })).toThrow(EigenLayerLstEthQuotesDomainError);

    const roundedRateSubstitution: any[] = quotes();
    roundedRateSubstitution[1]!.rethExchangeRate = 1_250_000_000_000_000_000n;
    expect(() => buildVerifiedEigenLayerLstEthQuotesSnapshot({
      block: { number: 1, hash: `0x${"ab".repeat(32)}`, timestamp: 2 }, quotes: roundedRateSubstitution,
      sources: ["ethereum_rpc"], sourceStatus,
    })).toThrow(EigenLayerLstEthQuotesDomainError);
  });

  it("rejects zero rates and uint256 amount, product, quote, or partial-sum overflow", () => {
    const uint256Max = (2n ** 256n) - 1n;
    const mutations: Array<(value: any[]) => void> = [
      (value) => { value[0]!.shareAccountingTokenAmount = 2n ** 256n; },
      (value) => { value[1]!.directTokenCustodyEthQuote = 2n ** 256n; },
      (value) => { value[2]!.cbethExchangeRate = 0n; },
      (value) => { value[2]!.shareAccountingTokenAmount = uint256Max; value[2]!.cbethExchangeRate = 2n; },
      (value) => { value[0]!.shareAccountingTokenAmount = uint256Max; value[1]!.directShareAccountingEthQuote = 1n; },
    ];
    for (const mutate of mutations) {
      const candidate: any[] = quotes();
      mutate(candidate);
      expect(() => buildVerifiedEigenLayerLstEthQuotesSnapshot({
        block: { number: 1, hash: `0x${"ab".repeat(32)}`, timestamp: 2 }, quotes: candidate,
        sources: ["ethereum_rpc"], sourceStatus,
      })).toThrow(EigenLayerLstEthQuotesDomainError);
    }
  });

  it("rejects caller-supplied stETH or cbETH quote results instead of trusting fabricated conversions", () => {
    const steth: any[] = quotes();
    steth[0]!.directShareAccountingEthQuote = 101n;
    const cbeth: any[] = quotes();
    cbeth[2]!.directTokenCustodyEthQuote = 999n;
    for (const candidate of [steth, cbeth]) {
      expect(() => buildVerifiedEigenLayerLstEthQuotesSnapshot({
        block: { number: 1, hash: `0x${"ab".repeat(32)}`, timestamp: 2 }, quotes: candidate,
        sources: ["ethereum_rpc"], sourceStatus,
      })).toThrow(EigenLayerLstEthQuotesDomainError);
    }
  });

  it("adds exactly one coherent stale marker to previously verified evidence", () => {
    const snapshot = buildVerifiedEigenLayerLstEthQuotesSnapshot({
      block: { number: 1, hash: `0x${"ab".repeat(32)}`, timestamp: 2 }, quotes: quotes(),
      sources: ["ethereum_rpc"], sourceStatus, stale: true,
    });
    expect(snapshot.gaps.filter((gap) => gap.code === "source_stale")).toHaveLength(1);
    expect(snapshot.source_status).toEqual([{ ...sourceStatus[0], stale: true }]);
  });

  it("builds atomic unavailable output and rejects unbounded or non-source failure input", () => {
    const snapshot = buildUnavailableEigenLayerLstEthQuotesSnapshot({
      summary: "unavailable",
      gaps: [{ code: "rpc_access_gap", detail: "bounded" }],
      sources: ["ethereum_rpc"],
      sourceStatus,
    });
    expect(snapshot).toMatchObject({
      status: "unavailable",
      verified_block: null,
      covered_quotes: [],
      identities: null,
      coverage: null,
      metrics: {
        covered_share_accounting_eth_equivalent_wei: null,
        covered_token_custody_eth_equivalent_wei: null,
      },
    });
    expect(() => buildUnavailableEigenLayerLstEthQuotesSnapshot({
      summary: "x".repeat(501), gaps: [{ code: "rpc_access_gap", detail: "bounded" }],
      sources: ["ethereum_rpc"], sourceStatus,
    })).toThrow(EigenLayerLstEthQuotesDomainError);
    expect(() => buildUnavailableEigenLayerLstEthQuotesSnapshot({
      summary: "unavailable",
      gaps: [{ code: "cbeth_exchange_rate_freshness_not_verified", detail: "not a source failure" }],
    })).toThrow(EigenLayerLstEthQuotesDomainError);
  });
});
