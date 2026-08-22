import { z } from "zod";

export const DemandCompassAxisStatusSchema = z.enum([
  "improving",
  "weakening",
  "neutral",
  "unknown",
]);
export type DemandCompassAxisStatus = z.infer<typeof DemandCompassAxisStatusSchema>;

/**
 * Kept as a compact compatibility surface for existing dashboard/backtest consumers.
 * V2 adds explicit ecosystem, capture, and leakage semantics below.
 */
export const DemandCompassJudgmentSchema = z.enum([
  "structural",
  "flow-driven",
  "neutral",
  "data-warning",
]);
export type DemandCompassJudgment = z.infer<typeof DemandCompassJudgmentSchema>;

export const EthEcosystemStateSchema = z.enum([
  "expanding",
  "stable",
  "contracting",
  "unknown",
]);
export type EthEcosystemState = z.infer<typeof EthEcosystemStateSchema>;

export const EthCaptureStateSchema = z.enum([
  "strengthening",
  "stable",
  "weakening",
  "unknown",
]);
export type EthCaptureState = z.infer<typeof EthCaptureStateSchema>;

export const EthValueAccrualClassificationSchema = z.enum([
  "growth_with_capture",
  "growth_without_capture",
  "capture_without_growth",
  "weak",
  "data_warning",
]);
export type EthValueAccrualClassification = z.infer<typeof EthValueAccrualClassificationSchema>;

export const EthCaptureTierSchema = z.enum([
  "collateral_and_reserve",
  "fee_and_supply",
  "fee_only",
  "none",
  "unknown",
]);
export type EthCaptureTier = z.infer<typeof EthCaptureTierSchema>;

export const DemandCompassAxisSchema = z.object({
  status: DemandCompassAxisStatusSchema,
  score: z.number().int().min(-1).max(1).nullable(),
  evidence: z.array(z.string().min(1).max(240)).min(1).max(2),
  sources: z.array(z.string().min(1).max(160)).max(16),
  confidence: z.number().finite().min(0).max(1),
}).strict().superRefine((axis, context) => {
  if ((axis.status === "unknown") !== (axis.score === null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "unknown axes must have null scores" });
  }
  if (axis.status !== "unknown" && axis.score === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "known axes require a score" });
  }
  if ((axis.status === "improving" && axis.score !== 1)
    || (axis.status === "weakening" && axis.score !== -1)
    || (axis.status === "neutral" && axis.score !== 0)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "axis status must match its score" });
  }
});
export type DemandCompassAxis = z.infer<typeof DemandCompassAxisSchema>;

export const DemandCompassGapCodeSchema = z.enum([
  "ecosystem_metrics_missing",
  "usage_metrics_missing",
  "l2_metrics_missing",
  "settlement_capture_missing",
  "net_issuance_missing",
  "collateral_sources_missing",
  "collateral_trend_not_available",
  "collateral_confirmation_missing",
  "stablecoin_delta_missing",
  "stale_source",
  "insufficient_trend_coverage",
  "ecosystem_growth_without_capture",
]);
export type DemandCompassGapCode = z.infer<typeof DemandCompassGapCodeSchema>;

export const DemandCompassGapSchema = z.object({
  code: DemandCompassGapCodeSchema,
  detail: z.string().min(1).max(360),
}).strict();
export type DemandCompassGap = z.infer<typeof DemandCompassGapSchema>;

export const EthDemandCompassSnapshotSchema = z.object({
  summary: z.string().min(1).max(500),
  as_of: z.string().min(1),
  window: z.literal("30d"),
  judgment: DemandCompassJudgmentSchema,
  ecosystem_state: EthEcosystemStateSchema,
  eth_capture_state: EthCaptureStateSchema,
  classification: EthValueAccrualClassificationSchema,
  capture_tier: EthCaptureTierSchema,
  axes: z.object({
    ecosystem_activity: DemandCompassAxisSchema,
    usage_demand: DemandCompassAxisSchema,
    l2_settlement: DemandCompassAxisSchema,
    settlement_capture: DemandCompassAxisSchema,
    supply_absorption: DemandCompassAxisSchema,
    collateral_demand: DemandCompassAxisSchema,
    monetary_settlement: DemandCompassAxisSchema,
  }).strict(),
  evidence: z.array(z.string().min(1).max(240)).max(4),
  sources: z.array(z.string().min(1).max(160)).max(48),
  confidence: z.number().finite().min(0).max(1),
  gaps: z.array(DemandCompassGapSchema).max(24),
  methodology_version: z.literal("eth-demand-compass-v2"),
}).strict().superRefine((snapshot, context) => {
  if (snapshot.judgment === "structural" && snapshot.capture_tier !== "collateral_and_reserve") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "structural judgment requires collateral-and-reserve capture confirmation",
    });
  }
  if (snapshot.classification === "data_warning" && snapshot.judgment !== "data-warning") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "data-warning classification must map to the compatibility judgment",
    });
  }
});

/** Strict runtime output of the V2 builder. */
export type EthDemandCompassV2Snapshot = z.infer<typeof EthDemandCompassSnapshotSchema>;

type V2Axes = EthDemandCompassV2Snapshot["axes"];
type LegacyCompatibleAxes = Omit<V2Axes, "ecosystem_activity" | "settlement_capture">
  & Partial<Pick<V2Axes, "ecosystem_activity" | "settlement_capture">>;

/**
 * Public TypeScript compatibility type for stored V1 dashboard fixtures and V2 output.
 * New runtime output is always validated by EthDemandCompassSnapshotSchema as V2.
 */
export type EthDemandCompassSnapshot = Omit<
  EthDemandCompassV2Snapshot,
  | "ecosystem_state"
  | "eth_capture_state"
  | "classification"
  | "capture_tier"
  | "axes"
  | "methodology_version"
> & Partial<Pick<
  EthDemandCompassV2Snapshot,
  "ecosystem_state" | "eth_capture_state" | "classification" | "capture_tier"
>> & {
  axes: LegacyCompatibleAxes;
  methodology_version: "eth-demand-compass-v1" | "eth-demand-compass-v2";
};
