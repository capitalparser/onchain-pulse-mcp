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
        directShareAccountingEthQuote: 71n,
        directTokenCustodyEthQuote: 81n,
      },
      {
        ...EIGENLAYER_COVERED_LST_STRATEGIES[5],
        underlyingToken: EIGENLAYER_COVERED_LST_STRATEGIES[5].underlying_token,
        shareAccountingTokenAmount: 85n,
        tokenCustodyTokenAmount: 95n,
        swethToEthRate: 1_000_000_000_000_000_000n,
      },
      {
        ...EIGENLAYER_COVERED_LST_STRATEGIES[6],
        underlyingToken: EIGENLAYER_COVERED_LST_STRATEGIES[6].underlying_token,
        shareAccountingTokenAmount: 90n,
        tokenCustodyTokenAmount: 100n,
        directShareAccountingEthQuote: 91n,
        directTokenCustodyEthQuote: 101n,
      },
      {
        ...EIGENLAYER_COVERED_LST_STRATEGIES[7],
        underlyingToken: EIGENLAYER_COVERED_LST_STRATEGIES[7].underlying_token,
        shareAccountingTokenAmount: 110n,
        tokenCustodyTokenAmount: 120n,
        directShareAccountingEthQuote: 111n,
        directTokenCustodyEthQuote: 121n,
      },
    ],
    lsethLastCompletedEpochId: 123n,
    ethxOracleReportingBlockNumber: 1n,
    swethLastRepriceUnix: 0n,
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

    expect(result.summary).toContain("Finalized stETH/rETH/cbETH/ETHx/osETH/swETH/lsETH/mETH quotes: 8/12");
    expect(result.summary).toContain("share/custody distinct partials");
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
      expect(result.summary).toMatch(/stETH\/rETH\/cbETH\/ETHx\/osETH\/swETH\/lsETH\/mETH/);
      expect(result.summary).toMatch(/8\/12|고정 전략 12개 중 8개/);
      expect(result.summary).toMatch(/share\/custody distinct partials|지분 회계와 토큰 보관 합계는 서로 다른 부분 합계/);
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
      expect(result.summary).toMatch(/No full LST\/native\/EigenLayer total/);
      expect(result.summary).toMatch(/net ETH/);
      expect(result.summary).toMatch(/protocol demand/);
      expect(result.summary).toMatch(/rehypothecation/);
      expect(result.summary).toMatch(/backing/);
      expect(result.summary).toContain("unverified: cbETH rate freshness, ETHx report freshness or proxy correspondence, osETH virtual-reward-input freshness, swETH reprice freshness or proxy correspondence, lsETH report freshness or proxy correspondence, mETH oracle-record freshness.");
      expect(result.summary).toMatch(/executable exit capacity/);
    }
    for (const result of cases.slice(3)) {
      expect(result.summary).toMatch(/전체 LST\/네이티브\/EigenLayer 총계/);
      expect(result.summary).toMatch(/고유\/순 락업 ETH/);
      expect(result.summary).toMatch(/Aave\/Spark\/Lido\/Sky\/EigenLayer 통합 수요/);
      expect(result.summary).toMatch(/재담보화/);
      expect(result.summary).toMatch(/독립적인 담보 대사/);
      expect(result.summary).toMatch(/cbETH 환율 최신성, ETHx 보고 최신성 또는 프록시 일치성, osETH 가상 보상 입력 최신성, swETH 재가격 최신성 또는 프록시 일치성, lsETH 보고 최신성 또는 프록시 일치성, mETH 오라클 기록 최신성/);
      expect(result.summary).toMatch(/실행 가능한 출금\/유동성/);
    }
  });
});
