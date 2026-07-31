import { describe, expect, it } from "vitest";
import {
  buildUnavailableEigenLayerLstEthQuotesSnapshot,
  buildVerifiedEigenLayerLstEthQuotesSnapshot,
} from "../../src/eigenlayer_lst_eth_quotes/metrics.js";
import {
  EIGENLAYER_COVERED_LST_STRATEGIES,
  type EigenLayerLstEthQuoteSourceStatus,
} from "../../src/eigenlayer_lst_eth_quotes/types.js";
import { getEigenLayerLstEthQuotes } from "../../src/tools/get_eigenlayer_lst_eth_quotes.js";

const sourceStatus: EigenLayerLstEthQuoteSourceStatus[] = [{
  source: "ethereum_rpc",
  role: "eigenlayer_finalized_lst_eth_quote_evidence",
  stale: false,
}];

function verified(stale = false) {
  return buildVerifiedEigenLayerLstEthQuotesSnapshot({
    block: { number: 1, hash: `0x${"a".repeat(64)}`, timestamp: 1 },
    quotes: [
      {
        ...EIGENLAYER_COVERED_LST_STRATEGIES[0],
        underlyingToken: EIGENLAYER_COVERED_LST_STRATEGIES[0].underlying_token,
        shareAccountingTokenAmount: 10n,
        tokenCustodyTokenAmount: 20n,
      },
      {
        ...EIGENLAYER_COVERED_LST_STRATEGIES[1],
        underlyingToken: EIGENLAYER_COVERED_LST_STRATEGIES[1].underlying_token,
        shareAccountingTokenAmount: 30n,
        tokenCustodyTokenAmount: 40n,
        directShareAccountingEthQuote: 31n,
        directTokenCustodyEthQuote: 41n,
      },
      {
        ...EIGENLAYER_COVERED_LST_STRATEGIES[2],
        underlyingToken: EIGENLAYER_COVERED_LST_STRATEGIES[2].underlying_token,
        shareAccountingTokenAmount: 50n,
        tokenCustodyTokenAmount: 60n,
        cbethExchangeRate: 1_100_000_000_000_000_000n,
      },
      {
        ...EIGENLAYER_COVERED_LST_STRATEGIES[3],
        underlyingToken: EIGENLAYER_COVERED_LST_STRATEGIES[3].underlying_token,
        shareAccountingTokenAmount: 70n,
        tokenCustodyTokenAmount: 80n,
        directShareAccountingEthQuote: 71n,
        directTokenCustodyEthQuote: 81n,
      },
      {
        ...EIGENLAYER_COVERED_LST_STRATEGIES[4],
        underlyingToken: EIGENLAYER_COVERED_LST_STRATEGIES[4].underlying_token,
        shareAccountingTokenAmount: 70n,
        tokenCustodyTokenAmount: 80n,
      },
      {
        ...EIGENLAYER_COVERED_LST_STRATEGIES[5],
        underlyingToken: EIGENLAYER_COVERED_LST_STRATEGIES[5].underlying_token,
        shareAccountingTokenAmount: 85n,
        tokenCustodyTokenAmount: 95n,
        directShareAccountingEthQuote: 86n,
        directTokenCustodyEthQuote: 96n,
      },
      {
        ...EIGENLAYER_COVERED_LST_STRATEGIES[6],
        underlyingToken: EIGENLAYER_COVERED_LST_STRATEGIES[6].underlying_token,
        shareAccountingTokenAmount: 90n,
        tokenCustodyTokenAmount: 100n,
        swethToEthRate: 1_000_000_000_000_000_000n,
      },
      {
        ...EIGENLAYER_COVERED_LST_STRATEGIES[7],
        underlyingToken: EIGENLAYER_COVERED_LST_STRATEGIES[7].underlying_token,
        shareAccountingTokenAmount: 110n,
        tokenCustodyTokenAmount: 120n,
        directShareAccountingEthQuote: 111n,
        directTokenCustodyEthQuote: 121n,
      },
      {
        ...EIGENLAYER_COVERED_LST_STRATEGIES[8],
        underlyingToken: EIGENLAYER_COVERED_LST_STRATEGIES[8].underlying_token,
        shareAccountingTokenAmount: 130n,
        tokenCustodyTokenAmount: 140n,
        directShareAccountingEthQuote: 131n,
        directTokenCustodyEthQuote: 141n,
      },
    ],
    lsethLastCompletedEpochId: 123n,
    ethxOracleReportingBlockNumber: 1n,
    swethLastRepriceUnix: 0n,
    oethLastRebaseUnix: 0n,
    oethRebasePaused: true,
    oethWithdrawalClaimDelaySeconds: 0n,
    sources: ["ethereum_rpc"],
    sourceStatus,
    stale,
  });
}

