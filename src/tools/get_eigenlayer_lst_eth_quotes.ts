import {
  EigenLayerLstEthQuotesSnapshotSchema,
  type EigenLayerLstEthQuotesSnapshot,
} from "../eigenlayer_lst_eth_quotes/types.js";
import type { Lang } from "../types.js";

export interface GetEigenLayerLstEthQuotesArgs {
  lang: Lang;
  adapterSnapshot: EigenLayerLstEthQuotesSnapshot;
}

const EN_BASE = "Finalized direct protocol-accounting quotes for stETH/rETH/cbETH/osETH/mETH cover only 5 of 12 fixed strategies; share-accounting and custody sums are distinct partials.";
const EN_LIMITATION = "Not full LST/native/EigenLayer totals, unique/net locked ETH, combined Aave/Spark/Lido/Sky/EigenLayer demand, rehypothecation, independent backing, cbETH/osETH reward/mETH oracle-record freshness, or executable withdrawal/liquidity.";
const EN_UNAVAILABLE = "The bounded direct protocol-accounting view for 5 of 12 fixed strategies (stETH/rETH/cbETH/osETH/mETH) is unavailable; no quotes were observed. Its defined share-accounting and custody sums are distinct partials.";
const KO_BASE = "최종화된 직접 프로토콜 회계 인용값(stETH/rETH/cbETH/osETH/mETH)은 고정 전략 12개 중 5개만 다루며, 지분 회계와 토큰 보관 합계는 서로 다른 부분 합계입니다.";
const KO_LIMITATION = "이는 전체 LST/네이티브/EigenLayer 총계, 고유/순 락업 ETH, Aave/Spark/Lido/Sky/EigenLayer 통합 수요, 재담보화, 독립 담보, cbETH/osETH 보상/mETH 오라클 기록 최신성, 실행 가능한 출금/유동성을 입증하지 않습니다.";
const KO_UNAVAILABLE = "stETH/rETH/cbETH/osETH/mETH의 고정 전략 12개 중 5개 직접 프로토콜 회계 인용 뷰는 현재 사용할 수 없으며, 인용값은 관측되지 않았습니다. 정의된 지분 회계와 토큰 보관 합계는 서로 다른 부분 합계입니다.";

function summaryFor(snapshot: EigenLayerLstEthQuotesSnapshot, lang: Lang): string {
  const stale = snapshot.gaps.some((gap) => gap.code === "source_stale");
  if (lang === "ko") {
    if (snapshot.status === "unavailable") return `${KO_UNAVAILABLE} ${KO_LIMITATION}`;
    if (stale) return `${KO_BASE} 새로고침 실패 후 캐시된 값을 사용합니다. ${KO_LIMITATION}`;
    return `${KO_BASE} 최종화된 이더리움 블록에서 검증됐습니다. ${KO_LIMITATION}`;
  }
  if (snapshot.status === "unavailable") return `${EN_UNAVAILABLE} ${EN_LIMITATION}`;
  if (stale) return `${EN_BASE} They were used after refresh failure. ${EN_LIMITATION}`;
  return `${EN_BASE} They were verified at a finalized Ethereum block. ${EN_LIMITATION}`;
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
