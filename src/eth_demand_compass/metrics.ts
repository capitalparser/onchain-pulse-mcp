import type { EthCollateralDemandSnapshot } from "../eth_collateral_demand/types.js";
import type { EthEcosystemCaptureSnapshot } from "../eth_ecosystem_capture/types.js";
import type { EthValueCaptureSnapshot } from "../eth_value_capture/types.js";
import type { LidoPooledEthBackingSnapshot } from "../lido_pooled_eth_backing/types.js";
import type {
  DemandCompassAxis,
  DemandCompassAxisStatus,
  DemandCompassGap,
  DemandCompassJudgment,
  EthCaptureState,
  EthCaptureTier,
  EthDemandCompassSnapshot,
  EthEcosystemState,
  EthValueAccrualClassification,
} from "./types.js";

export interface BuildEthDemandCompassArgs {
  valueCapture: EthValueCaptureSnapshot;
  ecosystemCapture: EthEcosystemCaptureSnapshot;
  aave: EthCollateralDemandSnapshot;
  lido: LidoPooledEthBackingSnapshot;
  now: Date;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function sourceAxis(
  status: DemandCompassAxisStatus,
  score: -1 | 0 | 1 | null,
  evidence: string[],
  sources: string[],
  confidence: number,
): DemandCompassAxis {
  return {
    status,
    score,
    evidence: evidence.slice(0, 2),
    sources: unique(sources),
    confidence,
  };
}

function pairStatus(
  current: number | null,
  previous: number | null,
  lowerIsBetter = false,
): -1 | 0 | 1 | null {
  if (!finite(current) || !finite(previous)) return null;
  if (current === previous) return 0;
  const raw = current > previous ? 1 : -1;
  return lowerIsBetter ? (raw * -1) as -1 | 1 : raw as -1 | 1;
}

function axisForSignals(
  signals: Array<-1 | 0 | 1 | null>,
  evidence: string[],
  sources: string[],
  missingEvidence: string,
): DemandCompassAxis {
  const known = signals.filter((signal): signal is -1 | 0 | 1 => signal !== null);
  if (known.length !== signals.length) {
    return sourceAxis("unknown", null, [missingEvidence], sources, 0);
  }
  const total = known.reduce<number>((sum, signal) => sum + signal, 0);
  const score = total > 0 ? 1 : total < 0 ? -1 : 0;
  return sourceAxis(
    score === 1 ? "improving" : score === -1 ? "weakening" : "neutral",
    score,
    evidence,
    sources,
    1,
  );
}

function ecosystemAxis(snapshot: EthEcosystemCaptureSnapshot): DemandCompassAxis {
  if (snapshot.status !== "complete" || snapshot.gaps.length > 0) {
    return sourceAxis(
      "unknown",
      null,
      ["Ethereum ecosystem activity is unknown because the chain-bounded fee or stablecoin snapshot is partial or gapped."],
      snapshot.sources,
      0,
    );
  }
  const fees = snapshot.metrics.l2_user_fees_usd;
  const stablecoins = snapshot.metrics.ethereum_ecosystem_stablecoin_supply_usd;
  return axisForSignals(
    [
      pairStatus(fees.current, fees.previous),
      pairStatus(stablecoins.current, stablecoins.previous),
    ],
    [
      "Ethereum-DA L2 user fees and Ethereum L1/L2 stablecoin supply are compared with their prior aligned periods.",
    ],
    snapshot.sources,
    "Ethereum ecosystem activity is unknown because aligned L2 user-fee and ecosystem stablecoin observations are unavailable.",
  );
}

function usageAxis(valueCapture: EthValueCaptureSnapshot): DemandCompassAxis {
  if (valueCapture.status !== "complete" || valueCapture.gaps.length > 0) {
    return sourceAxis(
      "unknown",
      null,
      ["Protocol usage trend is unknown because the fee-and-supply snapshot is partial or gapped."],
      valueCapture.sources.filter((item) => item.includes("dune")),
      0,
    );
  }
  const metrics = valueCapture.metrics;
  return axisForSignals(
    [
      pairStatus(metrics.gross_l1_fees_eth.current, metrics.gross_l1_fees_eth.previous),
      pairStatus(metrics.total_burn_eth.current, metrics.total_burn_eth.previous),
      pairStatus(metrics.blob_fee_burn_eth.current, metrics.blob_fee_burn_eth.previous),
    ],
    ["Gross L1 fees, total burn, and blob burn are compared with the prior 30-day window."],
    valueCapture.sources.filter((item) => item.includes("dune")),
    "Protocol usage trend is unknown because gross fees, burn, and blob metrics are unavailable.",
  );
}

function l2Axis(valueCapture: EthValueCaptureSnapshot): DemandCompassAxis {
  if (valueCapture.status !== "complete" || valueCapture.gaps.length > 0) {
    return sourceAxis(
      "unknown",
      null,
      ["L2 settlement trend is unknown because the fee-and-supply snapshot is partial or gapped."],
      valueCapture.sources.filter((item) => item.includes("growthepie") || item.includes("rollup")),
      0,
    );
  }
  const metrics = valueCapture.metrics;
  return axisForSignals(
    [
      pairStatus(metrics.l2_rent_paid_eth.current, metrics.l2_rent_paid_eth.previous),
      pairStatus(metrics.l2_blob_fee_eth.current, metrics.l2_blob_fee_eth.previous),
      pairStatus(
        valueCapture.ratios.l2_rent_share_of_l1_fees.current,
        valueCapture.ratios.l2_rent_share_of_l1_fees.previous,
      ),
    ],
    ["L2 rent, L2 blob fee, and L2-rent share of Ethereum L1 fees are compared with the prior 30-day window."],
    valueCapture.sources.filter((item) => item.includes("growthepie") || item.includes("rollup")),
    "L2 settlement trend is unknown because rent, blob, and rent-share metrics are unavailable.",
  );
}

function settlementCaptureAxis(snapshot: EthEcosystemCaptureSnapshot): DemandCompassAxis {
  if (snapshot.status !== "complete" || snapshot.gaps.length > 0) {
    return sourceAxis(
      "unknown",
      null,
      ["ETH settlement capture is unknown because aligned L2 user-fee and Ethereum-rent evidence is partial or gapped."],
      snapshot.sources,
      0,
    );
  }
  const rent = snapshot.metrics.l2_rent_paid_usd;
  const share = snapshot.metrics.l2_settlement_cost_share;
  return axisForSignals(
    [
      pairStatus(rent.current, rent.previous),
      pairStatus(share.current, share.previous),
    ],
    ["Ethereum rent paid by included L2s and rent as a share of those L2s' user fees are compared with the prior window."],
    snapshot.sources,
    "ETH settlement capture is unknown because L2 rent or settlement-cost share is unavailable.",
  );
}

function supplyAxis(valueCapture: EthValueCaptureSnapshot): DemandCompassAxis {
  if (valueCapture.status !== "complete" || valueCapture.gaps.length > 0) {
    return sourceAxis(
      "unknown",
      null,
      ["Supply absorption trend is unknown because the fee-and-supply snapshot is partial or gapped."],
      valueCapture.sources.filter((item) => item.includes("coinmetrics")),
      0,
    );
  }
  const metric = valueCapture.metrics.net_issuance_eth;
  const score = pairStatus(metric.current, metric.previous, true);
  if (score === null) {
    return sourceAxis(
      "unknown",
      null,
      ["Supply absorption trend is unknown because aligned net issuance is unavailable."],
      valueCapture.sources.filter((item) => item.includes("coinmetrics")),
      0,
    );
  }
  return sourceAxis(
    score === 1 ? "improving" : score === -1 ? "weakening" : "neutral",
    score,
    ["Net ETH issuance is compared with the prior 30-day window; lower issuance is treated as stronger supply absorption."],
    valueCapture.sources.filter((item) => item.includes("coinmetrics")),
    1,
  );
}

function collateralAxis(
  aave: EthCollateralDemandSnapshot,
  lido: LidoPooledEthBackingSnapshot,
): DemandCompassAxis {
  const sources = unique([...aave.sources, ...lido.sources]);
  const evidence: string[] = [];
  if (aave.status === "verified" && aave.metrics.eth_family_supplied !== null) {
    evidence.push("Aave ETH-family reserve supply is available at one finalized block, but actual collateral activation is not indexed.");
  }
  if (lido.status === "verified" && lido.metrics.total_pooled_eth_wei !== null) {
    evidence.push("Lido pooled ETH backing is available at one finalized block, but no prior comparable snapshot is supplied.");
  }
  if (evidence.length === 0) {
    return sourceAxis(
      "unknown",
      null,
      ["Collateral observation is unavailable because Aave and Lido evidence are unavailable."],
      sources,
      0,
    );
  }
  return sourceAxis(
    "unknown",
    null,
    evidence,
    sources,
    0.5,
  );
}

function monetaryAxis(snapshot: EthEcosystemCaptureSnapshot): DemandCompassAxis {
  if (snapshot.status !== "complete" || snapshot.gaps.length > 0) {
    return sourceAxis(
      "unknown",
      null,
      ["Ethereum monetary-settlement trend is unknown because ecosystem stablecoin supply is partial or gapped."],
      snapshot.sources,
      0,
    );
  }
  const metric = snapshot.metrics.ethereum_ecosystem_stablecoin_supply_usd;
  const score = pairStatus(metric.current, metric.previous);
  if (score === null) {
    return sourceAxis(
      "unknown",
      null,
      ["Ethereum monetary-settlement trend is unknown because aligned L1 and Ethereum-DA L2 stablecoin supply is unavailable."],
      snapshot.sources,
      0,
    );
  }
  return sourceAxis(
    score === 1 ? "improving" : score === -1 ? "weakening" : "neutral",
    score,
    ["Stablecoin supply on Ethereum L1 and included Ethereum-DA rollups is compared with the prior aligned observation."],
    snapshot.sources,
    1,
  );
}

function addMissingGap(
  gaps: DemandCompassGap[],
  axis: DemandCompassAxis,
  code: DemandCompassGap["code"],
  detail: string,
): void {
  if (axis.status === "unknown") gaps.push({ code, detail });
}

function ecosystemStateFor(axis: DemandCompassAxis): EthEcosystemState {
  if (axis.status === "unknown") return "unknown";
  if (axis.status === "improving") return "expanding";
  if (axis.status === "weakening") return "contracting";
  return "stable";
}

function captureStateFor(axes: EthDemandCompassSnapshot["axes"]): EthCaptureState {
  const required = [
    axes.usage_demand,
    axes.l2_settlement,
    axes.settlement_capture,
    axes.supply_absorption,
  ];
  if (required.some((axis) => axis.score === null)) return "unknown";
  const total = required.reduce<number>((sum, axis) => sum + (axis.score ?? 0), 0);
  if (total > 0) return "strengthening";
  if (total < 0) return "weakening";
  return "stable";
}

function classificationFor(
  ecosystemState: EthEcosystemState,
  captureState: EthCaptureState,
): EthValueAccrualClassification {
  if (ecosystemState === "unknown" || captureState === "unknown") return "data_warning";
  if (ecosystemState === "expanding" && captureState === "strengthening") {
    return "growth_with_capture";
  }
  if (ecosystemState === "expanding") return "growth_without_capture";
  if (captureState === "strengthening") return "capture_without_growth";
  return "weak";
}

function captureTierFor(
  axes: EthDemandCompassSnapshot["axes"],
  captureState: EthCaptureState,
): EthCaptureTier {
  if (axes.collateral_demand.status === "improving") return "collateral_and_reserve";
  if (captureState === "unknown") return "unknown";
  if (captureState === "strengthening" && axes.supply_absorption.status === "improving") {
    return "fee_and_supply";
  }
  if ([axes.usage_demand, axes.l2_settlement, axes.settlement_capture]
    .some((axis) => axis.status === "improving")) {
    return "fee_only";
  }
  return "none";
}

function judgmentFor(
  classification: EthValueAccrualClassification,
  captureTier: EthCaptureTier,
): DemandCompassJudgment {
  if (classification === "data_warning") return "data-warning";
  if (classification === "growth_with_capture" && captureTier === "collateral_and_reserve") {
    return "structural";
  }
  if (classification === "growth_with_capture" || classification === "growth_without_capture") {
    return "flow-driven";
  }
  return "neutral";
}

function evidenceFor(
  classification: EthValueAccrualClassification,
  axes: EthDemandCompassSnapshot["axes"],
): string[] {
  const selected = Object.entries(axes)
    .filter(([, axis]) => axis.status === "improving" || axis.status === "weakening")
    .map(([name, axis]) => `${name.replaceAll("_", " ")}: ${axis.status}.`)
    .slice(0, 4);
  if (selected.length > 0) return selected;
  return classification === "data_warning"
    ? ["Insufficient chain-bounded trend evidence to separate ecosystem growth from ETH value accrual."]
    : ["Available ecosystem-growth and ETH-capture axes are mixed or neutral."];
}

function summaryFor(
  classification: EthValueAccrualClassification,
  captureTier: EthCaptureTier,
): string {
  if (classification === "growth_with_capture") {
    return captureTier === "collateral_and_reserve"
      ? "Ethereum ecosystem activity and ETH value accrual are strengthening with collateral or reserve-demand confirmation."
      : "Ethereum ecosystem activity and fee, settlement, or supply capture are strengthening, but collateral and reserve-demand confirmation is not available.";
  }
  if (classification === "growth_without_capture") {
    return "Ethereum ecosystem activity is expanding without matching ETH fee, settlement-share, or supply-capture confirmation.";
  }
  if (classification === "capture_without_growth") {
    return "ETH fee, settlement, or supply capture is strengthening without broad Ethereum ecosystem expansion."
  }
  if (classification === "data_warning") {
    return "Ethereum ecosystem growth and ETH value accrual cannot yet be separated because required bounded trend evidence is missing or stale.";
  }
  return "Ethereum ecosystem growth and ETH value accrual are weak, stable, or mixed across the available evidence.";
}

function uniqueGaps(gaps: DemandCompassGap[]): DemandCompassGap[] {
  const seen = new Set<string>();
  return gaps.filter((gap) => {
    const key = `${gap.code}:${gap.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildEthDemandCompass(args: BuildEthDemandCompassArgs): EthDemandCompassSnapshot {
  const axes: EthDemandCompassSnapshot["axes"] = {
    ecosystem_activity: ecosystemAxis(args.ecosystemCapture),
    usage_demand: usageAxis(args.valueCapture),
    l2_settlement: l2Axis(args.valueCapture),
    settlement_capture: settlementCaptureAxis(args.ecosystemCapture),
    supply_absorption: supplyAxis(args.valueCapture),
    collateral_demand: collateralAxis(args.aave, args.lido),
    monetary_settlement: monetaryAxis(args.ecosystemCapture),
  };
  const ecosystemState = ecosystemStateFor(axes.ecosystem_activity);
  const captureState = captureStateFor(axes);
  const classification = classificationFor(ecosystemState, captureState);
  const captureTier = captureTierFor(axes, captureState);
  const judgment = judgmentFor(classification, captureTier);

  const gaps: DemandCompassGap[] = [];
  addMissingGap(
    gaps,
    axes.ecosystem_activity,
    "ecosystem_metrics_missing",
    "Ethereum-DA L2 user fees and Ethereum L1/L2 stablecoin supply were not sufficiently available.",
  );
  addMissingGap(
    gaps,
    axes.usage_demand,
    "usage_metrics_missing",
    "Gross L1 fees, total burn, and blob burn were not sufficiently available.",
  );
  addMissingGap(
    gaps,
    axes.l2_settlement,
    "l2_metrics_missing",
    "L2 rent, blob fee, and rent-share evidence was not sufficiently available.",
  );
  addMissingGap(
    gaps,
    axes.settlement_capture,
    "settlement_capture_missing",
    "Aligned L2 user fees, Ethereum rent, and settlement-cost share were not sufficiently available.",
  );
  addMissingGap(
    gaps,
    axes.supply_absorption,
    "net_issuance_missing",
    "Aligned net issuance was unavailable.",
  );
  if (axes.collateral_demand.evidence[0]?.startsWith("Collateral observation is unavailable")) {
    gaps.push({
      code: "collateral_sources_missing",
      detail: "Neither verified Aave nor Lido point-in-time evidence was available.",
    });
  } else {
    gaps.push({
      code: "collateral_trend_not_available",
      detail: "Aave reserve supply and Lido backing are point-in-time observations; actual collateral activation, comparable history, and reserve demand are not supplied.",
    });
  }
  addMissingGap(
    gaps,
    axes.monetary_settlement,
    "stablecoin_delta_missing",
    "Ethereum L1 and Ethereum-DA L2 stablecoin supply change was unavailable.",
  );

  const stale = args.valueCapture.stale_data.length > 0
    || args.ecosystemCapture.stale_data.length > 0
    || args.aave.gaps.some((gap) => gap.code === "source_stale")
    || args.lido.gaps.some((gap) => gap.code === "source_stale");
  if (stale) gaps.push({ code: "stale_source", detail: "At least one input source is cached or stale." });
  if (classification === "data_warning") {
    gaps.push({
      code: "insufficient_trend_coverage",
      detail: "Ecosystem activity and the core fee, settlement, and supply-capture axes require known aligned trend evidence.",
    });
  }
  if (classification === "growth_with_capture" && captureTier !== "collateral_and_reserve") {
    gaps.push({
      code: "collateral_confirmation_missing",
      detail: "Fee, settlement, and supply capture improved, but actual ETH collateral or reserve-demand growth was not confirmed.",
    });
  }
  if (classification === "growth_without_capture") {
    gaps.push({
      code: "ecosystem_growth_without_capture",
      detail: "Ethereum ecosystem activity expanded without corresponding improvement in ETH fee, settlement-share, or supply capture.",
    });
  }

  const trendAxes = [
    axes.ecosystem_activity,
    axes.usage_demand,
    axes.l2_settlement,
    axes.settlement_capture,
    axes.supply_absorption,
    axes.monetary_settlement,
  ];
  const confidence = Number((
    trendAxes.reduce((total, axis) => total + axis.confidence, 0)
    / trendAxes.length
    * (stale ? 0.75 : 1)
  ).toFixed(2));
  const sources = unique([
    ...args.valueCapture.sources,
    ...args.ecosystemCapture.sources,
    ...args.aave.sources,
    ...args.lido.sources,
  ]);

  return {
    summary: summaryFor(classification, captureTier),
    as_of: args.now.toISOString(),
    window: "30d",
    judgment,
    ecosystem_state: ecosystemState,
    eth_capture_state: captureState,
    classification,
    capture_tier: captureTier,
    axes,
    evidence: evidenceFor(classification, axes),
    sources,
    confidence,
    gaps: uniqueGaps(gaps),
    methodology_version: "eth-demand-compass-v2",
  };
}
