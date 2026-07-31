import {
  EthCollateralDemandSnapshotSchema,
  type EthCollateralDemandSnapshot,
} from "../eth_collateral_demand/types.js";
import type { Lang } from "../types.js";

export interface GetEthCollateralDemandArgs {
  lang: Lang;
  adapterSnapshot: EthCollateralDemandSnapshot;
}

function summaryFor(snapshot: EthCollateralDemandSnapshot, lang: Lang): string {
  const stale = snapshot.gaps.some((gap) => gap.code === "source_stale");
  if (lang === "ko") {
    if (snapshot.status === "unavailable") {
      return "Aave V3 Core ETH 계열 공급 수용량 증거를 현재 사용할 수 없습니다.";
    }
    if (stale) {
      return "새로고침 실패 후 캐시된 최종화 이더리움 블록의 Aave V3 Core ETH 계열 공급 수용량을 사용합니다.";
    }
    return "최종화된 이더리움 블록 기준으로 Aave V3 Core ETH 계열 공급 수용량을 검증했습니다.";
  }
  if (snapshot.status === "unavailable") {
    return "Aave V3 Core ETH-family supplied capacity evidence is unavailable.";
  }
  if (stale) {
    return "Cached finalized Ethereum Aave V3 Core ETH-family supplied capacity was used after refresh failure.";
  }
  return "Aave V3 Core ETH-family supplied capacity was verified at a finalized Ethereum block.";
}

/** Public localization and schema boundary around sanitized finalized Aave evidence. */
export function getEthCollateralDemand(args: GetEthCollateralDemandArgs): EthCollateralDemandSnapshot {
  const adapterSnapshot = EthCollateralDemandSnapshotSchema.parse(args.adapterSnapshot);
  return EthCollateralDemandSnapshotSchema.parse({
    ...adapterSnapshot,
    summary: summaryFor(adapterSnapshot, args.lang),
  });
}
