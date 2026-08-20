import { createHash } from "node:crypto";
import { z } from "zod";
import { IsoTimestampSchema, MetricObservationSchema, type MetricObservation } from "./types.js";
import type { MetricObservationStore } from "./store.js";

const OptionalRangeSchema = z.object({
  start: IsoTimestampSchema.nullable(),
  end: IsoTimestampSchema.nullable(),
}).strict().superRefine((value, ctx) => {
  if (value.start !== null && value.end !== null && Date.parse(value.start) > Date.parse(value.end)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["end"], message: "range end must be at or after start" });
  }
});

export const BackfillManifestSchema = z.object({
  run_id: z.string().min(1).max(200),
  source: z.string().min(1).max(160),
  collector_version: z.string().min(1).max(120),
  requested_range: OptionalRangeSchema,
  actual_range: OptionalRangeSchema,
  started_at: IsoTimestampSchema,
  completed_at: IsoTimestampSchema,
  record_count: z.number().int().min(0),
  source_refs: z.array(z.string().min(1).max(240)).max(64),
  methodology_versions: z.array(z.string().min(1).max(120)).max(64),
  fingerprint_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  gaps: z.array(z.string().min(1).max(240)).max(128),
}).strict().superRefine((value, ctx) => {
  if (Date.parse(value.completed_at) < Date.parse(value.started_at)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["completed_at"], message: "completed_at must be at or after started_at" });
  }
});
export type BackfillManifest = z.infer<typeof BackfillManifestSchema>;

export const ForwardCollectionResultSchema = z.object({
  collector_id: z.string().min(1).max(160),
  collector_version: z.string().min(1).max(120),
  source_family: z.string().min(1).max(120),
  started_at: IsoTimestampSchema,
  completed_at: IsoTimestampSchema,
  cutoff_at: IsoTimestampSchema,
  emitted_observation_ids: z.array(z.string().min(1).max(200)).max(10000),
  gaps: z.array(z.string().min(1).max(240)).max(128),
}).strict().superRefine((value, ctx) => {
  const started = Date.parse(value.started_at);
  const completed = Date.parse(value.completed_at);
  const cutoff = Date.parse(value.cutoff_at);
  if (completed < started) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["completed_at"], message: "completed_at must be at or after started_at" });
  }
  if (cutoff > completed) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["cutoff_at"], message: "cutoff_at must not be after completed_at" });
  }
});
export type ForwardCollectionResult = z.infer<typeof ForwardCollectionResultSchema>;

export interface ForwardCollector {
  id: string;
  version: string;
  sourceFamily: string;
  collect(cutoffAt: string): Promise<{ observations: MetricObservation[]; gaps?: string[] }>;
}

export async function runForwardCollection(args: {
  collector: ForwardCollector;
  store: MetricObservationStore;
  cutoffAt: string;
  now?: () => Date;
}): Promise<ForwardCollectionResult> {
  IsoTimestampSchema.parse(args.cutoffAt);
  const now = args.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const payload = await args.collector.collect(args.cutoffAt);
  const observations = payload.observations.map((item) => MetricObservationSchema.parse(item));
  for (const observation of observations) {
    if (Date.parse(observation.observed_at) > Date.parse(args.cutoffAt)) {
      throw new Error(`observation exceeds collection cutoff: ${observation.id}`);
    }
    await args.store.append(observation);
  }
  const completedAt = now().toISOString();
  return ForwardCollectionResultSchema.parse({
    collector_id: args.collector.id,
    collector_version: args.collector.version,
    source_family: args.collector.sourceFamily,
    started_at: startedAt,
    completed_at: completedAt,
    cutoff_at: args.cutoffAt,
    emitted_observation_ids: observations.map((item) => item.id),
    gaps: payload.gaps ?? [],
  });
}

export function buildBackfillManifest(args: {
  runId: string;
  source: string;
  collectorVersion: string;
  requestedStart: string | null;
  requestedEnd: string | null;
  startedAt: string;
  completedAt: string;
  observations: MetricObservation[];
  gaps?: string[];
}): BackfillManifest {
  const observations = args.observations.map((item) => MetricObservationSchema.parse(item));
  const sorted = [...observations].sort((a, b) => a.observed_at.localeCompare(b.observed_at) || a.id.localeCompare(b.id));
  const fingerprint = createHash("sha256").update(sorted.map((item) => JSON.stringify(item)).join("\n"), "utf8").digest("hex");
  return BackfillManifestSchema.parse({
    run_id: args.runId,
    source: args.source,
    collector_version: args.collectorVersion,
    requested_range: { start: args.requestedStart, end: args.requestedEnd },
    actual_range: {
      start: sorted[0]?.observed_at ?? null,
      end: sorted.at(-1)?.observed_at ?? null,
    },
    started_at: args.startedAt,
    completed_at: args.completedAt,
    record_count: sorted.length,
    source_refs: [...new Set(sorted.flatMap((item) => item.source_refs))].sort(),
    methodology_versions: [...new Set(sorted.map((item) => item.methodology_version))].sort(),
    fingerprint_sha256: fingerprint,
    gaps: args.gaps ?? [],
  });
}

export async function exportPointInTime(args: {
  store: MetricObservationStore;
  cutoffAt: string;
  metricKeys?: string[];
  subjectRef?: string;
}): Promise<MetricObservation[]> {
  IsoTimestampSchema.parse(args.cutoffAt);
  const observations = await args.store.readAll();
  const metricKeys = args.metricKeys === undefined ? null : new Set(args.metricKeys);
  return observations
    .filter((item) => Date.parse(item.observed_at) <= Date.parse(args.cutoffAt))
    .filter((item) => metricKeys === null || metricKeys.has(item.metric_key))
    .filter((item) => args.subjectRef === undefined || item.subject_ref === args.subjectRef)
    .sort((a, b) => a.observed_at.localeCompare(b.observed_at) || a.metric_key.localeCompare(b.metric_key) || a.id.localeCompare(b.id));
}

export interface DataQualitySummary {
  record_count: number;
  metric_count: number;
  first_observed_at: string | null;
  last_observed_at: string | null;
  stale_record_count: number;
  methodology_versions: string[];
}

export function summarizeDataQuality(observations: MetricObservation[], asOf: string, staleAfterMs: number): DataQualitySummary {
  IsoTimestampSchema.parse(asOf);
  if (!Number.isFinite(staleAfterMs) || staleAfterMs < 0) throw new Error("staleAfterMs must be a non-negative finite number");
  const parsed = observations.map((item) => MetricObservationSchema.parse(item));
  const sorted = [...parsed].sort((a, b) => a.observed_at.localeCompare(b.observed_at));
  const asOfMs = Date.parse(asOf);
  return {
    record_count: sorted.length,
    metric_count: new Set(sorted.map((item) => item.metric_key)).size,
    first_observed_at: sorted[0]?.observed_at ?? null,
    last_observed_at: sorted.at(-1)?.observed_at ?? null,
    stale_record_count: sorted.filter((item) => asOfMs - Date.parse(item.observed_at) > staleAfterMs).length,
    methodology_versions: [...new Set(sorted.map((item) => item.methodology_version))].sort(),
  };
}
