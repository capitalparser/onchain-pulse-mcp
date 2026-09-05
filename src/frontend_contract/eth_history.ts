import { z } from "zod";
import { getFeatureDefinition } from "../intelligence_core/feature_registry.js";
import {
  assessSourceForCommercialRedistribution,
  sourceLicensePolicy,
} from "../intelligence_core/source_license.js";
import {
  MetricObservationSchema,
  type MetricObservation,
} from "../intelligence_core/types.js";

export const ETH_FRONTEND_HISTORY_METRIC_KEYS = [
  "eth.gross_l1_fees_eth",
  "eth.total_burn_eth",
  "eth.blob_fee_burn_eth",
  "eth.net_issuance_eth",
  "eth.l2_rent_paid_eth",
  "eth.l2_rent_share_of_l1_fees",
  "eth.l2_user_fees_usd",
  "eth.l2_rent_paid_usd",
  "eth.l2_settlement_cost_share",
  "eth.l1_stablecoin_supply_usd",
  "eth.l2_stablecoin_supply_usd",
  "eth.ecosystem_stablecoin_supply_usd",
] as const;
export type EthFrontendHistoryMetricKey = typeof ETH_FRONTEND_HISTORY_METRIC_KEYS[number];

export const ETH_FRONTEND_HISTORY_DEFAULT_METRIC_KEYS = [
  "eth.total_burn_eth",
  "eth.net_issuance_eth",
  "eth.l2_user_fees_usd",
  "eth.l2_rent_paid_usd",
  "eth.l2_settlement_cost_share",
  "eth.ecosystem_stablecoin_supply_usd",
] as const satisfies readonly EthFrontendHistoryMetricKey[];

export const EthFrontendHistoryRangeSchema = z.enum(["30d", "90d", "180d", "365d"]);
export type EthFrontendHistoryRange = z.infer<typeof EthFrontendHistoryRangeSchema>;

export const EthFrontendHistoryWindowSchema = z.enum(["7d", "30d", "90d"]);
export type EthFrontendHistoryWindow = z.infer<typeof EthFrontendHistoryWindowSchema>;

export const EthFrontendHistoryQuerySchema = z.object({
  metric_keys: z.array(z.enum(ETH_FRONTEND_HISTORY_METRIC_KEYS)).min(1).max(8),
  range: EthFrontendHistoryRangeSchema,
  window: EthFrontendHistoryWindowSchema,
  start_at: z.string().datetime({ offset: true }),
  cutoff_at: z.string().datetime({ offset: true }),
}).strict().superRefine((query, context) => {
  if (new Set(query.metric_keys).size !== query.metric_keys.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["metric_keys"],
      message: "metric keys must be unique",
    });
  }
  if (Date.parse(query.start_at) > Date.parse(query.cutoff_at)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["start_at"],
      message: "start_at must be at or before cutoff_at",
    });
  }
});
export type EthFrontendHistoryQuery = z.infer<typeof EthFrontendHistoryQuerySchema>;

const HistoryPointSchema = z.object({
  observed_at: z.string().datetime({ offset: true }),
  ingested_at: z.string().datetime({ offset: true }),
  value: z.number().finite(),
  confidence: z.number().finite().min(0).max(1),
  methodology_version: z.string().min(1).max(120),
  revision_count: z.number().int().positive(),
}).strict();

const MethodologySegmentSchema = z.object({
  methodology_version: z.string().min(1).max(120),
  from_observed_at: z.string().datetime({ offset: true }),
  to_observed_at: z.string().datetime({ offset: true }),
  point_count: z.number().int().positive(),
}).strict();

const HistoryGapCodeSchema = z.enum([
  "metric_not_collected",
  "daily_coverage_gap",
  "ambiguous_latest_revision",
  "unit_mismatch",
]);
export type HistoryGapCode = z.infer<typeof HistoryGapCodeSchema>;

const FeatureFamilySchema = z.enum([
  "usage",
  "supply",
  "settlement",
  "liquidity",
  "leverage",
  "collateral",
  "flow",
  "valuation",
  "risk",
]);

