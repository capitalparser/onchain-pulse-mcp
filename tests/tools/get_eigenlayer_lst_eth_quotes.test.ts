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
    ],
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

    expect(result.summary).toContain("Exact finalized stETH/rETH/cbETH accounting quotes cover only 3 of 12 fixed legacy strategies");
    expect(result.summary).toContain("covered share-accounting and token-custody partial ETH-equivalent sums");
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
      expect(result.summary).toMatch(/stETH\/rETH\/cbETH/);
      expect(result.summary).toMatch(/3 of 12 fixed legacy strategies|고정 레거시 전략 12개 중 3개/);
      expect(result.summary).toMatch(/covered share-accounting and token-custody partial ETH-equivalent sums|포함된 지분 회계와 토큰 보관의 부분 ETH 환산 합계/);
      expect(JSON.stringify(result)).not.toContain("credential-secret");
    }

    expect(cases[0]!.summary).toContain("verified at a finalized Ethereum block");
    expect(cases[1]!.summary).toContain("used after refresh failure");
    expect(cases[2]!.summary).toContain("are unavailable");
    expect(cases[3]!.summary).toContain("최종화된 이더리움 블록에서 검증됐습니다");
    expect(cases[4]!.summary).toContain("새로고침 실패 후 캐시된 값을 사용합니다");
    expect(cases[5]!.summary).toContain("현재 사용할 수 없습니다");

    for (const result of cases.slice(0, 3)) {
      expect(result.summary).toMatch(/full LST, native-restaked ETH, or total EigenLayer exposure/);
      expect(result.summary).toMatch(/unique or net ETH locked/);
      expect(result.summary).toMatch(/combined Aave\/Spark\/Lido\/Sky\/EigenLayer demand/);
      expect(result.summary).toMatch(/rehypothecation/);
      expect(result.summary).toMatch(/issuer backing reconciliation/);
      expect(result.summary).toMatch(/rate freshness/);
      expect(result.summary).toMatch(/executable withdrawal capacity/);
    }
    for (const result of cases.slice(3)) {
      expect(result.summary).toMatch(/전체 LST, 네이티브 재스테이킹 ETH 또는 EigenLayer 총 익스포저/);
      expect(result.summary).toMatch(/고유 또는 순 ETH 락업/);
      expect(result.summary).toMatch(/Aave\/Spark\/Lido\/Sky\/EigenLayer 통합 수요/);
      expect(result.summary).toMatch(/재담보화/);
      expect(result.summary).toMatch(/발행자 담보 조정/);
      expect(result.summary).toMatch(/환율 최신성/);
      expect(result.summary).toMatch(/실행 가능한 출금 용량/);
    }
  });
});
