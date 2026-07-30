import type { CoinMetricsSupplyResult } from "../adapters/eth_supply_coinmetrics.js";
import { computeSupplyDelta } from "../adapters/eth_supply_coinmetrics.js";
import type {
  DuneEthValueResult,
  DunePeriodValues,
} from "../adapters/eth_value_dune.js";
import type { GrowThePieRentResult } from "../adapters/eth_value_growthepie.js";
import {
  deriveFeeMetrics,
  makeEthWindowMetric,
  makeRatioMetric,
  nullableAdd,
  shiftUtcDay,
  windowToDays,
} from "../eth_value_capture/metrics.js";
import {
  EthValueCaptureSnapshotSchema,
  type EthValueCaptureSnapshot,
  type EthValueGap,
  type EthWindow,
} from "../eth_value_capture/types.js";
import type { Lang } from "../types.js";

export interface GetEthValueCaptureArgs {
  window: EthWindow;
  lang: Lang;
  includeRollups: boolean;
  byokActive: string[];
  selectedCutoffDay: string;
  supply: CoinMetricsSupplyResult;
  dune: DuneEthValueResult;
  growthepie: GrowThePieRentResult;
  now: Date;
}

function pair(
  current: number | null,
  previous: number | null,
): { current: number | null; previous: number | null } {
  return { current, previous };
}

function sourceUsable(status: string): boolean {
  return status === "valid" || status === "stale";
}

function completePair(current: number | null, previous: number | null): boolean {
  return (
    current !== null &&
    previous !== null &&
    Number.isFinite(current) &&
    Number.isFinite(previous)
  );
}

type RentSource = "dune" | "growthepie" | null;

function hasAny(values: Array<number | null>): boolean {
  return values.some((value) => value !== null);
}

