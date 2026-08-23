import { z } from "zod";
import {
  DemandCompassJudgmentSchema,
  EthCaptureStateSchema,
  EthCaptureTierSchema,
  EthDemandCompassV2SnapshotSchema,
  EthEcosystemStateSchema,
  EthValueAccrualClassificationSchema,
  type EthDemandCompassSnapshot,
} from "../eth_demand_compass/types.js";
import {
  EcosystemRatioMetricSchema,
  EcosystemUsdWindowMetricSchema,
  EthEcosystemCaptureSnapshotSchema,
  type EthEcosystemCaptureSnapshot,
} from "../eth_ecosystem_capture/types.js";
import {
  EthValueCaptureSnapshotSchema,
  EthWindowMetricSchema,
  type EthValueCaptureSnapshot,
} from "../eth_value_capture/types.js";

export const FrontendOverviewStatusSchema = z.enum([
  "ready",
  "partial",
  "unavailable",
]);
export type FrontendOverviewStatus = z.infer<typeof FrontendOverviewStatusSchema>;

const DataStatusSchema = z.enum(["complete", "partial", "unavailable"]);

export const EthFrontendOverviewSnapshotSchema = z.object({
  scope: z.literal("ethereum_ecosystem_and_eth_value_accrual"),
  window: z.literal("30d"),
  generated_at: z.string().datetime({ offset: true }),
  as_of: z.string().datetime({ offset: true }),
  cutoff_day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  status: FrontendOverviewStatusSchema,
  decision: z.object({
    summary: z.string().min(1).max(500),
    judgment: DemandCompassJudgmentSchema,
    ecosystem_state: EthEcosystemStateSchema,
    eth_capture_state: EthCaptureStateSchema,
    classification: EthValueAccrualClassificationSchema,
    capture_tier: EthCaptureTierSchema,
    confidence: z.number().finite().min(0).max(1),
    evidence: z.array(z.string().min(1).max(240)).max(4),
  }).strict(),
  hero_metrics: z.object({
    protocol_total_burn_eth: EthWindowMetricSchema,
    protocol_net_issuance_eth: EthWindowMetricSchema,
    l2_user_fees_usd: EcosystemUsdWindowMetricSchema,
    l2_rent_paid_usd: EcosystemUsdWindowMetricSchema,
    l2_settlement_cost_share: EcosystemRatioMetricSchema,
    ethereum_ecosystem_stablecoin_supply_usd: EcosystemUsdWindowMetricSchema,
  }).strict(),
  coverage: z.object({
    included_l2_count: z.number().int().nonnegative(),
    included_l2_origins: z.array(z.string().min(1).max(120)).max(128),
    excluded_external_da_origins: z.array(z.string().min(1).max(120)).max(128),
  }).strict(),
  data_quality: z.object({
    aligned_cutoff: z.boolean(),
    value_capture_status: DataStatusSchema,
    ecosystem_capture_status: DataStatusSchema,
    compass_judgment: DemandCompassJudgmentSchema,
    stale_sources: z.array(z.string().min(1).max(160)).max(32),
    gap_codes: z.array(z.string().min(1).max(200)).max(96),
    source_count: z.number().int().nonnegative(),
    sources: z.array(z.string().min(1).max(160)).max(64),
    methodology_versions: z.object({
      value_capture: z.string().min(1).max(120),
      ecosystem_capture: z.string().min(1).max(120),
      demand_compass: z.string().min(1).max(120),
    }).strict(),
  }).strict(),
  detail_routes: z.object({
    value_capture: z.literal("/api/eth/value-capture?window=30d"),
    ecosystem_capture: z.literal("/api/eth/ecosystem-capture?window=30d"),
    demand_compass: z.literal("/api/eth/demand-compass"),
  }).strict(),
  methodology_version: z.literal("eth-frontend-overview-v1"),
}).strict().superRefine((snapshot, context) => {
  if (snapshot.data_quality.source_count !== snapshot.data_quality.sources.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["data_quality", "source_count"],
      message: "source_count must equal the number of unique sources",
    });
  }
  if (snapshot.status === "ready" && !snapshot.data_quality.aligned_cutoff) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["status"],
      message: "ready overview requires aligned cutoffs",
    });
  }
  if (snapshot.status === "ready" && snapshot.decision.judgment === "data-warning") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["status"],
      message: "ready overview cannot contain a data-warning decision",
    });
  }
});
export type EthFrontendOverviewSnapshot = z.infer<typeof EthFrontendOverviewSnapshotSchema>;

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function latestTimestamp(values: readonly string[]): string {
  const timestamps = values.map((value) => Date.parse(value));
  if (timestamps.some((value) => !Number.isFinite(value))) {
    throw new Error("overview source timestamps must be valid ISO timestamps");
  }
  return new Date(Math.max(...timestamps)).toISOString();
}

