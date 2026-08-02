import type { EthCollateralDemandSnapshot } from "../eth_collateral_demand/types.js";
import type { EthValueCaptureSnapshot } from "../eth_value_capture/types.js";
import type { LidoPooledEthBackingSnapshot } from "../lido_pooled_eth_backing/types.js";
import type { ToolResponse } from "../types.js";
import type {
  DemandCompassAxis,
  DemandCompassAxisStatus,
  DemandCompassGap,
  DemandCompassJudgment,
  EthDemandCompassSnapshot,
} from "./types.js";

export interface BuildEthDemandCompassArgs {
  valueCapture: EthValueCaptureSnapshot;
  stablecoin: ToolResponse;
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
  return { status, score, evidence, sources: unique(sources), confidence };
}

function pairStatus(current: number | null, previous: number | null, lowerIsBetter = false): -1 | 0 | 1 | null {
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
  if (known.length !== signals.length) return sourceAxis("unknown", null, [missingEvidence], sources, 0);
  const total = known.reduce<number>((sum, signal) => sum + signal, 0);
  const score = total > 0 ? 1 : total < 0 ? -1 : 0;
  return sourceAxis(score === 1 ? "improving" : score === -1 ? "weakening" : "neutral", score, evidence, sources, 1);
}

function usageAxis(valueCapture: EthValueCaptureSnapshot): DemandCompassAxis {
  const metrics = valueCapture.metrics;
  const fees = pairStatus(metrics.gross_l1_fees_eth.current, metrics.gross_l1_fees_eth.previous);
  const burn = pairStatus(metrics.total_burn_eth.current, metrics.total_burn_eth.previous);
  const blob = pairStatus(metrics.blob_fee_burn_eth.current, metrics.blob_fee_burn_eth.previous);
  const source = valueCapture.sources.filter((item) => item.includes("dune"));
  return axisForSignals(
    [fees, burn, blob],
    ["Gross L1 fees, total burn, and blob burn are compared with the prior 30-day window."],
    source,
    "Usage trend is unknown because gross fees, burn, and blob metrics are unavailable.",
  );
}

function l2Axis(valueCapture: EthValueCaptureSnapshot): DemandCompassAxis {
  const metrics = valueCapture.metrics;
  const rent = pairStatus(metrics.l2_rent_paid_eth.current, metrics.l2_rent_paid_eth.previous);
  const blob = pairStatus(metrics.l2_blob_fee_eth.current, metrics.l2_blob_fee_eth.previous);
  const rentShare = pairStatus(valueCapture.ratios.l2_rent_share_of_l1_fees.current, valueCapture.ratios.l2_rent_share_of_l1_fees.previous);
  return axisForSignals(
    [rent, blob, rentShare],
    ["L2 rent, L2 blob fee, and L2-rent share are compared with the prior 30-day window."],
    valueCapture.sources.filter((item) => item.includes("growthepie") || item.includes("rollup")),
    "L2 settlement trend is unknown because rent, blob, and rent-share metrics are unavailable.",
  );
}

function supplyAxis(valueCapture: EthValueCaptureSnapshot): DemandCompassAxis {
  const metric = valueCapture.metrics.net_issuance_eth;
  const score = pairStatus(metric.current, metric.previous, true);
  if (score === null) {
    return sourceAxis("unknown", null, ["Supply absorption trend is unknown because aligned net issuance is unavailable."], valueCapture.sources.filter((item) => item.includes("coinmetrics")), 0);
  }
  return sourceAxis(
    score === 1 ? "improving" : score === -1 ? "weakening" : "neutral",
    score,
    ["Net ETH issuance is compared with the prior 30-day window; lower issuance is treated as stronger supply absorption."],
    valueCapture.sources.filter((item) => item.includes("coinmetrics")),
    1,
  );
}

function collateralAxis(aave: EthCollateralDemandSnapshot, lido: LidoPooledEthBackingSnapshot): DemandCompassAxis {
  const sources = unique([...aave.sources, ...lido.sources]);
  const evidence: string[] = [];
  if (aave.status === "verified" && aave.metrics.eth_family_supplied !== null) {
    evidence.push("Aave ETH-family supplied capacity is available at one finalized block.");
  }
  if (lido.status === "verified" && lido.metrics.total_pooled_eth_wei !== null) {
    evidence.push("Lido pooled ETH backing is available at one finalized block.");
  }
  if (evidence.length === 0) {
    return sourceAxis("unknown", null, ["Collateral observation is unavailable because Aave and Lido evidence are unavailable."], sources, 0);
  }
  return sourceAxis("unknown", null, ["Point-in-time collateral observations are available, but no prior comparable snapshot is supplied.", ...evidence].slice(0, 2), sources, 0.5);
}

function monetaryAxis(stablecoin: ToolResponse): DemandCompassAxis {
  const delta = stablecoin.inputs.stablecoin_7d_delta_pct;
  const sources = stablecoin.sources;
  if (!finite(delta)) {
    return sourceAxis("unknown", null, ["Monetary settlement trend is unknown because the 7-day stablecoin supply delta is unavailable."], sources, 0);
  }
  const score = delta > 0 ? 1 : delta < 0 ? -1 : 0;
  return sourceAxis(
    score === 1 ? "improving" : score === -1 ? "weakening" : "neutral",
    score,
    ["The 7-day stablecoin supply delta is a liquidity proxy, not Ethereum-only settlement volume."],
    sources,
    stablecoin.stale_data.length === 0 ? 1 : 0.5,
  );
}

