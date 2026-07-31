import {
  EthConsensusRewardsCrossCheckSnapshotSchema,
  type EthConsensusRewardsCrossCheckSnapshot,
} from "../eth_consensus_rewards/types.js";
import type { Lang } from "../types.js";

export interface GetEthConsensusRewardsCrossCheckArgs {
  lang: Lang;
  adapterSnapshot: EthConsensusRewardsCrossCheckSnapshot;
}

function summaryFor(snapshot: EthConsensusRewardsCrossCheckSnapshot, lang: Lang): string {
  const stale = snapshot.gaps.some((gap) => gap.code === "source_stale");
  if (lang === "ko") {
    if (snapshot.status === "unavailable") return "이더리움 합의 보상 증거를 현재 사용할 수 없습니다.";
    if (stale) return "새로고침 실패 후 캐시된 최종화 이더리움 합의 보상 구성요소 증거를 사용합니다.";
    return "최종화된 에포크를 기준으로 이더리움 합의 보상 구성요소를 검증했습니다.";
  }
  if (snapshot.status === "unavailable") return "Ethereum consensus reward evidence is unavailable.";
  if (stale) return "Cached finalized Ethereum consensus reward component evidence was used after refresh failure.";
  return "Ethereum consensus reward components were verified against a finalized epoch.";
}

/** Public localization and schema boundary around sanitized Beacon adapter output. */
export function getEthConsensusRewardsCrossCheck(
  args: GetEthConsensusRewardsCrossCheckArgs,
): EthConsensusRewardsCrossCheckSnapshot {
  const adapterSnapshot = EthConsensusRewardsCrossCheckSnapshotSchema.parse(args.adapterSnapshot);
  return EthConsensusRewardsCrossCheckSnapshotSchema.parse({
    ...adapterSnapshot,
    summary: summaryFor(adapterSnapshot, args.lang),
  });
}
