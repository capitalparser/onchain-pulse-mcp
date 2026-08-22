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
 * V2 adds explicit ecosystem and capture semantics below.
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

const SharedSnapshotFields = {
  summary: z.string().min(1).max(500),
  as_of: z.string().min(1),
  window: z.literal("30d"),
  judgment: DemandCompassJudgmentSchema,
  evidence: z.array(z.string().min(1).max(240)).max(4),
  sources: z.array(z.string().min(1).max(160)).max(48),
  confidence: z.number().finite().min(0).max(1),
  gaps: z.array(DemandCompassGapSchema).max(24),
} as const;

export const EthDemandCompassV2SnapshotSchema = z.object({
  ...SharedSnapshotFields,
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

/**
 * Stored dashboard snapshots created before V2 remain readable, but this schema
 * cannot validate or produce the new ecosystem-versus-capture classification.
 */
export const EthDemandCompassV1SnapshotSchema = z.object({
  ...SharedSnapshotFields,
  axes: z.object({
    usage_demand: DemandCompassAxisSchema,
    l2_settlement: DemandCompassAxisSchema,
    supply_absorption: DemandCompassAxisSchema,
    collateral_demand: DemandCompassAxisSchema,
    monetary_settlement: DemandCompassAxisSchema,
  }).strict(),
  methodology_version: z.literal("eth-demand-compass-v1"),
}).strict();

/**
 * Public read boundary accepts historical V1 snapshots and strict V2 snapshots.
 * The current builder emits only V2 and validates against the V2 schema.
 */
export const EthDemandCompassSnapshotSchema = z.union([
  EthDemandCompassV2SnapshotSchema,
  EthDemandCompassV1SnapshotSchema,
]);

export type EthDemandCompassV2Snapshot = z.infer<typeof EthDemandCompassV2SnapshotSchema>;
export type EthDemandCompassV1Snapshot = z.infer<typeof EthDemandCompassV1SnapshotSchema>;
export type EthDemandCompassSnapshot = z.infer<typeof EthDemandCompassSnapshotSchema>;
