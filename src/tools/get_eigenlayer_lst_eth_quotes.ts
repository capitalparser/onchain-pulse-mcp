import {
  EigenLayerLstEthQuotesSnapshotSchema,
  type EigenLayerLstEthQuotesSnapshot,
} from "../eigenlayer_lst_eth_quotes/types.js";
import type { Lang } from "../types.js";

export interface GetEigenLayerLstEthQuotesArgs {
  lang: Lang;
  adapterSnapshot: EigenLayerLstEthQuotesSnapshot;
}

const EN_BASE = "Finalized stETH/rETH/cbETH/ETHx/osETH/swETH/lsETH/mETH quotes: 8/12; share/custody distinct partials.";
const EN_LIMITATION = "No full LST/native/EigenLayer total, net ETH, protocol demand, rehypothecation, backing, or executable exit capacity; unverified: cbETH rate freshness, ETHx report freshness or proxy correspondence, osETH virtual-reward-input freshness, swETH reprice freshness or proxy correspondence, lsETH report freshness or proxy correspondence, mETH oracle-record freshness.";
const EN_UNAVAILABLE = "No quotes observed for stETH/rETH/cbETH/ETHx/osETH/swETH/lsETH/mETH (8/12); share/custody distinct partials.";
const KO_BASE = "최종화된 직접 회계 인용값(stETH/rETH/cbETH/ETHx/osETH/swETH/lsETH/mETH)은 고정 전략 12개 중 8개만 다루며, 지분 회계와 토큰 보관 합계는 서로 다른 부분 합계입니다.";
const KO_LIMITATION = "이는 전체 LST/네이티브/EigenLayer 총계, 고유/순 락업 ETH, Aave/Spark/Lido/Sky/EigenLayer 통합 수요, 재담보화, 독립적인 담보 대사, cbETH 환율 최신성, ETHx 보고 최신성 또는 프록시 일치성, osETH 가상 보상 입력 최신성, swETH 재가격 최신성 또는 프록시 일치성, lsETH 보고 최신성 또는 프록시 일치성, mETH 오라클 기록 최신성, 실행 가능한 출금/유동성을 입증하지 않습니다.";
const KO_UNAVAILABLE = "stETH/rETH/cbETH/ETHx/osETH/swETH/lsETH/mETH의 고정 전략 12개 중 8개 직접 회계 인용 뷰는 현재 사용할 수 없으며, 인용값은 관측되지 않았습니다. 정의된 지분 회계와 토큰 보관 합계는 서로 다른 부분 합계입니다.";

function summaryFor(snapshot: EigenLayerLstEthQuotesSnapshot, lang: Lang): string {
  const stale = snapshot.gaps.some((gap) => gap.code === "source_stale");
  if (lang === "ko") {
    if (snapshot.status === "unavailable") return `${KO_UNAVAILABLE} ${KO_LIMITATION}`;
    if (stale) return `${KO_BASE} 새로고침 실패 후 캐시된 값을 사용합니다. ${KO_LIMITATION}`;
    return `${KO_BASE} 최종화된 이더리움 블록에서 검증됐습니다. ${KO_LIMITATION}`;
  }
  if (snapshot.status === "unavailable") return `${EN_UNAVAILABLE} ${EN_LIMITATION}`;
  if (stale) return `${EN_BASE} Used after refresh failure. ${EN_LIMITATION}`;
  return `${EN_BASE} Finalized-block verified. ${EN_LIMITATION}`;
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
