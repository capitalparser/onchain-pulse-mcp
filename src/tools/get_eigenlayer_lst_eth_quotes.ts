import {
  EigenLayerLstEthQuotesSnapshotSchema,
  type EigenLayerLstEthQuotesSnapshot,
} from "../eigenlayer_lst_eth_quotes/types.js";
import type { Lang } from "../types.js";

export interface GetEigenLayerLstEthQuotesArgs {
  lang: Lang;
  adapterSnapshot: EigenLayerLstEthQuotesSnapshot;
}

const EN_BASE = "Exact finalized stETH/rETH/cbETH accounting quotes cover only 3 of 12 fixed legacy strategies, with separate covered share-accounting and token-custody partial ETH-equivalent sums.";
const EN_LIMITATION = "They do not establish full LST, native-restaked ETH, or total EigenLayer exposure; unique or net ETH locked; combined Aave/Spark/Lido/Sky/EigenLayer demand; rehypothecation; issuer backing reconciliation; rate freshness; or executable withdrawal capacity.";
const KO_BASE = "정확한 최종화 stETH/rETH/cbETH 회계 인용값은 고정 레거시 전략 12개 중 3개만 다루며, 포함된 지분 회계와 토큰 보관의 부분 ETH 환산 합계를 구분합니다.";
const KO_LIMITATION = "이는 전체 LST, 네이티브 재스테이킹 ETH 또는 EigenLayer 총 익스포저, 고유 또는 순 ETH 락업, Aave/Spark/Lido/Sky/EigenLayer 통합 수요, 재담보화, 발행자 담보 조정, 환율 최신성 또는 실행 가능한 출금 용량을 입증하지 않습니다.";

function summaryFor(snapshot: EigenLayerLstEthQuotesSnapshot, lang: Lang): string {
  const stale = snapshot.gaps.some((gap) => gap.code === "source_stale");
  if (lang === "ko") {
    if (snapshot.status === "unavailable") return `${KO_BASE} 현재 사용할 수 없습니다. ${KO_LIMITATION}`;
    if (stale) return `${KO_BASE} 새로고침 실패 후 캐시된 값을 사용합니다. ${KO_LIMITATION}`;
    return `${KO_BASE} 최종화된 이더리움 블록에서 검증됐습니다. ${KO_LIMITATION}`;
  }
  if (snapshot.status === "unavailable") return `${EN_BASE} They are unavailable. ${EN_LIMITATION}`;
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
