import { z } from "zod";

export const DemandCompassAxisStatusSchema = z.enum([
  "improving",
  "weakening",
  "neutral",
  "unknown",
]);
export type DemandCompassAxisStatus = z.infer<typeof DemandCompassAxisStatusSchema>;

export const DemandCompassJudgmentSchema = z.enum([
  "structural",
  "flow-driven",
  "neutral",
  "data-warning",
]);
export type DemandCompassJudgment = z.infer<typeof DemandCompassJudgmentSchema>;

export const DemandCompassAxisSchema = z.object({
  status: DemandCompassAxisStatusSchema,
  score: z.number().int().min(-1).max(1).nullable(),
  evidence: z.array(z.string().min(1).max(180)).min(1).max(2),
  sources: z.array(z.string().min(1).max(120)).max(8),
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
  "usage_metrics_missing",
  "l2_metrics_missing",
  "net_issuance_missing",
  "collateral_sources_missing",
  "collateral_trend_not_available",
  "stablecoin_delta_missing",
  "stale_source",
  "insufficient_trend_coverage",
]);
export type DemandCompassGapCode = z.infer<typeof DemandCompassGapCodeSchema>;

export const DemandCompassGapSchema = z.object({
  code: DemandCompassGapCodeSchema,
  detail: z.string().min(1).max(240),
}).strict();
export type DemandCompassGap = z.infer<typeof DemandCompassGapSchema>;

export const EthDemandCompassSnapshotSchema = z.object({
  summary: z.string().min(1).max(280),
  as_of: z.string().min(1),
  window: z.literal("30d"),
  judgment: DemandCompassJudgmentSchema,
  axes: z.object({
    usage_demand: DemandCompassAxisSchema,
    l2_settlement: DemandCompassAxisSchema,
    supply_absorption: DemandCompassAxisSchema,
    collateral_demand: DemandCompassAxisSchema,
    monetary_settlement: DemandCompassAxisSchema,
  }).strict(),
  evidence: z.array(z.string().min(1).max(180)).max(3),
  sources: z.array(z.string().min(1).max(120)).max(32),
  confidence: z.number().finite().min(0).max(1),
  gaps: z.array(DemandCompassGapSchema).max(16),
  methodology_version: z.literal("eth-demand-compass-v1"),
}).strict();
export type EthDemandCompassSnapshot = z.infer<typeof EthDemandCompassSnapshotSchema>;
