import {
  EigenLayerEthRestakingExposureSnapshotSchema,
  type EigenLayerEthRestakingExposureSnapshot,
} from "../eigenlayer_eth_restaking/types.js";
import type { Lang } from "../types.js";

export interface GetEigenLayerEthRestakingExposureArgs {
  lang: Lang;
  adapterSnapshot: EigenLayerEthRestakingExposureSnapshot;
}

const EN_BASE = "fixed legacy EigenLayer ETH-family LST strategy token-unit exposure and native-restaking diagnostics";
const KO_BASE = "고정된 레거시 EigenLayer ETH 계열 LST 전략 토큰 단위 익스포저와 네이티브 재스테이킹 진단";
const EN_LIMITATION = "It does not measure a native-restaked ETH total, an ETH-equivalent LST total, unique or net ETH locked, combined Aave/Spark/Lido/Sky/EigenLayer demand, or a rehypothecation ratio, and the share-accounting conversion is not executable withdrawal capacity.";
const KO_LIMITATION = "이는 네이티브 재스테이킹 ETH 총량, ETH 환산 LST 총량, 고유 또는 순 ETH 락업, Aave/Spark/Lido/Sky/EigenLayer 통합 수요, 재담보화 비율 또는 실행 가능한 출금 용량을 측정하지 않습니다.";

function summaryFor(snapshot: EigenLayerEthRestakingExposureSnapshot, lang: Lang): string {
  const stale = snapshot.gaps.some((gap) => gap.code === "source_stale");
  if (lang === "ko") {
    if (snapshot.status === "unavailable") return `${KO_BASE}을 현재 사용할 수 없습니다. ${KO_LIMITATION}`;
    if (stale) return `새로고침 실패 후 캐시된 최종화 이더리움 블록의 ${KO_BASE}을 사용합니다. ${KO_LIMITATION}`;
    return `최종화된 이더리움 블록에서 ${KO_BASE}을 검증했습니다. ${KO_LIMITATION}`;
  }
  if (snapshot.status === "unavailable") return `Fixed legacy EigenLayer ETH-family LST strategy token-unit exposure and native-restaking diagnostics are unavailable. ${EN_LIMITATION}`;
  if (stale) return `Cached finalized Ethereum ${EN_BASE} were used after refresh failure. ${EN_LIMITATION}`;
  return `Fixed legacy EigenLayer ETH-family LST strategy token-unit exposure and native-restaking diagnostics were verified at a finalized Ethereum block. ${EN_LIMITATION}`;
}

/** Public localization and schema boundary around sanitized finalized EigenLayer evidence. */
export function getEigenLayerEthRestakingExposure(
  args: GetEigenLayerEthRestakingExposureArgs,
): EigenLayerEthRestakingExposureSnapshot {
  const adapterSnapshot = EigenLayerEthRestakingExposureSnapshotSchema.parse(args.adapterSnapshot);
  return EigenLayerEthRestakingExposureSnapshotSchema.parse({ ...adapterSnapshot, summary: summaryFor(adapterSnapshot, args.lang) });
}
