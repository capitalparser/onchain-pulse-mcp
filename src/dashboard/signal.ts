import type { EthValueCaptureSnapshot, EthWindowMetric } from "../eth_value_capture/types.js";

export type DashboardJudgmentKey = "structural" | "flow_driven" | "neutral" | "data_warning";
export type DashboardDirection = "up" | "down" | "flat" | "unknown";
export type DashboardTone = "positive" | "negative" | "neutral" | "warning";

export interface DashboardSignalCard {
  key: "total_burn" | "blob_burn" | "l2_rent" | "net_issuance";
  label: string;
  value: number | null;
  previous: number | null;
  pctChange: number | null;
  direction: DashboardDirection;
  changeLabel: string;
  interpretation: string;
  tone: DashboardTone;
}

export interface DashboardSignal {
  judgment: {
    key: DashboardJudgmentKey;
    label: string;
    detail: string;
    tone: DashboardTone;
  };
  evidence: string[];
  cards: DashboardSignalCard[];
}

export function deriveDashboardSignal(snapshot: EthValueCaptureSnapshot): DashboardSignal {
  const metricDirection = (metric: EthWindowMetric): DashboardDirection => {
    if (metric.current === null || metric.previous === null || metric.delta === null) return "unknown";
    if (metric.delta > 0) return "up";
    if (metric.delta < 0) return "down";
    return "flat";
  };
  const metricChangeLabel = (metric: EthWindowMetric): string => {
    if (metric.current === null || metric.previous === null || metric.pct_change === null) return "No comparison";
    const percentage = Math.abs(metric.pct_change * 100).toLocaleString(undefined, { maximumFractionDigits: 1 });
    const sign = metric.pct_change > 0 ? "+" : metric.pct_change < 0 ? "−" : "±";
    return `${sign}${percentage}% vs prior 30D`;
  };
  const isIncreasing = (metric: EthWindowMetric): boolean => metric.delta !== null && metric.delta > 0;
  const isNonIncreasing = (metric: EthWindowMetric): boolean => metric.delta !== null && metric.delta <= 0;
  const card = (
    key: DashboardSignalCard["key"],
    label: string,
    metric: EthWindowMetric,
    interpretation: string,
    tone: DashboardTone,
  ): DashboardSignalCard => {
    if (metric.current === null || metric.previous === null || metric.delta === null) {
      return { key, label, value: metric.current, previous: metric.previous, pctChange: metric.pct_change, direction: "unknown", changeLabel: "No comparison", interpretation: "Awaiting data", tone: "warning" };
    }
    return { key, label, value: metric.current, previous: metric.previous, pctChange: metric.pct_change, direction: metricDirection(metric), changeLabel: metricChangeLabel(metric), interpretation, tone };
  };
  const hasDataWarning = snapshot.status !== "complete" || snapshot.stale_data.length > 0 || snapshot.gaps.length > 0;
  const { total_burn_eth: burn, blob_fee_burn_eth: blob, l2_rent_paid_eth: rent, net_issuance_eth: issuance } = snapshot.metrics;
  const structural = isIncreasing(burn) && isIncreasing(blob) && isIncreasing(rent) && issuance.current !== null && issuance.current < 0;
  const flowDriven = isNonIncreasing(burn) && isNonIncreasing(blob) && isNonIncreasing(rent) && issuance.current !== null && issuance.current >= 0;
  const cards = [
    card("total_burn", "30D ETH burn", burn, isIncreasing(burn) ? "Burn increasing" : burn.delta === 0 ? "Burn stable" : "Burn weakening", isIncreasing(burn) ? "positive" : burn.delta === 0 ? "neutral" : "negative"),
    card("blob_burn", "30D blob burn", blob, isIncreasing(blob) ? "L2 demand strengthening" : blob.delta === 0 ? "L2 demand stable" : "L2 demand weakening", isIncreasing(blob) ? "positive" : blob.delta === 0 ? "neutral" : "negative"),
    card("l2_rent", "30D L2 rent", rent, isIncreasing(rent) ? "L1 rent improving" : rent.delta === 0 ? "L1 rent stable" : "L1 rent weakening", isIncreasing(rent) ? "positive" : rent.delta === 0 ? "neutral" : "negative"),
    card("net_issuance", "30D net issuance", issuance, issuance.current !== null && issuance.current < 0 ? "Supply decreasing" : "Supply increasing", issuance.current !== null && issuance.current < 0 ? "positive" : "negative"),
  ];

  if (hasDataWarning) {
    const evidence = [
      snapshot.status !== "complete" ? `Snapshot is ${snapshot.status}.` : null,
      snapshot.stale_data.length > 0 ? `${snapshot.stale_data.length} stale data field${snapshot.stale_data.length === 1 ? "" : "s"} needs review.` : null,
      snapshot.gaps.length > 0 ? `${snapshot.gaps.length} reported data gap${snapshot.gaps.length === 1 ? "" : "s"} needs review.` : null,
    ].filter((item): item is string => item !== null).slice(0, 3);
    return { judgment: { key: "data_warning", label: "Data warning", detail: "Review data quality before reading the market signal.", tone: "warning" }, evidence, cards };
  }
  if (structural) {
    return { judgment: { key: "structural", label: "Structural value capture", detail: "Demand, L2 rent, and ETH supply are improving together.", tone: "positive" }, evidence: ["30D ETH burn increased versus the prior 30D period.", "Blob burn increased, supporting L2 demand reaching Ethereum.", "Net issuance turned negative, reducing ETH supply."], cards };
  }
  if (flowDriven) {
    return { judgment: { key: "flow_driven", label: "Flow-driven / unconfirmed", detail: "Value-capture signals are not confirming a structural improvement.", tone: "negative" }, evidence: ["30D ETH burn did not increase versus the prior 30D period.", "Blob burn did not increase, leaving L2 demand unconfirmed.", "Net issuance is nonnegative, so supply is not decreasing."], cards };
  }
  return { judgment: { key: "neutral", label: "Neutral / mixed", detail: "Value-capture signals are mixed across demand, rent, and supply.", tone: "neutral" }, evidence: [isIncreasing(burn) ? "30D ETH burn increased versus the prior 30D period." : "30D ETH burn did not increase versus the prior 30D period.", isIncreasing(rent) ? "L2 rent increased, improving Ethereum revenue capture." : "L2 rent did not increase versus the prior 30D period.", issuance.current !== null && issuance.current < 0 ? "Net issuance is negative, reducing ETH supply." : "Net issuance is nonnegative, so supply is not decreasing."], cards };
}
