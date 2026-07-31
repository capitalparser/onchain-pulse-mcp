import {
  EigenLayerLstEthQuotesSnapshotSchema,
  type EigenLayerLstEthQuotesSnapshot,
} from "../eigenlayer_lst_eth_quotes/types.js";
import type { Lang } from "../types.js";

export interface GetEigenLayerLstEthQuotesArgs {
  lang: Lang;
  adapterSnapshot: EigenLayerLstEthQuotesSnapshot;
}

const EN_BASE = "Finalized stETH/rETH/cbETH/ETHx/osETH/lsETH/mETH direct accounting quotes cover 7 of 12; share/custody are distinct partials.";
const EN_LIMITATION = "Not full LST/native/EigenLayer totals, unique/net locked ETH, combined Aave/Spark/Lido/Sky/EigenLayer demand, rehypothecation, independent backing, or executable withdrawal/liquidity; cbETH exchange-rate, ETHx oracle-report/proxy, osETH virtual-reward-input, lsETH oracle-report/proxy, and mETH oracle-record freshness unverified.";
const EN_UNAVAILABLE = "Direct accounting view for 7 of 12 (stETH/rETH/cbETH/ETHx/osETH/lsETH/mETH): unavailable; no quotes were observed; share/custody are distinct partials.";
const KO_BASE = "최종화된 직접 회계 인용값(stETH/rETH/cbETH/ETHx/osETH/lsETH/mETH)은 고정 전략 12개 중 7개만 다루며, 지분 회계와 토큰 보관 합계는 서로 다른 부분 합계입니다.";
const KO_LIMITATION = "이는 전체 LST/네이티브/EigenLayer 총계, 고유/순 락업 ETH, Aave/Spark/Lido/Sky/EigenLayer 통합 수요, 재담보화, 독립적인 담보 대사, cbETH 환율 최신성, ETHx 오라클 보고 최신성 또는 프록시 구현 일치성, osETH 가상 보상 입력 최신성, lsETH 오라클 보고 최신성 또는 프록시 구현 일치성, mETH 오라클 기록 최신성, 실행 가능한 출금/유동성을 입증하지 않습니다.";
const KO_UNAVAILABLE = "stETH/rETH/cbETH/ETHx/osETH/lsETH/mETH의 고정 전략 12개 중 7개 직접 회계 인용 뷰는 현재 사용할 수 없으며, 인용값은 관측되지 않았습니다. 정의된 지분 회계와 토큰 보관 합계는 서로 다른 부분 합계입니다.";

function summaryFor(snapshot: EigenLayerLstEthQuotesSnapshot, lang: Lang): string {
  const stale = snapshot.gaps.some((gap) => gap.code === "source_stale");
  if (lang === "ko") {
    if (snapshot.status === "unavailable") return `${KO_UNAVAILABLE} ${KO_LIMITATION}`;
    if (stale) return `${KO_BASE} 새로고침 실패 후 캐시된 값을 사용합니다. ${KO_LIMITATION}`;
    return `${KO_BASE} 최종화된 이더리움 블록에서 검증됐습니다. ${KO_LIMITATION}`;
  }
  if (snapshot.status === "unavailable") return `${EN_UNAVAILABLE} ${EN_LIMITATION}`;
  if (stale) return `${EN_BASE} Used after refresh failure. ${EN_LIMITATION}`;
  return `${EN_BASE} Verified at finalized Ethereum block. ${EN_LIMITATION}`;
}

/** Public localization and schema boundary around sanitized finalized quote evidence. */
export function getEigenLayerLstEthQuotes(
  args: GetEigenLayerLstEthQuotesArgs,
): EigenLayerLstEthQuotesSnapshot {
  const adapterSnapshot = EigenLayerLstEthQuotesSnapshotSchema.parse(args.adapterSnapshot);
  return EigenLayerLstEthQuotesSnapshotSchema.parse({
    ...adapterSnapshot,
    summary: summaryFor(adapterSnapshot, args.lang),
  });
}
