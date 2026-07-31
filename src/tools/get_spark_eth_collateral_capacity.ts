import {
  SparkCollateralCapacitySnapshotSchema,
  type SparkCollateralCapacitySnapshot,
} from "../spark_collateral_capacity/types.js";
import type { Lang } from "../types.js";

export interface GetSparkEthCollateralCapacityArgs {
  lang: Lang;
  adapterSnapshot: SparkCollateralCapacitySnapshot;
}

function summaryFor(snapshot: SparkCollateralCapacitySnapshot, lang: Lang): string {
  const stale = snapshot.gaps.some((gap) => gap.code === "source_stale");
  if (lang === "ko") {
    if (snapshot.status === "unavailable") return "SparkLend ETH 계열 공급 수용량 증거를 현재 사용할 수 없습니다.";
    if (stale) return "새로고침 실패 후 캐시된 최종화 이더리움 블록의 SparkLend ETH 계열 공급 수용량을 사용합니다.";
    return "최종화된 이더리움 블록 기준으로 SparkLend ETH 계열 공급 수용량을 검증했습니다.";
  }
  if (snapshot.status === "unavailable") return "SparkLend ETH-family supplied capacity evidence is unavailable.";
  if (stale) return "Cached finalized Ethereum SparkLend ETH-family supplied capacity was used after refresh failure.";
  return "SparkLend ETH-family supplied capacity was verified at a finalized Ethereum block.";
}

/** Public localization and schema boundary around sanitized finalized Spark evidence. */
export function getSparkEthCollateralCapacity(args: GetSparkEthCollateralCapacityArgs): SparkCollateralCapacitySnapshot {
  const adapterSnapshot = SparkCollateralCapacitySnapshotSchema.parse(args.adapterSnapshot);
  return SparkCollateralCapacitySnapshotSchema.parse({ ...adapterSnapshot, summary: summaryFor(adapterSnapshot, args.lang) });
}
