import { createHash } from "node:crypto";

const OBSERVATION_ID_VERSION = "metric-observation-id-v2";
const NON_SEMANTIC_DIMENSIONS = new Set([
  "collection_mode",
  "backfill_run_id",
  "revision_basis",
  "source_versioning",
  "quality_status",
  "source_stale",
]);

function isNonSemanticDimension(key: string): boolean {
  return NON_SEMANTIC_DIMENSIONS.has(key)
    || key.startsWith("source_gap_")
    || key.startsWith("stale_ref_");
}

function canonicalNumber(value: number): string {
  if (!Number.isFinite(value)) throw new Error("metric observation id requires a finite value");
  if (Object.is(value, -0)) return "0";
  return String(value);
}

function stableDimensions(dimensions: Readonly<Record<string, string>>): Array<[string, string]> {
  return Object.entries(dimensions)
    .filter(([key]) => !isNonSemanticDimension(key))
    .sort(([left], [right]) => left.localeCompare(right));
}

/**
 * Produces an idempotent id for one semantic metric revision.
 *
 * The previous adapters did not include the value in the identifier. A vendor
 * correction for the same observed_at therefore collided with the original row
 * and could never enter the append-only revision history. V2 includes the
 * normalized value, confidence, source time, sources, and semantic dimensions
 * while deliberately excluding ingested_at and operational run metadata: an
 * identical retry or backfill/live overlap remains idempotent, whereas a
 * materially revised observation receives a new id.
 */
export function buildMetricObservationId(args: {
  metricKey: string;
  subjectRef?: string;
  entityRef?: string;
  assetRef?: string;
  value: number;
  unit: string;
  sourceAt: string;
  observedAt: string;
  confidence: number;
  sourceRefs: readonly string[];
  methodologyVersion: string;
  dimensions?: Readonly<Record<string, string>>;
}): string {
  if (!Number.isFinite(args.confidence) || args.confidence < 0 || args.confidence > 1) {
    throw new Error("metric observation id requires confidence between 0 and 1");
  }
  const payload = JSON.stringify({
    version: OBSERVATION_ID_VERSION,
    metric_key: args.metricKey,
    subject_ref: args.subjectRef ?? null,
    entity_ref: args.entityRef ?? null,
    asset_ref: args.assetRef ?? null,
    value: canonicalNumber(args.value),
    unit: args.unit,
    source_at: args.sourceAt,
    observed_at: args.observedAt,
    confidence: canonicalNumber(args.confidence),
    source_refs: [...new Set(args.sourceRefs)].sort(),
    methodology_version: args.methodologyVersion,
    dimensions: stableDimensions(args.dimensions ?? {}),
  });
  return `metric:${createHash("sha256").update(payload, "utf8").digest("hex")}`;
}

export { OBSERVATION_ID_VERSION };
