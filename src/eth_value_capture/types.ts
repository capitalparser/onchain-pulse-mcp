import { z } from "zod";

export const EthWindowSchema = z.enum(["7d", "30d", "90d"]);
export type EthWindow = z.infer<typeof EthWindowSchema>;

export const EthPaidModeSchema = z.enum(["free_only", "byok_allowed"]);
export type EthPaidMode = z.infer<typeof EthPaidModeSchema>;

export const GetEthValueCaptureInputSchema = z
  .object({
    window: EthWindowSchema.default("30d"),
    paid_mode: EthPaidModeSchema.default("free_only"),
    include_rollups: z.boolean().default(false),
  })
  .strict();
export type GetEthValueCaptureInput = z.infer<typeof GetEthValueCaptureInputSchema>;

const FiniteNullableSchema = z.number().finite().nullable();

export const EthWindowMetricSchema = z
  .object({
    current: FiniteNullableSchema,
    previous: FiniteNullableSchema,
    delta: FiniteNullableSchema,
    pct_change: FiniteNullableSchema,
    unit: z.literal("ETH"),
  })
  .strict();
export type EthWindowMetric = z.infer<typeof EthWindowMetricSchema>;

export const EthRatioMetricSchema = z
  .object({
    current: FiniteNullableSchema,
    previous: FiniteNullableSchema,
    delta: FiniteNullableSchema,
    unit: z.literal("ratio"),
  })
  .strict();
export type EthRatioMetric = z.infer<typeof EthRatioMetricSchema>;

export const EthValueGapCodeSchema = z.enum([
  "source_access_gap",
  "source_stale",
  "dune_execution_failed",
  "dune_execution_timeout",
  "dune_schema_drift",
  "partial_result",
  "period_mismatch",
  "derivation_blocked",
]);
export type EthValueGapCode = z.infer<typeof EthValueGapCodeSchema>;

export const EthValueGapSchema = z
  .object({
    code: EthValueGapCodeSchema,
    detail: z.string().min(1),
  })
  .strict();
export type EthValueGap = z.infer<typeof EthValueGapSchema>;

export const EthSourceStatusSchema = z
  .object({
    source: z.string().min(1),
    role: z.string().min(1),
    as_of: z.string().nullable(),
    stale: z.boolean(),
  })
  .strict();
export type EthSourceStatus = z.infer<typeof EthSourceStatusSchema>;

export const EthRollupMetricSchema = z
  .object({
    name: z.string().min(1),
    l1_rent_eth: EthWindowMetricSchema,
    calldata_fee_eth: EthWindowMetricSchema,
    blob_fee_eth: EthWindowMetricSchema,
    verification_fee_eth: EthWindowMetricSchema,
  })
  .strict();
export type EthRollupMetric = z.infer<typeof EthRollupMetricSchema>;

const EthMetricsSchema = z
  .object({
    gross_l1_fees_eth: EthWindowMetricSchema,
    base_fee_burn_eth: EthWindowMetricSchema,
    blob_fee_burn_eth: EthWindowMetricSchema,
    priority_fee_eth: EthWindowMetricSchema,
    total_burn_eth: EthWindowMetricSchema,
    consensus_issuance_eth: EthWindowMetricSchema,
    net_issuance_eth: EthWindowMetricSchema,
    l2_rent_paid_eth: EthWindowMetricSchema,
    l2_calldata_fee_eth: EthWindowMetricSchema,
    l2_blob_fee_eth: EthWindowMetricSchema,
    l2_verification_fee_eth: EthWindowMetricSchema,
  })
  .strict();

const EthRatiosSchema = z
  .object({
    blob_share_of_total_burn: EthRatioMetricSchema,
    l2_rent_share_of_l1_fees: EthRatioMetricSchema,
  })
  .strict();

export const EthValueCaptureSnapshotSchema = z
  .object({
    summary: z.string().min(1),
    window: EthWindowSchema,
    cutoff_day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    as_of: z.string().min(1),
    status: z.enum(["complete", "partial", "unavailable"]),
    metrics: EthMetricsSchema,
    ratios: EthRatiosSchema,
    rollups: z.array(EthRollupMetricSchema).optional(),
    sources: z.array(z.string()),
    source_status: z.array(EthSourceStatusSchema),
    stale_data: z.array(z.string()),
    confidence: z.number().finite().min(0).max(1),
    capabilities: z
      .object({
        byok_active: z.array(z.string()),
        paid_sources_active: z.array(z.string()),
      })
      .strict(),
    gaps: z.array(EthValueGapSchema),
    methodology_version: z.literal("eth-value-capture-v1"),
  })
  .strict();
export type EthValueCaptureSnapshot = z.infer<typeof EthValueCaptureSnapshotSchema>;
