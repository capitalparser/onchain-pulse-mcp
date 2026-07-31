import {
  LidoPooledEthBackingSnapshotSchema,
  type LidoPooledEthBackingSnapshot,
} from "../lido_pooled_eth_backing/types.js";
import type { Lang } from "../types.js";

export interface GetLidoPooledEthBackingArgs {
  lang: Lang;
  adapterSnapshot: LidoPooledEthBackingSnapshot;
}

function summaryFor(snapshot: LidoPooledEthBackingSnapshot, lang: Lang): string {
  const stale = snapshot.gaps.some((gap) => gap.code === "source_stale");
  if (lang === "ko") {
    if (snapshot.status === "unavailable") return "Lido pooled ETH backing 증거를 현재 사용할 수 없습니다.";
    if (stale) return "새로고침 실패 후 캐시된 최종화 이더리움 블록의 Lido pooled ETH backing을 사용합니다.";
    return "최종화된 이더리움 블록에서 Lido pooled ETH backing을 검증했습니다.";
  }
  if (snapshot.status === "unavailable") return "Lido pooled ETH backing evidence is unavailable.";
  if (stale) return "Cached finalized Ethereum Lido pooled ETH backing was used after refresh failure.";
  return "Lido pooled ETH backing was verified at a finalized Ethereum block.";
}

/** Public localization and schema boundary around sanitized finalized Lido evidence. */
export function getLidoPooledEthBacking(args: GetLidoPooledEthBackingArgs): LidoPooledEthBackingSnapshot {
  const adapterSnapshot = LidoPooledEthBackingSnapshotSchema.parse(args.adapterSnapshot);
  return LidoPooledEthBackingSnapshotSchema.parse({ ...adapterSnapshot, summary: summaryFor(adapterSnapshot, args.lang) });
}