function addMissingGap(gaps: DemandCompassGap[], axis: DemandCompassAxis, code: DemandCompassGap["code"], detail: string): void {
  if (axis.status === "unknown") gaps.push({ code, detail });
}

function judgmentFor(axes: EthDemandCompassSnapshot["axes"]): DemandCompassJudgment {
  if ([axes.usage_demand, axes.l2_settlement, axes.supply_absorption].some((axis) => axis.status === "unknown")) return "data-warning";
  const trendAxes = [axes.usage_demand, axes.l2_settlement, axes.supply_absorption, axes.monetary_settlement];
  const known = trendAxes.filter((axis) => axis.status !== "unknown");
  if (known.length < 3) return "data-warning";
  if ([axes.usage_demand, axes.l2_settlement, axes.supply_absorption].every((axis) => axis.status === "improving")) return "structural";
  if (axes.monetary_settlement.status === "improving"
    && [axes.usage_demand, axes.l2_settlement, axes.supply_absorption].filter((axis) => axis.status === "improving").length <= 1) return "flow-driven";
  return "neutral";
}

function evidenceFor(judgment: DemandCompassJudgment, axes: EthDemandCompassSnapshot["axes"]): string[] {
  const selected = Object.entries(axes)
    .filter(([, axis]) => axis.status === "improving" || axis.status === "weakening")
    .map(([name, axis]) => `${name.replaceAll("_", " ")}: ${axis.status}.`)
    .slice(0, 3);
  if (selected.length > 0) return selected;
  return judgment === "data-warning" ? ["Insufficient trend-capable evidence for a composite judgment."] : ["Available demand axes are mixed or neutral."];
}

export function buildEthDemandCompass(args: BuildEthDemandCompassArgs): EthDemandCompassSnapshot {
  const axes = {
    usage_demand: usageAxis(args.valueCapture),
    l2_settlement: l2Axis(args.valueCapture),
    supply_absorption: supplyAxis(args.valueCapture),
    collateral_demand: collateralAxis(args.aave, args.lido),
    monetary_settlement: monetaryAxis(args.stablecoin),
  };
  const gaps: DemandCompassGap[] = [];
  addMissingGap(gaps, axes.usage_demand, "usage_metrics_missing", "Gross L1 fees, total burn, and blob burn were not sufficiently available.");
  addMissingGap(gaps, axes.l2_settlement, "l2_metrics_missing", "L2 rent, blob fee, and rent-share evidence was not sufficiently available.");
  addMissingGap(gaps, axes.supply_absorption, "net_issuance_missing", "Aligned net issuance was unavailable.");
  if (axes.collateral_demand.evidence[0]?.startsWith("Collateral observation is unavailable")) {
    gaps.push({ code: "collateral_sources_missing", detail: "Neither verified Aave nor Lido point-in-time evidence was available." });
  } else {
    gaps.push({ code: "collateral_trend_not_available", detail: "Aave and Lido inputs are point-in-time observations; no comparable prior snapshot was supplied." });
  }
  addMissingGap(gaps, axes.monetary_settlement, "stablecoin_delta_missing", "The stablecoin 7-day supply delta was unavailable.");
  const stale = args.valueCapture.stale_data.length > 0 || args.stablecoin.stale_data.length > 0
    || args.aave.gaps.some((gap) => gap.code === "source_stale") || args.lido.gaps.some((gap) => gap.code === "source_stale");
  if (stale) gaps.push({ code: "stale_source", detail: "At least one input source is cached or stale." });
  const judgment = judgmentFor(axes);
  if (judgment === "data-warning") gaps.push({ code: "insufficient_trend_coverage", detail: "At least three of usage, L2 settlement, supply absorption, and monetary settlement require known trend evidence." });
  const trendAxes = [axes.usage_demand, axes.l2_settlement, axes.supply_absorption, axes.monetary_settlement];
  const confidence = Number((trendAxes.reduce((total, axis) => total + axis.confidence, 0) / trendAxes.length * (stale ? 0.75 : 1)).toFixed(2));
  const sources = unique([...args.valueCapture.sources, ...args.stablecoin.sources, ...args.aave.sources, ...args.lido.sources]);
  const summary = judgment === "structural"
    ? "Ethereum demand compass indicates structural value-capture improvement."
    : judgment === "flow-driven"
      ? "Ethereum demand compass indicates liquidity-led demand without broad value-capture confirmation."
      : judgment === "data-warning"
        ? "Ethereum demand compass lacks sufficient trend evidence for a composite judgment."
        : "Ethereum demand compass is mixed or neutral across available trend evidence.";
  return {
    summary,
    as_of: args.now.toISOString(),
    window: "30d",
    judgment,
    axes,
    evidence: evidenceFor(judgment, axes),
    sources,
    confidence,
    gaps,
    methodology_version: "eth-demand-compass-v1",
  };
}
