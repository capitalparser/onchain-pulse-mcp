import {
  EigenLayerLstEthQuotesSnapshotSchema,
  type EigenLayerLstEthQuotesSnapshot,
} from "../eigenlayer_lst_eth_quotes/types.js";
import type { Lang } from "../types.js";

export interface GetEigenLayerLstEthQuotesArgs {
  lang: Lang;
  adapterSnapshot: EigenLayerLstEthQuotesSnapshot;
}

const EN_BASE = "Finalized 9/12 quotes (stETH/rETH/cbETH/ETHx/oETH/osETH/swETH/lsETH/mETH); share/custody are distinct partials. OETH is nominal unit accounting, not redeemability.";
const EN_LIMITATION = "No full totals, net ETH, demand, rehypothecation, backing, or async/executable liquidity. Freshness unverified: cbETH rate; ETHx report; oETH rebase; osETH virtual rewards; swETH reprice; lsETH report; mETH oracle record. Proxy-source unverified: ETHx/oETH/swETH/lsETH.";
const EN_UNAVAILABLE = "No quotes observed for the 9/12 target (stETH/rETH/cbETH/ETHx/oETH/osETH/swETH/lsETH/mETH); share/custody are distinct partials. OETH target is nominal unit accounting, not redeemability.";
const KO_BASE = "최종화된 9/12 인용(stETH/rETH/cbETH/ETHx/oETH/osETH/swETH/lsETH/mETH)이며 지분 회계와 보관 합계는 별도 부분합입니다. OETH는 명목 단위 회계이며 상환 가능성이 아닙니다.";
const KO_LIMITATION = "전체 총계, 순 ETH, 통합 수요, 재담보화, 담보, 비동기/실행 가능 유동성을 입증하지 않습니다. 최신성 미검증: cbETH 환율, ETHx 보고, oETH 리베이스, osETH 가상 보상, swETH 재가격, lsETH 보고, mETH 오라클 기록. 프록시-소스 일치성 미검증: ETHx/oETH/swETH/lsETH.";
const KO_UNAVAILABLE = "9/12 대상(stETH/rETH/cbETH/ETHx/oETH/osETH/swETH/lsETH/mETH) 인용값은 관측되지 않았습니다. 지분 회계와 보관 합계는 별도 부분합이며 OETH 대상은 명목 단위 회계이지 상환 가능성이 아닙니다.";

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