const HistorySeriesSchema = z.object({
  metric_key: z.enum(ETH_FRONTEND_HISTORY_METRIC_KEYS),
  description: z.string().min(1).max(500),
  unit: z.string().min(1).max(80),
  family: FeatureFamilySchema,
  cadence: z.literal("daily"),
  points: z.array(HistoryPointSchema).max(366),
  coverage: z.object({
    expected_day_count: z.number().int().positive(),
    observed_day_count: z.number().int().nonnegative(),
    missing_day_count: z.number().int().nonnegative(),
    missing_date_samples: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(31),
    first_observed_at: z.string().datetime({ offset: true }).nullable(),
    last_observed_at: z.string().datetime({ offset: true }).nullable(),
  }).strict(),
  source_refs: z.array(z.string().min(1).max(200)).max(64),
  methodology_segments: z.array(MethodologySegmentSchema).max(32),
  gap_codes: z.array(HistoryGapCodeSchema).max(8),
}).strict();

export const EthFrontendHistorySnapshotSchema = z.object({
  scope: z.literal("ethereum_metric_history"),
  subject_ref: z.literal("ethereum"),
  range: EthFrontendHistoryRangeSchema,
  window: EthFrontendHistoryWindowSchema,
  start_at: z.string().datetime({ offset: true }),
  cutoff_at: z.string().datetime({ offset: true }),
  generated_at: z.string().datetime({ offset: true }),
  status: z.enum(["complete", "partial", "unavailable"]),
  series: z.array(HistorySeriesSchema).min(1).max(8),
  data_quality: z.object({
    point_in_time_cutoff_applied: z.literal(true),
    expected_day_count: z.number().int().positive(),
    series_with_points: z.number().int().nonnegative(),
    series_without_points: z.number().int().nonnegative(),
    selected_point_count: z.number().int().nonnegative(),
    discarded_revision_count: z.number().int().nonnegative(),
    ambiguous_revision_count: z.number().int().nonnegative(),
    latest_ingested_at: z.string().datetime({ offset: true }).nullable(),
    gap_codes: z.array(HistoryGapCodeSchema).max(8),
  }).strict(),
  distribution: z.object({
    commercial_redistribution_allowed: z.boolean(),
    attribution_required: z.boolean(),
    restricted_source_refs: z.array(z.string().min(1).max(200)).max(64),
    unknown_source_refs: z.array(z.string().min(1).max(200)).max(64),
  }).strict(),
  methodology_version: z.literal("eth-frontend-history-v1"),
}).strict().superRefine((snapshot, context) => {
  if (snapshot.series.length !== snapshot.data_quality.series_with_points + snapshot.data_quality.series_without_points) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["data_quality"],
      message: "series counts must reconcile to returned series",
    });
  }
  const pointCount = snapshot.series.reduce((sum, series) => sum + series.points.length, 0);
  if (pointCount !== snapshot.data_quality.selected_point_count) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["data_quality", "selected_point_count"],
      message: "selected_point_count must reconcile to returned points",
    });
  }
  if (snapshot.status === "complete" && snapshot.data_quality.gap_codes.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["status"],
      message: "complete history cannot contain data gaps",
    });
  }
  if (snapshot.status === "unavailable" && snapshot.data_quality.selected_point_count > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["status"],
      message: "unavailable history cannot contain selected points",
    });
  }
});
export type EthFrontendHistorySnapshot = z.infer<typeof EthFrontendHistorySnapshotSchema>;

const RANGE_DAYS: Record<EthFrontendHistoryRange, number> = {
  "30d": 30,
  "90d": 90,
  "180d": 180,
  "365d": 365,
};

export class EthFrontendHistoryQueryError extends Error {}

function singleParam(searchParams: URLSearchParams, name: string): string | null {
  const values = searchParams.getAll(name);
  if (values.length > 1) throw new EthFrontendHistoryQueryError(`${name} must be provided at most once`);
  return values[0] ?? null;
}

