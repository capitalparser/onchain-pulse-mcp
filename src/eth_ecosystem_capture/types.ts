import { z } from "zod";
import { EthWindowSchema } from "../eth_value_capture/types.js";

const FiniteNullableSchema = z.number().finite().nullable();

export const EcosystemUsdWindowMetricSchema = z.object({
  current: FiniteNullableSchema,
  previous: FiniteNullableSchema,
  delta: FiniteNullableSchema,
  pct_change: FiniteNullableSchema,
  unit: z.literal("USD"),
}).strict();
export type EcosystemUsdWindowMetric = z.infer<typeof EcosystemUsdWindowMetricSchema>;

export const EcosystemRatioMetricSchema = z.object({
  current: FiniteNullableSchema,
  previous: FiniteNullableSchema,
  delta: FiniteNullableSchema,
  unit: z.literal("ratio"),
}).strict();
export type EcosystemRatioMetric = z.infer<typeof EcosystemRatioMetricSchema>;

export const EthEcosystemCaptureGapCodeSchema = z.enum([
  "source_access_gap",
  "growthepie_schema_drift",
  "source_stale",
  "period_mismatch",
  "chain_metadata_gap",
  "fees_coverage_gap",
  "rent_coverage_gap",
  "stablecoin_coverage_gap",
  "alternative_da_excluded",
  "partial_result",
]);
export type EthEcosystemCaptureGapCode = z.infer<typeof EthEcosystemCaptureGapCodeSchema>;

export const EthEcosystemCaptureGapSchema = z.object({
  code: EthEcosystemCaptureGapCodeSchema,
  detail: z.string().min(1).max(500),
}).strict();
export type EthEcosystemCaptureGap = z.infer<typeof EthEcosystemCaptureGapSchema>;

export const EthEcosystemCaptureSourceStatusSchema = z.object({
  source: z.string().min(1).max(160),
  role: z.string().min(1).max(240),
  as_of: z.string().nullable(),
  stale: z.boolean(),
}).strict();
export type EthEcosystemCaptureSourceStatus = z.infer<typeof EthEcosystemCaptureSourceStatusSchema>;

export const GetEthEcosystemCaptureInputSchema = z.object({
  window: EthWindowSchema.default("30d"),
}).strict();
export type GetEthEcosystemCaptureInput = z.infer<typeof GetEthEcosystemCaptureInputSchema>;

const EthEcosystemCaptureSnapshotBaseSchema = z.object({
  summary: z.string().min(1).max(500),
  window: EthWindowSchema,
  cutoff_day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  as_of: z.string().min(1),
  status: z.enum(["complete", "partial", "unavailable"]),
  metrics: z.object({
    l2_user_fees_usd: EcosystemUsdWindowMetricSchema,
    l2_rent_paid_usd: EcosystemUsdWindowMetricSchema,
    l2_settlement_cost_share: EcosystemRatioMetricSchema,
    ethereum_l1_stablecoin_supply_usd: EcosystemUsdWindowMetricSchema,
    ethereum_l2_stablecoin_supply_usd: EcosystemUsdWindowMetricSchema,
    ethereum_ecosystem_stablecoin_supply_usd: EcosystemUsdWindowMetricSchema,
  }).strict(),
  coverage: z.object({
    included_l2_count: z.number().int().nonnegative(),
    included_l2_origins: z.array(z.string().min(1).max(120)).max(128),
    excluded_external_da_origins: z.array(z.string().min(1).max(120)).max(128),
  }).strict(),
  sources: z.array(z.string().min(1).max(160)).max(16),
  source_status: z.array(EthEcosystemCaptureSourceStatusSchema).max(16),
  stale_data: z.array(z.string().min(1).max(240)).max(32),
  confidence: z.number().finite().min(0).max(1),
  gaps: z.array(EthEcosystemCaptureGapSchema).max(32),
  methodology_version: z.literal("eth-ecosystem-capture-v1"),
}).strict();

export const EthEcosystemCaptureSnapshotSchema = EthEcosystemCaptureSnapshotBaseSchema.superRefine((snapshot, context) => {
  if (snapshot.coverage.included_l2_count !== snapshot.coverage.included_l2_origins.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "included_l2_count must equal included_l2_origins length",
    });
  }

  const metricValues = [
    snapshot.metrics.l2_user_fees_usd,
    snapshot.metrics.l2_rent_paid_usd,
    snapshot.metrics.l2_settlement_cost_share,
    snapshot.metrics.ethereum_l1_stablecoin_supply_usd,
    snapshot.metrics.ethereum_l2_stablecoin_supply_usd,
    snapshot.metrics.ethereum_ecosystem_stablecoin_supply_usd,
  ].flatMap((metric) => [metric.current, metric.previous]);
  const allPresent = metricValues.every((value) => value !== null);
  const anyPresent = metricValues.some((value) => value !== null);

  if (snapshot.status === "complete" && (!allPresent || snapshot.gaps.length > 0 || snapshot.stale_data.length > 0)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "complete snapshots require full fresh metric coverage without gaps",
    });
  }
  if (snapshot.status === "unavailable" && anyPresent) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "unavailable snapshots cannot expose partial metric values",
    });
  }
});
export type EthEcosystemCaptureSnapshot = z.infer<typeof EthEcosystemCaptureSnapshotSchema>;
