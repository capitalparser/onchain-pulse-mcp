import {
  SkyEthCollateralCustodySnapshotSchema,
  type SkyEthCollateralCustodySnapshot,
} from "../sky_eth_collateral_custody/types.js";
import type { Lang } from "../types.js";

export interface GetSkyEthCollateralCustodyArgs {
  lang: Lang;
  adapterSnapshot: SkyEthCollateralCustodySnapshot;
}

function limitation(lang: Lang): string {
  return lang === "ko"
    ? "이는 활성 Vault 담보, 실제 사용자 담보, 고유 또는 순 ETH 락업, Aave/Spark/Lido/Sky 통합 수요 또는 재담보화를 측정하지 않습니다."
    : "It does not measure active Vault collateral, actual user collateral, unique or net ETH locked, combined Aave/Spark/Lido/Sky demand, or rehypothecation.";
}

function summaryFor(snapshot: SkyEthCollateralCustodySnapshot, lang: Lang): string {
  const stale = snapshot.gaps.some((gap) => gap.code === "source_stale");
  if (lang === "ko") {
    if (snapshot.status === "unavailable") return `레거시 Maker/Sky ETH 계열 어댑터 보관 토큰 증거를 현재 사용할 수 없습니다. ${limitation(lang)}`;
    if (stale) return `새로고침 실패 후 캐시된 최종화 이더리움 블록의 레거시 Maker/Sky ETH 계열 어댑터 보관 토큰을 사용합니다. ${limitation(lang)}`;
    return `최종화된 이더리움 블록에서 레거시 Maker/Sky ETH 계열 어댑터 보관 토큰을 검증했습니다. ${limitation(lang)}`;
  }
  if (snapshot.status === "unavailable") return `Legacy Maker/Sky ETH-family adapter-held token custody evidence is unavailable. ${limitation(lang)}`;
  if (stale) return `Cached finalized Ethereum legacy Maker/Sky ETH-family adapter-held token custody was used after refresh failure. ${limitation(lang)}`;
  return `Legacy Maker/Sky ETH-family adapter-held token custody was verified at a finalized Ethereum block. ${limitation(lang)}`;
}

/** Public localization and schema boundary around sanitized finalized Sky adapter custody evidence. */
export function getSkyEthCollateralCustody(args: GetSkyEthCollateralCustodyArgs): SkyEthCollateralCustodySnapshot {
  const adapterSnapshot = SkyEthCollateralCustodySnapshotSchema.parse(args.adapterSnapshot);
  return SkyEthCollateralCustodySnapshotSchema.parse({ ...adapterSnapshot, summary: summaryFor(adapterSnapshot, args.lang) });
}
