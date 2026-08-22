import type { Lang } from "../types.js";
import type {
  EcosystemRatioMetric,
  EcosystemUsdWindowMetric,
  EthEcosystemCaptureSnapshot,
} from "./types.js";
import { EthEcosystemCaptureSnapshotSchema } from "./types.js";
import type {
  EcosystemPeriodPair,
  GrowThePieEcosystemResult,
} from "../adapters/eth_ecosystem_growthepie.js";
import type { EthWindow } from "../eth_value_capture/types.js";

function finiteOrNull(value: number | null): number | null {
  return value !== null && Number.isFinite(value) ? value : null;
}

function usdMetric(pair: EcosystemPeriodPair): EcosystemUsdWindowMetric {
  const current = finiteOrNull(pair.current);
  const previous = finiteOrNull(pair.previous);
  const comparable = current !== null && previous !== null;
  return {
    current,
    previous,
    delta: comparable ? current - previous : null,
    pct_change:
      comparable && previous !== 0
        ? (current - previous) / Math.abs(previous)
        : null,
    unit: "USD",
  };
}

function ratioMetric(pair: EcosystemPeriodPair): EcosystemRatioMetric {
  const current = finiteOrNull(pair.current);
  const previous = finiteOrNull(pair.previous);
  return {
    current,
    previous,
    delta: current !== null && previous !== null ? current - previous : null,
    unit: "ratio",
  };
}

function summaryFor(
  status: EthEcosystemCaptureSnapshot["status"],
  lang: Lang,
): string {
  if (lang === "ko") {
    if (status === "complete") {
      return "Ethereum 데이터 가용성을 사용하는 L2의 사용자 수수료·Ethereum 정산비용과 Ethereum L1·L2 스테이블코인 공급이 동일 기간으로 정렬되었습니다.";
    }
    if (status === "partial") {
      return "Ethereum 생태계 성장과 ETH 정산 가치귀속 지표가 일부 제공됩니다. 포함 체인·결측·외부 DA 제외 범위를 확인하세요.";
    }
    return "현재 Ethereum 생태계 성장과 ETH 정산 가치귀속 지표를 제공할 수 없습니다.";
  }
  if (status === "complete") {
    return "Ethereum-DA L2 user fees, Ethereum settlement costs, and Ethereum L1/L2 stablecoin supply are aligned to the same bounded periods.";
  }
  if (status === "partial") {
    return "Ethereum ecosystem growth and ETH settlement-capture metrics are partially available; review chain coverage, gaps, and external-DA exclusions.";
  }
  return "Ethereum ecosystem growth and ETH settlement-capture metrics are currently unavailable.";
}

export function buildEthEcosystemCapture(args: {
  window: EthWindow;
  lang: Lang;
  adapter: GrowThePieEcosystemResult;
  now: Date;
}): EthEcosystemCaptureSnapshot {
  const staleData = args.adapter.sourceStatus
    .filter((source) => source.stale)
    .map((source) => source.source);
  const status: EthEcosystemCaptureSnapshot["status"] =
    args.adapter.status === "valid" && !args.adapter.stale && args.adapter.gaps.length === 0
      ? "complete"
      : args.adapter.status === "unavailable"
        ? "unavailable"
        : "partial";

  const snapshot: EthEcosystemCaptureSnapshot = {
    summary: summaryFor(status, args.lang),
    window: args.window,
    cutoff_day: args.adapter.cutoffDay,
    as_of: args.adapter.asOf ?? args.now.toISOString(),
    status,
    metrics: {
      l2_user_fees_usd: usdMetric(args.adapter.metrics.l2UserFeesUsd),
      l2_rent_paid_usd: usdMetric(args.adapter.metrics.l2RentPaidUsd),
      l2_settlement_cost_share: ratioMetric(args.adapter.metrics.l2SettlementCostShare),
      ethereum_l1_stablecoin_supply_usd: usdMetric(
        args.adapter.metrics.ethereumL1StablecoinSupplyUsd,
      ),
      ethereum_l2_stablecoin_supply_usd: usdMetric(
        args.adapter.metrics.ethereumL2StablecoinSupplyUsd,
      ),
      ethereum_ecosystem_stablecoin_supply_usd: usdMetric(
        args.adapter.metrics.ethereumEcosystemStablecoinSupplyUsd,
      ),
    },
    coverage: {
      included_l2_count: args.adapter.includedL2Origins.length,
      included_l2_origins: [...args.adapter.includedL2Origins],
      excluded_external_da_origins: [...args.adapter.excludedExternalDaOrigins],
    },
    sources: [...args.adapter.sources],
    source_status: args.adapter.sourceStatus.map((source) => ({ ...source })),
    stale_data: staleData,
    confidence: args.adapter.confidence,
    gaps: args.adapter.gaps.map((gap) => ({ ...gap })),
    methodology_version: "eth-ecosystem-capture-v1",
  };
  return EthEcosystemCaptureSnapshotSchema.parse(snapshot);
}
