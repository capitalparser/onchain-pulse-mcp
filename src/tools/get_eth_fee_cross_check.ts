import {
  EthFeeCrossCheckSnapshotSchema,
  type EthFeeCrossCheckSnapshot,
} from "../eth_fee_cross_check/types.js";
import type { Lang } from "../types.js";

export interface GetEthFeeCrossCheckArgs {
  lang: Lang;
  adapterSnapshot: EthFeeCrossCheckSnapshot;
}

function summaryFor(snapshot: EthFeeCrossCheckSnapshot, lang: Lang): string {
  const stale = snapshot.gaps.some((gap) => gap.code === "source_stale");
  if (lang === "ko") {
    if (snapshot.status === "unavailable") {
      return "이더리움 실행 수수료 증거를 현재 사용할 수 없습니다.";
    }
    if (stale) {
      return "새로고침 실패 후 캐시된 최종화 이더리움 실행 수수료 증거를 사용합니다.";
    }
    return "최종화된 블록을 기준으로 이더리움 실행 수수료 증거를 검증했습니다.";
  }
  if (snapshot.status === "unavailable") {
    return "Ethereum execution fee evidence is unavailable.";
  }
  if (stale) {
    return "Cached finalized Ethereum execution fee evidence was used after refresh failure.";
  }
  return "Ethereum execution fee evidence was verified against finalized blocks.";
}

/**
 * Public localization and schema boundary around the sanitized RPC adapter
 * result. The adapter owns transport, cache, and provider-secret handling.
 */
export function getEthFeeCrossCheck(args: GetEthFeeCrossCheckArgs): EthFeeCrossCheckSnapshot {
  const adapterSnapshot = EthFeeCrossCheckSnapshotSchema.parse(args.adapterSnapshot);
  return EthFeeCrossCheckSnapshotSchema.parse({
    ...adapterSnapshot,
    summary: summaryFor(adapterSnapshot, args.lang),
  });
}