function utcDayStart(day: string): string {
  return `${day}T00:00:00.000Z`;
}

function shiftUtcDay(day: string, amount: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function parseEthFrontendHistorySearchParams(
  searchParams: URLSearchParams,
  now: Date = new Date(),
): EthFrontendHistoryQuery {
  const allowedParams = new Set(["metrics", "range", "window", "cutoff"]);
  const unknownParams = [...new Set(searchParams.keys())].filter((name) => !allowedParams.has(name));
  if (unknownParams.length > 0) {
    throw new EthFrontendHistoryQueryError(`unsupported query parameters: ${unknownParams.sort().join(", ")}`);
  }

  const metricsRaw = singleParam(searchParams, "metrics");
  const metricKeys = metricsRaw === null || metricsRaw.trim().length === 0
    ? [...ETH_FRONTEND_HISTORY_DEFAULT_METRIC_KEYS]
    : metricsRaw.split(",").map((value) => value.trim()).filter(Boolean);
  const range = singleParam(searchParams, "range") ?? "90d";
  const window = singleParam(searchParams, "window") ?? "30d";
  const cutoffRaw = singleParam(searchParams, "cutoff") ?? now.toISOString();

  let cutoffAt: string;
  try {
    cutoffAt = new Date(z.string().datetime({ offset: true }).parse(cutoffRaw)).toISOString();
  } catch {
    throw new EthFrontendHistoryQueryError("cutoff must be an ISO timestamp with timezone offset");
  }
  if (Date.parse(cutoffAt) > now.getTime()) {
    throw new EthFrontendHistoryQueryError("cutoff must not be in the future");
  }

  let parsedRange: EthFrontendHistoryRange;
  let parsedWindow: EthFrontendHistoryWindow;
  try {
    parsedRange = EthFrontendHistoryRangeSchema.parse(range);
    parsedWindow = EthFrontendHistoryWindowSchema.parse(window);
  } catch {
    throw new EthFrontendHistoryQueryError("range or window is not supported");
  }
  const cutoffDay = cutoffAt.slice(0, 10);
  const startDay = shiftUtcDay(cutoffDay, -(RANGE_DAYS[parsedRange] - 1));

  const parsed = EthFrontendHistoryQuerySchema.safeParse({
    metric_keys: metricKeys,
    range: parsedRange,
    window: parsedWindow,
    start_at: utcDayStart(startDay),
    cutoff_at: cutoffAt,
  });
  if (!parsed.success) {
    throw new EthFrontendHistoryQueryError("history query is invalid");
  }
  return parsed.data;
}

// Only comparison/bucketing is normalized; public timestamps and stored IDs stay intact.
function utcDay(timestamp: string): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function expectedDays(query: EthFrontendHistoryQuery): string[] {
  const output: string[] = [];
  for (let day = utcDay(query.start_at); day <= utcDay(query.cutoff_at); day = shiftUtcDay(day, 1)) {
    output.push(day);
  }
  return output;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

interface SelectedDayPoint {
  observation: MetricObservation;
  revisionCount: number;
  discardedCount: number;
  ambiguous: boolean;
}

function selectDailyPoint(rows: MetricObservation[]): SelectedDayPoint {
  const sorted = [...rows].sort((left, right) =>
    Date.parse(right.observed_at) - Date.parse(left.observed_at)
    || Date.parse(right.ingested_at) - Date.parse(left.ingested_at)
    || left.id.localeCompare(right.id)
  );
  const latestObservedAt = Date.parse(sorted[0]!.observed_at);
  const latestObservedRows = sorted.filter((row) => Date.parse(row.observed_at) === latestObservedAt);
  const latestIngestedAt = latestObservedRows
    .map((row) => Date.parse(row.ingested_at))
    .sort((left, right) => right - left)[0]!;
  const latestRows = latestObservedRows.filter((row) => Date.parse(row.ingested_at) === latestIngestedAt);
  const signatures = new Set(latestRows.map((row) => JSON.stringify({
    value: row.value,
    unit: row.unit,
    entity_ref: row.entity_ref ?? null,
    asset_ref: row.asset_ref ?? null,
    source_at: Date.parse(row.source_at),
    confidence: row.confidence,
    source_refs: uniqueSorted(row.source_refs),
    methodology_version: row.methodology_version,
    dimensions: Object.entries(row.dimensions).sort(([left], [right]) => left.localeCompare(right)),
  })));
  const selected = [...latestRows].sort((left, right) => left.id.localeCompare(right.id))[0]!;
  return {
    observation: selected,
    revisionCount: rows.length,
    discardedCount: Math.max(0, rows.length - 1),
    ambiguous: signatures.size > 1,
  };
}

function methodologySegments(points: Array<z.infer<typeof HistoryPointSchema>>) {
  const segments: Array<z.infer<typeof MethodologySegmentSchema>> = [];
  for (const point of points) {
    const previous = segments.at(-1);
    if (previous?.methodology_version === point.methodology_version) {
      previous.to_observed_at = point.observed_at;
      previous.point_count += 1;
      continue;
    }
    segments.push({
      methodology_version: point.methodology_version,
      from_observed_at: point.observed_at,
      to_observed_at: point.observed_at,
      point_count: 1,
    });
  }
  return segments;
}

export function buildEthFrontendHistory(args: {
  query: EthFrontendHistoryQuery;
  observations: readonly MetricObservation[];
  generatedAt: Date;
}): EthFrontendHistorySnapshot {
  const query = EthFrontendHistoryQuerySchema.parse(args.query);
  const generatedAt = args.generatedAt.toISOString();
  if (Date.parse(generatedAt) < Date.parse(query.cutoff_at)) {
    throw new Error("generatedAt must be at or after cutoff_at");
  }
  const parsedObservations = args.observations.map((observation) => MetricObservationSchema.parse(observation));
  const metricSet = new Set(query.metric_keys);
  const eligible = parsedObservations.filter((observation) =>
    observation.subject_ref === "ethereum"
    && metricSet.has(observation.metric_key as EthFrontendHistoryMetricKey)
    && observation.dimensions.window === query.window
    && Date.parse(observation.observed_at) >= Date.parse(query.start_at)
    && Date.parse(observation.observed_at) <= Date.parse(query.cutoff_at)
    && Date.parse(observation.ingested_at) <= Date.parse(query.cutoff_at)
  );
  const requestedDays = expectedDays(query);
  let discardedRevisionCount = 0;
  let ambiguousRevisionCount = 0;
  const allSelectedSources: string[] = [];

  const series = query.metric_keys.map((metricKey) => {
    const definition = getFeatureDefinition(metricKey);
    if (definition === undefined || definition.cadence !== "daily" || !definition.point_in_time_safe) {
      throw new Error(`frontend history metric is not a daily point-in-time-safe feature: ${metricKey}`);
    }
    const rows = eligible.filter((observation) => observation.metric_key === metricKey);
    const rowsByDay = new Map<string, MetricObservation[]>();
    for (const row of rows) {
      const day = utcDay(row.observed_at);
      const bucket = rowsByDay.get(day) ?? [];
      bucket.push(row);
      rowsByDay.set(day, bucket);
    }

    const selected = [...rowsByDay.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, dayRows]) => selectDailyPoint(dayRows));
    discardedRevisionCount += selected.reduce((sum, item) => {
      const included = !item.ambiguous && item.observation.unit === definition.unit;
      return sum + (included ? item.discardedCount : item.revisionCount);
    }, 0);
    ambiguousRevisionCount += selected.filter((item) => item.ambiguous).length;

    const gapCodes = new Set<HistoryGapCode>();
    if (rows.length === 0) gapCodes.add("metric_not_collected");
    if (selected.some((item) => item.ambiguous)) gapCodes.add("ambiguous_latest_revision");
    if (selected.some((item) => item.observation.unit !== definition.unit)) gapCodes.add("unit_mismatch");

    const points = selected
      .filter((item) => !item.ambiguous && item.observation.unit === definition.unit)
      .map((item) => ({
        observed_at: item.observation.observed_at,
        ingested_at: item.observation.ingested_at,
        value: item.observation.value,
        confidence: item.observation.confidence,
        methodology_version: item.observation.methodology_version,
        revision_count: item.revisionCount,
      }));
    const observedDays = new Set(points.map((point) => utcDay(point.observed_at)));
    const missingDays = requestedDays.filter((day) => !observedDays.has(day));
    if (missingDays.length > 0 && points.length > 0) gapCodes.add("daily_coverage_gap");
    const selectedRows = selected
      .filter((item) => !item.ambiguous && item.observation.unit === definition.unit)
      .map((item) => item.observation);
    const sourceRefs = uniqueSorted(selectedRows.flatMap((item) => item.source_refs));
    allSelectedSources.push(...sourceRefs);

    return {
      metric_key: metricKey,
      description: definition.description,
      unit: definition.unit,
      family: definition.family,
      cadence: "daily" as const,
      points,
      coverage: {
        expected_day_count: requestedDays.length,
        observed_day_count: observedDays.size,
        missing_day_count: missingDays.length,
        missing_date_samples: missingDays.slice(0, 31),
        first_observed_at: points[0]?.observed_at ?? null,
        last_observed_at: points.at(-1)?.observed_at ?? null,
      },
      source_refs: sourceRefs,
      methodology_segments: methodologySegments(points),
      gap_codes: [...gapCodes].sort(),
    };
  });

  const sources = uniqueSorted(allSelectedSources);
  const restrictedSourceRefs: string[] = [];
  const unknownSourceRefs: string[] = [];
  const attributionSourceRefs: string[] = [];
  for (const sourceRef of sources) {
    const assessment = assessSourceForCommercialRedistribution(sourceRef);
    if (assessment.policy === null) unknownSourceRefs.push(sourceRef);
    else if (!assessment.commerciallyRedistributable) restrictedSourceRefs.push(sourceRef);
    if (sourceLicensePolicy(sourceRef)?.attributionRequired) attributionSourceRefs.push(sourceRef);
  }

  const seriesWithPoints = series.filter((item) => item.points.length > 0).length;
  const selectedPointCount = series.reduce((sum, item) => sum + item.points.length, 0);
  const gapCodes = uniqueSorted(series.flatMap((item) => item.gap_codes)) as HistoryGapCode[];
  const latestIngestedAt = series
    .flatMap((item) => item.points.map((point) => point.ingested_at))
    .sort((left, right) => Date.parse(right) - Date.parse(left) || left.localeCompare(right))[0] ?? null;
  const complete = series.every((item) => item.coverage.missing_day_count === 0 && item.gap_codes.length === 0);
  const status = selectedPointCount === 0 ? "unavailable" : complete ? "complete" : "partial";

  return EthFrontendHistorySnapshotSchema.parse({
    scope: "ethereum_metric_history",
    subject_ref: "ethereum",
    range: query.range,
    window: query.window,
    start_at: query.start_at,
    cutoff_at: query.cutoff_at,
    generated_at: generatedAt,
    status,
    series,
    data_quality: {
      point_in_time_cutoff_applied: true,
      expected_day_count: requestedDays.length,
      series_with_points: seriesWithPoints,
      series_without_points: series.length - seriesWithPoints,
      selected_point_count: selectedPointCount,
      discarded_revision_count: discardedRevisionCount,
      ambiguous_revision_count: ambiguousRevisionCount,
      latest_ingested_at: latestIngestedAt,
      gap_codes: gapCodes,
    },
    distribution: {
      commercial_redistribution_allowed: sources.length > 0
        && restrictedSourceRefs.length === 0
        && unknownSourceRefs.length === 0,
      attribution_required: attributionSourceRefs.length > 0,
      restricted_source_refs: uniqueSorted(restrictedSourceRefs),
      unknown_source_refs: uniqueSorted(unknownSourceRefs),
    },
    methodology_version: "eth-frontend-history-v1",
  });
}