function hasAll(values: Array<number | null>): boolean {
  return values.every((value) => value !== null);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function uniqueGaps(gaps: EthValueGap[]): EthValueGap[] {
  const seen = new Set<string>();
  return gaps.filter((gap) => {
    const key = `${gap.code}:${gap.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function latestAsOf(values: Array<string | null>, fallback: Date): string {
  const available = values.filter((value): value is string => value !== null);
  return available.sort().at(-1) ?? fallback.toISOString();
}

function summaryFor(status: EthValueCaptureSnapshot["status"], lang: Lang): string {
  if (lang === "ko") {
    if (status === "complete") {
      return "정렬된 기간의 이더리움 가치포착 지표가 모두 제공됩니다.";
    }
    if (status === "partial") {
      return "이더리움 가치포착 지표가 일부 제공됩니다. 소스와 결측 사유를 확인하세요.";
    }
    return "현재 이더리움 가치포착 지표를 제공할 수 없습니다.";
  }
  if (status === "complete") {
    return "Ethereum value-capture metrics are complete for the aligned window.";
  }
  if (status === "partial") {
    return "Ethereum value-capture metrics are partially available; review sources and gaps.";
  }
  return "Ethereum value-capture metrics are currently unavailable.";
}

function dunePair(
  usable: boolean,
  current: DunePeriodValues,
  previous: DunePeriodValues,
  field: keyof DunePeriodValues,
) {
  return usable
    ? pair(current[field], previous[field])
    : pair(null, null);
}

export function getEthValueCapture(
  args: GetEthValueCaptureArgs,
): EthValueCaptureSnapshot {
  const windowDays = windowToDays(args.window);
  const supplyUsable =
    sourceUsable(args.supply.status) &&
    args.supply.latestBoundary !== null;
  const duneUsable = sourceUsable(args.dune.status);
  const supplyBoundary = supplyUsable ? args.supply.latestBoundary : null;
  const duneBoundary = duneUsable ? args.dune.cutoffDay : null;
  const cutoffDay = args.selectedCutoffDay;
  const issuanceAligned =
    supplyBoundary !== null &&
    duneBoundary !== null &&
    supplyBoundary === cutoffDay &&
    duneBoundary === cutoffDay;
  const duneAligned = duneUsable && args.dune.cutoffDay === cutoffDay;

  const baseFee = dunePair(
    duneAligned,
    args.dune.current,
    args.dune.previous,
    "baseFeeBurn",
  );
  const blobFee = dunePair(
    duneAligned,
    args.dune.current,
    args.dune.previous,
    "blobFeeBurn",
  );
  const priorityFee = dunePair(
    duneAligned,
    args.dune.current,
    args.dune.previous,
    "priorityFee",
  );
  const duneRentComplete =
    duneUsable &&
    completePair(args.dune.current.l2Rent, args.dune.previous.l2Rent);
  const growthepieUsable = sourceUsable(args.growthepie.status);
  const growthepieRentComplete =
    growthepieUsable &&
    completePair(
      args.growthepie.current.l2Rent,
      args.growthepie.previous.l2Rent,
    );
  const duneRentAligned =
    duneRentComplete &&
    duneAligned;
  const duneDecompositionAligned = duneAligned;
  const growthepieRentAligned =
    growthepieRentComplete &&
    args.growthepie.cutoffDay === cutoffDay;
  const rentSource: RentSource = duneRentAligned
    ? "dune"
    : growthepieRentAligned
      ? "growthepie"
      : null;
  const l2Rent =
    rentSource === "dune"
      ? pair(args.dune.current.l2Rent, args.dune.previous.l2Rent)
      : rentSource === "growthepie"
        ? pair(args.growthepie.current.l2Rent, args.growthepie.previous.l2Rent)
        : pair(null, null);
  const l2Calldata = dunePair(
    duneDecompositionAligned,
    args.dune.current,
    args.dune.previous,
    "l2CalldataFee",
  );
  const l2Blob = dunePair(
    duneDecompositionAligned,
    args.dune.current,
    args.dune.previous,
    "l2BlobFee",
  );
  const l2Verification = dunePair(
    duneDecompositionAligned,
    args.dune.current,
    args.dune.previous,
    "l2VerificationFee",
  );
  const derivedFees = deriveFeeMetrics({
    baseFeeBurn: baseFee,
    blobFeeBurn: blobFee,
    priorityFee,
    l2Rent,
  });

  let netIssuance = pair(null, null);
  if (supplyUsable && supplyBoundary !== null) {
    const currentStart = shiftUtcDay(supplyBoundary, -windowDays);
    const previousStart = shiftUtcDay(supplyBoundary, -2 * windowDays);
    netIssuance = pair(
      computeSupplyDelta(args.supply.points, currentStart, supplyBoundary),
      computeSupplyDelta(args.supply.points, previousStart, currentStart),
    );
  }

  const consensusIssuance = issuanceAligned
    ? pair(
        nullableAdd(netIssuance.current, derivedFees.totalBurn.current),
        nullableAdd(netIssuance.previous, derivedFees.totalBurn.previous),
      )
    : pair(null, null);

  const metrics = {
    gross_l1_fees_eth: makeEthWindowMetric(
      derivedFees.grossL1Fees.current,
      derivedFees.grossL1Fees.previous,
    ),
    base_fee_burn_eth: makeEthWindowMetric(baseFee.current, baseFee.previous),
    blob_fee_burn_eth: makeEthWindowMetric(blobFee.current, blobFee.previous),
    priority_fee_eth: makeEthWindowMetric(
      priorityFee.current,
      priorityFee.previous,
    ),
    total_burn_eth: makeEthWindowMetric(
      derivedFees.totalBurn.current,
      derivedFees.totalBurn.previous,
    ),
    consensus_issuance_eth: makeEthWindowMetric(
      consensusIssuance.current,
      consensusIssuance.previous,
    ),
    net_issuance_eth: makeEthWindowMetric(
      netIssuance.current,
      netIssuance.previous,
    ),
    l2_rent_paid_eth: makeEthWindowMetric(l2Rent.current, l2Rent.previous),
    l2_calldata_fee_eth: makeEthWindowMetric(
      l2Calldata.current,
      l2Calldata.previous,
    ),
    l2_blob_fee_eth: makeEthWindowMetric(l2Blob.current, l2Blob.previous),
    l2_verification_fee_eth: makeEthWindowMetric(
      l2Verification.current,
      l2Verification.previous,
    ),
  };

  const feeCoverage = hasAll([
    metrics.gross_l1_fees_eth.current,
    metrics.gross_l1_fees_eth.previous,
    metrics.base_fee_burn_eth.current,
    metrics.base_fee_burn_eth.previous,
    metrics.blob_fee_burn_eth.current,
    metrics.blob_fee_burn_eth.previous,
    metrics.priority_fee_eth.current,
    metrics.priority_fee_eth.previous,
  ]);
  const l2RentCoverage = hasAll([
    metrics.l2_rent_paid_eth.current,
    metrics.l2_rent_paid_eth.previous,
  ]);
  const l2BreakdownCoverage = hasAll([
    metrics.l2_calldata_fee_eth.current,
    metrics.l2_calldata_fee_eth.previous,
    metrics.l2_blob_fee_eth.current,
    metrics.l2_blob_fee_eth.previous,
    metrics.l2_verification_fee_eth.current,
    metrics.l2_verification_fee_eth.previous,
  ]);
  const supplyCoverage = hasAll([
    metrics.net_issuance_eth.current,
    metrics.net_issuance_eth.previous,
  ]);
  const consensusCoverage = hasAll([
    metrics.consensus_issuance_eth.current,
    metrics.consensus_issuance_eth.previous,
  ]);
  const freshDune = args.dune.status === "valid" && !args.dune.stale;
  const freshSupply = args.supply.status === "valid" && !args.supply.stale;
  const freshSelectedRent =
    rentSource === "dune"
      ? freshDune
      : rentSource === "growthepie"
        ? args.growthepie.status === "valid" && !args.growthepie.stale
        : false;
  const confidence =
    (freshDune && feeCoverage ? 0.35 : 0) +
    (freshSelectedRent && l2RentCoverage ? 0.15 : 0) +
    (freshDune && l2BreakdownCoverage ? 0.1 : 0) +
    (freshSupply && supplyCoverage ? 0.25 : 0) +
    (freshDune && freshSupply && issuanceAligned && consensusCoverage ? 0.15 : 0);
  const roundedConfidence = Math.round(confidence * 100) / 100;

  const coreValues = Object.values(metrics).flatMap((metric) => [
    metric.current,
    metric.previous,
  ]);
  const hasCoreMetric = hasAny(coreValues);
  const complete = roundedConfidence === 1;
  const status: EthValueCaptureSnapshot["status"] = complete
    ? "complete"
    : hasCoreMetric
      ? "partial"
      : "unavailable";

  const gaps: EthValueGap[] = [
    ...args.supply.gaps,
    ...args.dune.gaps,
    ...(!duneRentComplete ? args.growthepie.gaps : []),
  ];
  if (
    supplyBoundary !== null &&
    duneBoundary !== null &&
    !issuanceAligned
  ) {
    gaps.push({
      code: "period_mismatch",
      detail: "Coin Metrics and Dune cutoff boundaries do not match.",
    });
  }
  if (
    !duneRentComplete &&
    growthepieRentComplete &&
    cutoffDay !== null &&
    !growthepieRentAligned
  ) {
    gaps.push({
      code: "period_mismatch",
      detail: "GrowThePie and snapshot cutoff boundaries do not match.",
    });
  }
  if (!consensusCoverage) {
    gaps.push({
      code: "derivation_blocked",
      detail: "Consensus issuance requires aligned net issuance and burn windows.",
    });
  }
  if (status === "partial") {
    gaps.push({
      code: "partial_result",
      detail: "At least one ETH value-capture metric is unavailable or stale.",
    });
  }

  const supplyContributes = hasAny([
    metrics.net_issuance_eth.current,
    metrics.net_issuance_eth.previous,
  ]);
  const feesContribute = hasAny([
    metrics.gross_l1_fees_eth.current,
    metrics.gross_l1_fees_eth.previous,
    metrics.base_fee_burn_eth.current,
    metrics.base_fee_burn_eth.previous,
    metrics.blob_fee_burn_eth.current,
    metrics.blob_fee_burn_eth.previous,
    metrics.priority_fee_eth.current,
    metrics.priority_fee_eth.previous,
  ]);
  const l2Contributes = hasAny([
    metrics.l2_rent_paid_eth.current,
    metrics.l2_rent_paid_eth.previous,
  ]);
  const duneBreakdownContributes = hasAny([
    metrics.l2_calldata_fee_eth.current,
    metrics.l2_calldata_fee_eth.previous,
    metrics.l2_blob_fee_eth.current,
    metrics.l2_blob_fee_eth.previous,
    metrics.l2_verification_fee_eth.current,
    metrics.l2_verification_fee_eth.previous,
  ]);
  const sources = [
    ...(supplyContributes ? ["coinmetrics-community:SplyCur"] : []),
    ...(feesContribute ? ["dune:gas.fees"] : []),
    ...(rentSource === "dune" || duneBreakdownContributes
      ? ["dune:rollup_economics_ethereum.l1_fees"]
      : []),
    ...(rentSource === "growthepie" && l2Contributes
      ? ["growthepie:rent_paid_eth"]
      : []),
  ];

  const rollups = args.includeRollups
    ? rentSource === "dune"
      ? (args.dune.rollups ?? []).map((rollup) => ({
        name: rollup.name,
        l1_rent_eth: makeEthWindowMetric(
          rollup.current.l2Rent,
          rollup.previous.l2Rent,
        ),
        calldata_fee_eth: makeEthWindowMetric(
          rollup.current.l2CalldataFee,
          rollup.previous.l2CalldataFee,
        ),
        blob_fee_eth: makeEthWindowMetric(
          rollup.current.l2BlobFee,
          rollup.previous.l2BlobFee,
        ),
        verification_fee_eth: makeEthWindowMetric(
          rollup.current.l2VerificationFee,
          rollup.previous.l2VerificationFee,
        ),
        }))
      : rentSource === "growthepie"
        ? (args.growthepie.rollups ?? []).map((rollup) => ({
            name: rollup.name,
            l1_rent_eth: makeEthWindowMetric(
              rollup.current.l2Rent,
              rollup.previous.l2Rent,
            ),
            calldata_fee_eth: makeEthWindowMetric(null, null),
            blob_fee_eth: makeEthWindowMetric(null, null),
            verification_fee_eth: makeEthWindowMetric(null, null),
          }))
        : []
    : undefined;

  const snapshot: EthValueCaptureSnapshot = {
    summary: summaryFor(status, args.lang),
    window: args.window,
    cutoff_day: cutoffDay,
    as_of: latestAsOf(
      [
        args.supply.asOf,
        args.dune.asOf,
        ...(rentSource === "growthepie" ? [args.growthepie.asOf] : []),
      ],
      args.now,
    ),
    status,
    metrics,
    ratios: {
      blob_share_of_total_burn: makeRatioMetric(
        blobFee.current,
        derivedFees.totalBurn.current,
        blobFee.previous,
        derivedFees.totalBurn.previous,
      ),
      l2_rent_share_of_l1_fees: makeRatioMetric(
        l2Rent.current,
        derivedFees.grossL1Fees.current,
        l2Rent.previous,
        derivedFees.grossL1Fees.previous,
      ),
    },
    ...(args.includeRollups ? { rollups } : {}),
    sources,
    source_status: [
      {
        source: "coinmetrics-community:SplyCur",
        role: "ETH total supply boundaries",
        as_of: args.supply.asOf,
        stale: args.supply.stale,
      },
      {
        source: "dune",
        role:
          rentSource === "dune"
            ? "Ethereum fees and L2 rent"
            : duneBreakdownContributes
              ? "Ethereum fees and L2 decomposition"
              : "Ethereum fees",
        as_of: args.dune.asOf,
        stale: args.dune.stale,
      },
      ...(rentSource === "growthepie"
        ? [{
            source: "growthepie",
            role: "L2 rent paid to Ethereum",
            as_of: args.growthepie.asOf,
            stale: args.growthepie.stale,
          }]
        : []),
    ],
    stale_data: [
      ...(args.supply.stale ? ["coinmetrics-community:stale"] : []),
      ...(args.dune.stale ? ["dune:stale_cache"] : []),
      ...(rentSource === "growthepie" && args.growthepie.stale
        ? ["growthepie:stale_cache"]
        : []),
    ],
    confidence: roundedConfidence,
    capabilities: {
      byok_active: unique(args.byokActive),
      paid_sources_active:
        args.dune.executionId !== null && (feesContribute || l2Contributes)
          ? ["dune"]
          : [],
    },
    gaps: uniqueGaps(gaps),
    methodology_version: "eth-value-capture-v1",
  };

  return EthValueCaptureSnapshotSchema.parse(snapshot);
}