describe("getEigenLayerLstEthQuotes", () => {
  it("localizes and sanitizes verified covered quotes without widening the measurement", () => {
    const result = getEigenLayerLstEthQuotes({
      lang: "en",
      adapterSnapshot: { ...verified(), summary: "https://rpc.example/credential-secret" },
    });

    expect(result.summary).toContain("Finalized 9/12 quotes (stETH/rETH/cbETH/ETHx/oETH/osETH/swETH/lsETH/mETH)");
    expect(result.summary).toContain("OETH is nominal unit accounting, not redeemability");
    expect(result.summary.length).toBeLessThanOrEqual(500);
    expect(JSON.stringify(result)).not.toContain("credential-secret");
  });

  it("localizes verified, stale, and unavailable evidence in English and Korean with every boundary explicit", () => {
    const unavailable = buildUnavailableEigenLayerLstEthQuotesSnapshot({
      summary: "https://rpc.example/credential-secret",
      gaps: [{ code: "rpc_access_gap", detail: "bounded" }],
      sources: ["ethereum_rpc"],
      sourceStatus,
    });
    const cases = [
      getEigenLayerLstEthQuotes({ lang: "en", adapterSnapshot: { ...verified(), summary: "https://rpc.example/credential-secret" } }),
      getEigenLayerLstEthQuotes({ lang: "en", adapterSnapshot: { ...verified(true), summary: "https://rpc.example/credential-secret" } }),
      getEigenLayerLstEthQuotes({ lang: "en", adapterSnapshot: unavailable }),
      getEigenLayerLstEthQuotes({ lang: "ko", adapterSnapshot: { ...verified(), summary: "https://rpc.example/credential-secret" } }),
      getEigenLayerLstEthQuotes({ lang: "ko", adapterSnapshot: { ...verified(true), summary: "https://rpc.example/credential-secret" } }),
      getEigenLayerLstEthQuotes({ lang: "ko", adapterSnapshot: unavailable }),
    ];

    for (const result of cases) {
      expect(result.summary).toMatch(/stETH\/rETH\/cbETH\/ETHx\/oETH\/osETH\/swETH\/lsETH\/mETH/);
      expect(result.summary).toContain("9/12");
      expect(result.summary).toMatch(/share\/custody are distinct partials|지분 회계와 보관 합계는 별도 부분합/);
      expect(result.summary.length).toBeLessThanOrEqual(500);
      expect(JSON.stringify(result)).not.toContain("credential-secret");
    }

    expect(cases[0]!.summary).toContain("Finalized-block verified");
    expect(cases[1]!.summary).toContain("Used after refresh failure");
    expect(cases[2]!.summary).toContain("No quotes observed");
    expect(cases[3]!.summary).toContain("최종화된 이더리움 블록에서 검증됐습니다");
    expect(cases[4]!.summary).toContain("새로고침 실패 후 캐시된 값을 사용합니다");
    expect(cases[5]!.summary).toContain("인용값은 관측되지 않았습니다");

    for (const result of cases.slice(0, 3)) {
      expect(result.summary).toMatch(/No full totals/);
      expect(result.summary).toMatch(/net ETH/);
      expect(result.summary).toMatch(/demand/);
      expect(result.summary).toMatch(/rehypothecation/);
      expect(result.summary).toMatch(/backing/);
      expect(result.summary).toContain("Freshness unverified: cbETH rate; ETHx report; oETH rebase; osETH virtual rewards; swETH reprice; lsETH report; mETH oracle record.");
      expect(result.summary).toContain("Proxy-source unverified: ETHx/oETH/swETH/lsETH.");
      expect(result.summary).toMatch(/async\/executable liquidity/);
    }
    for (const result of cases.slice(3)) {
      expect(result.summary).toMatch(/전체 총계/);
      expect(result.summary).toMatch(/순 ETH/);
      expect(result.summary).toMatch(/통합 수요/);
      expect(result.summary).toMatch(/재담보화/);
      expect(result.summary).toMatch(/담보/);
      expect(result.summary).toContain("최신성 미검증: cbETH 환율, ETHx 보고, oETH 리베이스, osETH 가상 보상, swETH 재가격, lsETH 보고, mETH 오라클 기록.");
      expect(result.summary).toContain("프록시-소스 일치성 미검증: ETHx/oETH/swETH/lsETH.");
      expect(result.summary).toMatch(/비동기\/실행 가능 유동성/);
    }
  });
});
