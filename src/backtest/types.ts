import { z } from "zod";
import { DemandCompassJudgmentSchema } from "../eth_demand_compass/types.js";

export const CompassBacktestHorizonSchema = z.enum(["7d", "30d", "90d"]);
export type CompassBacktestHorizon = z.infer<typeof CompassBacktestHorizonSchema>;

const TimestampSchema = z.string().datetime({ offset: true });
const BoundedPercentSchema = z.number().finite().min(-10_000).max(10_000);

export const CompassForwardOutcomeSchema = z.object({
  outcome_at: TimestampSchema,
  eth_return_pct: BoundedPercentSchema.nullable().optional(),
  value_capture_delta_pct: BoundedPercentSchema.nullable().optional(),
}).strict().superRefine((outcome, context) => {
  if (outcome.eth_return_pct == null && outcome.value_capture_delta_pct == null) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "outcomes require at least one available metric" });
  }
});
export type CompassForwardOutcome = z.infer<typeof CompassForwardOutcomeSchema>;

export const CompassBacktestRowSchema = z.object({
  observed_at: TimestampSchema,
  judgment: DemandCompassJudgmentSchema,
  confidence: z.number().finite().min(0).max(1),
  outcomes: z.object({
    "7d": CompassForwardOutcomeSchema.nullable(),
    "30d": CompassForwardOutcomeSchema.nullable(),
    "90d": CompassForwardOutcomeSchema.nullable(),
  }).strict(),
}).strict();
export type CompassBacktestRow = z.infer<typeof CompassBacktestRowSchema>;

const NullableStatisticSchema = z.object({
  sample_count: z.number().int().nonnegative(),
  average: z.number().finite().nullable(),
  median: z.number().finite().nullable(),
}).strict();

const StructuralConfirmationSchema = z.object({
  structural_signal_count: z.number().int().nonnegative(),
  available_outcome_count: z.number().int().nonnegative(),
  confirmation_count: z.number().int().nonnegative(),
  rate: z.number().finite().min(0).max(1).nullable(),
}).strict().superRefine((summary, context) => {
  if (summary.confirmation_count > summary.available_outcome_count || summary.available_outcome_count > summary.structural_signal_count) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "structural confirmation counts are inconsistent" });
  }
  if ((summary.available_outcome_count === 0) !== (summary.rate === null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "structural confirmation rate must be null exactly when no outcome is available" });
  }
});

const CompassBacktestJudgmentSummaryBaseSchema = z.object({
  observation_count: z.number().int().nonnegative(),
  sample_count: z.number().int().nonnegative(),
  coverage: z.number().finite().min(0).max(1),
  eth_return_pct: NullableStatisticSchema,
  structural_confirmation: StructuralConfirmationSchema,
}).strict();

export const CompassBacktestJudgmentSummarySchema = CompassBacktestJudgmentSummaryBaseSchema.superRefine((summary, context) => {
  if (summary.sample_count > summary.observation_count) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "sample count cannot exceed observations" });
  }
});
export type CompassBacktestJudgmentSummary = z.infer<typeof CompassBacktestJudgmentSummarySchema>;

export const CompassBacktestHorizonSummarySchema = CompassBacktestJudgmentSummaryBaseSchema.extend({
  by_judgment: z.object({
    structural: CompassBacktestJudgmentSummarySchema,
    "flow-driven": CompassBacktestJudgmentSummarySchema,
    neutral: CompassBacktestJudgmentSummarySchema,
    "data-warning": CompassBacktestJudgmentSummarySchema,
  }).strict(),
}).strict();
export type CompassBacktestHorizonSummary = z.infer<typeof CompassBacktestHorizonSummarySchema>;

export const CompassBacktestReportSchema = z.object({
  methodology_version: z.literal("compass-backtest-v1"),
  interpretation: z.literal("descriptive_validation_not_price_prediction"),
  observation_count: z.number().int().nonnegative(),
  horizons: z.object({
    "7d": CompassBacktestHorizonSummarySchema,
    "30d": CompassBacktestHorizonSummarySchema,
    "90d": CompassBacktestHorizonSummarySchema,
  }).strict(),
}).strict();
export type CompassBacktestReport = z.infer<typeof CompassBacktestReportSchema>;
