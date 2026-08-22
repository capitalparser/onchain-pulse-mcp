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
  const staleSourceCount = snapshot.source_status.filter((source) => source.stale).length;
  const hasDataWarning = snapshot.status !== "complete" || snapshot.stale_data.length > 0 || staleSourceCount > 0 || snapshot.gaps.length > 0;
  const { total_burn_eth: burn, blob_fee_burn_eth: blob, l2_rent_paid_eth: rent, net_issuance_eth: issuance } = snapshot.metrics;
  const issuanceImproving = issuance.current !== null && issuance.previous !== null && issuance.current < issuance.previous;
  const issuanceWorsening = issuance.current !== null && issuance.previous !== null && issuance.current > issuance.previous;
  const issuanceInterpretation = issuance.current === null || issuance.delta === null
    ? { text: "Awaiting data", tone: "warning" as DashboardTone }
    : issuance.delta === 0
      ? { text: issuance.current === 0 ? "Supply stable" : issuance.current < 0 ? "Supply decreasing" : "Supply increasing", tone: issuance.current < 0 ? "positive" as DashboardTone : issuance.current === 0 ? "neutral" as DashboardTone : "negative" as DashboardTone }
      : issuance.current < 0
        ? issuanceWorsening ? { text: "Supply reduction weakening", tone: "negative" as DashboardTone } : { text: "Supply decreasing", tone: "positive" as DashboardTone }
        : issuanceImproving ? { text: "Supply pressure easing", tone: "positive" as DashboardTone } : { text: "Supply increasing", tone: "negative" as DashboardTone };
  const protocolCaptureImproving = isIncreasing(burn) && isIncreasing(blob) && isIncreasing(rent) && issuanceImproving;
  const protocolCaptureWeak = isNonIncreasing(burn) && isNonIncreasing(blob) && isNonIncreasing(rent) && issuance.current !== null && issuance.current >= 0;
  const cards = [
    card("total_burn", "30D ETH burn", burn, isIncreasing(burn) ? "Burn increasing" : burn.delta === 0 ? "Burn stable" : "Burn weakening", isIncreasing(burn) ? "positive" : burn.delta === 0 ? "neutral" : "negative"),
    card("blob_burn", "30D blob burn", blob, isIncreasing(blob) ? "L2 settlement use strengthening" : blob.delta === 0 ? "L2 settlement use stable" : "L2 settlement use weakening", isIncreasing(blob) ? "positive" : blob.delta === 0 ? "neutral" : "negative"),
    card("l2_rent", "30D L2 rent", rent, isIncreasing(rent) ? "Ethereum rent improving" : rent.delta === 0 ? "Ethereum rent stable" : "Ethereum rent weakening", isIncreasing(rent) ? "positive" : rent.delta === 0 ? "neutral" : "negative"),
    card("net_issuance", "30D net issuance", issuance, issuanceInterpretation.text, issuanceInterpretation.tone),
  ];

  if (hasDataWarning) {
    const evidence = [
      snapshot.status !== "complete" ? `Snapshot is ${snapshot.status}.` : null,
      snapshot.stale_data.length > 0 ? `${snapshot.stale_data.length} stale data field${snapshot.stale_data.length === 1 ? "" : "s"} needs review.` : null,
      staleSourceCount > 0 ? `${staleSourceCount} stale source${staleSourceCount === 1 ? "" : "s"} needs review.` : null,
      snapshot.gaps.length > 0 ? `${snapshot.gaps.length} reported data gap${snapshot.gaps.length === 1 ? "" : "s"} needs review.` : null,
    ].filter((item): item is string => item !== null).slice(0, 3);
    return { judgment: { key: "data_warning", label: "Data warning", detail: "Review data quality before reading the protocol-capture signal.", tone: "warning" }, evidence, cards };
  }
  if (protocolCaptureImproving) {
    return {
      judgment: {
        key: "structural",
        label: "Protocol capture improving",
        detail: "Fees, L2 rent, and ETH supply absorption are improving together; collateral and reserve-asset demand are not evaluated by this view.",
        tone: "positive",
      },
      evidence: [
        "30D ETH burn increased versus the prior 30D period.",
        "Blob burn increased, supporting more L2 settlement use reaching Ethereum.",
        issuance.current !== null && issuance.current < 0 && issuance.previous !== null && issuance.previous >= 0
          ? "Net issuance turned negative, reducing ETH supply."
          : "Net issuance declined, reducing ETH supply pressure.",
      ],
      cards,
    };
  }
  if (protocolCaptureWeak) {
    return {
      judgment: {
        key: "flow_driven",
        label: "Protocol capture weak / unconfirmed",
        detail: "Fee, rent, and supply signals are not confirming stronger ETH protocol capture.",
        tone: "negative",
      },
      evidence: [
        "30D ETH burn did not increase versus the prior 30D period.",
        "Blob burn did not increase, leaving L2 settlement capture unconfirmed.",
        "Net issuance is nonnegative, so supply is not decreasing.",
      ],
      cards,
    };
  }
  return {
    judgment: {
      key: "neutral",
      label: "Neutral / mixed",
      detail: "Protocol fee, rent, and supply-capture signals are mixed.",
      tone: "neutral",
    },
    evidence: [
      isIncreasing(burn) ? "30D ETH burn increased versus the prior 30D period." : "30D ETH burn did not increase versus the prior 30D period.",
      isIncreasing(rent) ? "L2 rent increased, improving Ethereum protocol revenue capture." : "L2 rent did not increase versus the prior 30D period.",
      issuanceImproving ? "Net issuance is moving lower, reducing ETH supply pressure." : issuance.current !== null && issuance.current < 0 ? "Net issuance is negative, but supply reduction is not improving." : "Net issuance is nonnegative, so supply is not decreasing.",
    ],
    cards,
  };
}