function hasCurrentMetric(value: number | null): boolean {
  return value !== null && Number.isFinite(value);
}

export function buildEthFrontendOverview(args: {
  valueCapture: EthValueCaptureSnapshot;
  ecosystemCapture: EthEcosystemCaptureSnapshot;
  compass: EthDemandCompassSnapshot;
  generatedAt: Date;
}): EthFrontendOverviewSnapshot {
  const valueCapture = EthValueCaptureSnapshotSchema.parse(args.valueCapture);
  const ecosystemCapture = EthEcosystemCaptureSnapshotSchema.parse(args.ecosystemCapture);
  const compass = EthDemandCompassV2SnapshotSchema.parse(args.compass);
  const generatedAt = args.generatedAt.toISOString();
  const asOf = latestTimestamp([
    valueCapture.as_of,
    ecosystemCapture.as_of,
    compass.as_of,
  ]);
  if (Date.parse(generatedAt) < Date.parse(asOf)) {
    throw new Error("generatedAt must be at or after all overview source timestamps");
  }

  const alignedCutoff = valueCapture.cutoff_day !== null
    && valueCapture.cutoff_day === ecosystemCapture.cutoff_day;
  const sources = uniqueSorted([
    ...valueCapture.sources,
    ...ecosystemCapture.sources,
    ...compass.sources,
  ]);
  const staleSources = uniqueSorted([
    ...valueCapture.source_status
      .filter((source) => source.stale)
      .map((source) => source.source),
    ...ecosystemCapture.source_status
      .filter((source) => source.stale)
      .map((source) => source.source),
  ]);
  const gapCodes = uniqueSorted([
    ...valueCapture.gaps.map((gap) => `value_capture:${gap.code}`),
    ...ecosystemCapture.gaps.map((gap) => `ecosystem_capture:${gap.code}`),
    ...compass.gaps.map((gap) => `demand_compass:${gap.code}`),
  ]);

  const heroMetrics = {
    protocol_total_burn_eth: valueCapture.metrics.total_burn_eth,
    protocol_net_issuance_eth: valueCapture.metrics.net_issuance_eth,
    l2_user_fees_usd: ecosystemCapture.metrics.l2_user_fees_usd,
    l2_rent_paid_usd: ecosystemCapture.metrics.l2_rent_paid_usd,
    l2_settlement_cost_share: ecosystemCapture.metrics.l2_settlement_cost_share,
    ethereum_ecosystem_stablecoin_supply_usd:
      ecosystemCapture.metrics.ethereum_ecosystem_stablecoin_supply_usd,
  };
  const hasAnyHeroMetric = [
    heroMetrics.protocol_total_burn_eth.current,
    heroMetrics.protocol_net_issuance_eth.current,
    heroMetrics.l2_user_fees_usd.current,
    heroMetrics.l2_rent_paid_usd.current,
    heroMetrics.l2_settlement_cost_share.current,
    heroMetrics.ethereum_ecosystem_stablecoin_supply_usd.current,
  ].some(hasCurrentMetric);
  const ready = alignedCutoff
    && valueCapture.status === "complete"
    && ecosystemCapture.status === "complete"
    && compass.judgment !== "data-warning"
    && staleSources.length === 0
    && gapCodes.length === 0;
  const status: FrontendOverviewStatus = ready
    ? "ready"
    : hasAnyHeroMetric
      ? "partial"
      : "unavailable";

  return EthFrontendOverviewSnapshotSchema.parse({
    scope: "ethereum_ecosystem_and_eth_value_accrual",
    window: "30d",
    generated_at: generatedAt,
    as_of: asOf,
    cutoff_day: alignedCutoff ? valueCapture.cutoff_day : null,
    status,
    decision: {
      summary: compass.summary,
      judgment: compass.judgment,
      ecosystem_state: compass.ecosystem_state,
      eth_capture_state: compass.eth_capture_state,
      classification: compass.classification,
      capture_tier: compass.capture_tier,
      confidence: compass.confidence,
      evidence: compass.evidence,
    },
    hero_metrics: heroMetrics,
    coverage: ecosystemCapture.coverage,
    data_quality: {
      aligned_cutoff: alignedCutoff,
      value_capture_status: valueCapture.status,
      ecosystem_capture_status: ecosystemCapture.status,
      compass_judgment: compass.judgment,
      stale_sources: staleSources,
      gap_codes: gapCodes,
      source_count: sources.length,
      sources,
      methodology_versions: {
        value_capture: valueCapture.methodology_version,
        ecosystem_capture: ecosystemCapture.methodology_version,
        demand_compass: compass.methodology_version,
      },
    },
    detail_routes: {
      value_capture: "/api/eth/value-capture?window=30d",
      ecosystem_capture: "/api/eth/ecosystem-capture?window=30d",
      demand_compass: "/api/eth/demand-compass",
    },
    methodology_version: "eth-frontend-overview-v1",
  });
}
