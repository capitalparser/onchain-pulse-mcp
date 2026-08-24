import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { makeContext } from "../adapters/base.js";
import { fetchGrowThePieEcosystemCapture } from "../adapters/eth_ecosystem_growthepie.js";
import type { EnvConfig } from "../env.js";
import { buildEthEcosystemCapture } from "../eth_ecosystem_capture/metrics.js";
import type { EthWindow } from "../eth_value_capture/types.js";
import { metricObservationsFromEthEcosystemCapture } from "./eth_ecosystem_capture_adapter.js";
import { assessSourceForCommercialRedistribution } from "./source_license.js";
import type { MetricObservationStore } from "./store.js";
import type { MetricObservation } from "./types.js";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BACKFILL_CUTOFF_DAYS = 366;
const WINDOW_DAYS = { "7d": 7, "30d": 30, "90d": 90 } as const;

const GROWTHEPIE_BACKFILL_SOURCES = [
  { source_ref: "growthepie:master", url: "https://api.growthepie.com/v1/master.json" },
  { source_ref: "growthepie:fees_paid_usd", url: "https://api.growthepie.com/v1/export/fees.json" },
  { source_ref: "growthepie:rent_paid_usd", url: "https://api.growthepie.com/v1/export/rent_paid.json" },
  { source_ref: "growthepie:stables_mcap", url: "https://api.growthepie.com/v1/export/stables_mcap.json" },
] as const;

const SourcePayloadSchema = z.object({
  source_ref: z.string().min(1).max(160),
  url: z.string().url().max(500),
  status: z.enum(["captured", "http_error", "network_error", "not_requested"]),
  retrieved_at: z.string().datetime({ offset: true }).nullable(),
  http_status: z.number().int().min(100).max(599).nullable(),
  body_bytes: z.number().int().nonnegative().nullable(),
  body_sha256: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
}).strict();
export type BackfillSourcePayload = z.infer<typeof SourcePayloadSchema>;

const LicenseAssessmentSchema = z.object({
  source_ref: z.string().min(1).max(160),
  policy_status: z.string().min(1).max(80),
  attribution_required: z.boolean(),
  commercially_redistributable: z.boolean(),
  evidence_url: z.string().url().max(500).nullable(),
  reviewed_at: z.string().max(40).nullable(),
}).strict();

const GapSummarySchema = z.object({
  code: z.string().min(1).max(160),
  count: z.number().int().positive(),
  sample_cutoff_days: z.array(z.string().regex(DAY)).max(5),
}).strict();

const ManifestShape = {
  id: z.string().min(1).max(200),
  run_id: z.string().min(1).max(160),
  source_family: z.literal("growthepie-ecosystem"),
  collection_mode: z.literal("historical_backfill"),
  revision_basis: z.literal("latest_available_at_retrieval"),
  requested: z.object({
    start_cutoff_day: z.string().regex(DAY),
    end_cutoff_day: z.string().regex(DAY),
    window: z.enum(["7d", "30d", "90d"]),
    cutoff_day_count: z.number().int().positive().max(MAX_BACKFILL_CUTOFF_DAYS),
  }).strict(),
  actual: z.object({
    first_observed_at: z.string().datetime({ offset: true }).nullable(),
    last_observed_at: z.string().datetime({ offset: true }).nullable(),
  }).strict(),
  started_at: z.string().datetime({ offset: true }),
  completed_at: z.string().datetime({ offset: true }),
  ingestion_semantics: z.object({
    cutoff_enforced: z.literal(true),
    ingestion_timestamp_basis: z.literal("actual_backfill_run"),
    eligible_before_backfill_run: z.literal(false),
    historical_source_versions_available: z.literal(false),
  }).strict(),
  status: z.enum(["complete", "partial", "failed"]),
  coverage: z.object({
    complete_cutoff_days: z.number().int().nonnegative(),
    partial_cutoff_days: z.number().int().nonnegative(),
    unavailable_cutoff_days: z.number().int().nonnegative(),
    emitted_observation_days: z.number().int().nonnegative(),
  }).strict(),
  observation_count: z.number().int().nonnegative(),
  inserted_count: z.number().int().nonnegative(),
  skipped_duplicate_count: z.number().int().nonnegative(),
  observation_set_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  metric_keys: z.array(z.string().min(1).max(200)).max(32),
  source_refs: z.array(z.string().min(1).max(160)).max(32),
  source_payloads: z.array(SourcePayloadSchema).max(16),
  methodology_versions: z.array(z.string().min(1).max(120)).max(32),
  license: z.object({
    commercial_redistribution_allowed: z.boolean(),
    attribution_required: z.boolean(),
    assessments: z.array(LicenseAssessmentSchema).max(32),
  }).strict(),
  gaps: z.array(GapSummarySchema).max(128),
  methodology_version: z.literal("eth-ecosystem-backfill-manifest-v1"),
} as const;

function addManifestIssues(
  manifest: {
    started_at: string;
    completed_at: string;
    requested: { cutoff_day_count: number };
    coverage: {
      complete_cutoff_days: number;
      partial_cutoff_days: number;
      unavailable_cutoff_days: number;
    };
  },
  context: z.RefinementCtx,
): void {
  if (Date.parse(manifest.completed_at) < Date.parse(manifest.started_at)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["completed_at"], message: "must be at or after started_at" });
  }
  const covered = manifest.coverage.complete_cutoff_days
    + manifest.coverage.partial_cutoff_days
    + manifest.coverage.unavailable_cutoff_days;
  if (covered !== manifest.requested.cutoff_day_count) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["coverage"], message: "cutoff coverage must equal requested count" });
  }
}

const ManifestCoreSchema = z.object(ManifestShape).strict().superRefine(addManifestIssues);
export const EthEcosystemBackfillManifestSchema = z.object({
  ...ManifestShape,
  fingerprint_sha256: z.string().regex(/^[0-9a-f]{64}$/),
}).strict().superRefine(addManifestIssues);
export type EthEcosystemBackfillManifest = z.infer<typeof EthEcosystemBackfillManifestSchema>;

export interface EthEcosystemBackfillResult {
  status: "complete" | "partial" | "failed";
  manifest_path: string;
  manifest: EthEcosystemBackfillManifest;
  inserted_observation_ids: string[];
  skipped_duplicate_ids: string[];
}

interface CapturedResponse {
  body: Uint8Array;
  status: number;
  statusText: string;
  headers: Array<[string, string]>;
}

function canonicalDay(value: string, field: string): string {
  if (!DAY.test(value)) throw new Error(`${field} must be YYYY-MM-DD`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${field} must be a canonical UTC day`);
  }
  return value;
}

function shiftDay(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function enumerateCutoffDays(start: string, end: string): string[] {
  if (start > end) throw new Error("start cutoff day must be at or before end cutoff day");
  const days: string[] = [];
  for (let day = start; day <= end; day = shiftDay(day, 1)) {
    days.push(day);
    if (days.length > MAX_BACKFILL_CUTOFF_DAYS) {
      throw new Error(`backfill cannot exceed ${MAX_BACKFILL_CUTOFF_DAYS} cutoff days`);
    }
  }
  return days;
}

function sanitizeUrl(value: string): string {
  const url = new URL(value);
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(",")}}`;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function observationSetFingerprint(observations: readonly MetricObservation[]): string {
  return sha256(observations
    .map((item) => stableJson(item))
    .sort()
    .join("\n"));
}

function createCapturedMemoFetch(args: {
  baseFetch: typeof fetch;
  now: () => Date;
}): { fetch: typeof fetch; payloads: () => BackfillSourcePayload[] } {
  const sourceByUrl = new Map(GROWTHEPIE_BACKFILL_SOURCES.map((item) => [sanitizeUrl(item.url), item]));
  const requests = new Map<string, Promise<CapturedResponse>>();
  const records = new Map<string, BackfillSourcePayload>();

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    const canonicalUrl = sanitizeUrl(request.url);
    const source = sourceByUrl.get(canonicalUrl);
    if (request.method !== "GET" || source === undefined) return args.baseFetch(input, init);

    let pending = requests.get(canonicalUrl);
    if (pending === undefined) {
      pending = (async () => {
        const retrievedAt = args.now().toISOString();
        try {
          const response = await args.baseFetch(request);
          const body = new Uint8Array(await response.arrayBuffer());
          records.set(source.source_ref, SourcePayloadSchema.parse({
            source_ref: source.source_ref,
            url: canonicalUrl,
            status: response.ok ? "captured" : "http_error",
            retrieved_at: retrievedAt,
            http_status: response.status,
            body_bytes: body.byteLength,
            body_sha256: sha256(body),
          }));
          return {
            body,
            status: response.status,
            statusText: response.statusText,
            headers: [...response.headers.entries()],
          };
        } catch {
          records.set(source.source_ref, SourcePayloadSchema.parse({
            source_ref: source.source_ref,
            url: canonicalUrl,
            status: "network_error",
            retrieved_at: retrievedAt,
            http_status: null,
            body_bytes: null,
            body_sha256: null,
          }));
          throw new Error("backfill source request failed");
        }
      })();
      requests.set(canonicalUrl, pending);
    }
    const captured = await pending;
    return new Response(Buffer.from(captured.body), {
      status: captured.status,
      statusText: captured.statusText,
      headers: captured.headers,
    });
  }) as typeof fetch;

  return {
    fetch: fetchImpl,
    payloads: () => GROWTHEPIE_BACKFILL_SOURCES.map((source) => records.get(source.source_ref)
      ?? SourcePayloadSchema.parse({
        source_ref: source.source_ref,
        url: sanitizeUrl(source.url),
        status: "not_requested",
        retrieved_at: null,
        http_status: null,
        body_bytes: null,
        body_sha256: null,
      })),
  };
}

async function appendUniqueObservations(args: {
  store: MetricObservationStore;
  observations: MetricObservation[];
}): Promise<{ inserted: string[]; skipped: string[] }> {
  const existingIds = new Set((await args.store.readAll()).map((item) => item.id));
  const insertedRows: MetricObservation[] = [];
  const skipped: string[] = [];
  const seenBatch = new Set<string>();
  for (const observation of args.observations) {
    if (existingIds.has(observation.id) || seenBatch.has(observation.id)) {
      skipped.push(observation.id);
      continue;
    }
    seenBatch.add(observation.id);
    insertedRows.push(observation);
  }
  if (args.store.appendMany !== undefined) {
    await args.store.appendMany(insertedRows);
  } else {
    for (const observation of insertedRows) await args.store.append(observation);
  }
  return { inserted: insertedRows.map((item) => item.id), skipped };
}

function summarizeGaps(results: Array<{
  cutoffDay: string;
  gaps: Array<{ code: string }>;
}>): Array<{ code: string; count: number; sample_cutoff_days: string[] }> {
  const summaries = new Map<string, { count: number; samples: string[] }>();
  for (const result of results) {
    for (const gap of result.gaps) {
      const summary = summaries.get(gap.code) ?? { count: 0, samples: [] };
      summary.count += 1;
      if (summary.samples.length < 5 && !summary.samples.includes(result.cutoffDay)) {
        summary.samples.push(result.cutoffDay);
      }
      summaries.set(gap.code, summary);
    }
  }
  return [...summaries.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([code, summary]) => ({ code, count: summary.count, sample_cutoff_days: summary.samples }));
}

function safeManifestFile(runId: string): string {
  return `${runId.replace(/[^A-Za-z0-9._-]+/g, "-")}.json`;
}

export async function runGrowThePieEcosystemBackfill(args: {
  env: EnvConfig;
  store: MetricObservationStore;
  manifestDir: string;
  startCutoffDay: string;
  endCutoffDay: string;
  window: EthWindow;
  runId?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}): Promise<EthEcosystemBackfillResult> {
  const now = args.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const startCutoffDay = canonicalDay(args.startCutoffDay, "startCutoffDay");
  const endCutoffDay = canonicalDay(args.endCutoffDay, "endCutoffDay");
  if (endCutoffDay > startedAt.slice(0, 10)) throw new Error("endCutoffDay cannot be in the future");
  const cutoffDays = enumerateCutoffDays(startCutoffDay, endCutoffDay);
  const runId = args.runId ?? `growthepie-ecosystem-${startedAt.replace(/[^0-9]/g, "").slice(0, 14)}-${randomUUID()}`;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(runId)) {
    throw new Error("runId contains unsupported characters or is too long");
  }

  const captured = createCapturedMemoFetch({ baseFetch: args.fetchImpl ?? globalThis.fetch, now });
  const context = makeContext({ env: args.env, fetchImpl: captured.fetch });
  const snapshots: Array<{
    cutoffDay: string;
    status: "valid" | "partial" | "unavailable";
    snapshot: ReturnType<typeof buildEthEcosystemCapture>;
    gaps: Array<{ code: string }>;
  }> = [];

  for (const cutoffDay of cutoffDays) {
    const adapter = await fetchGrowThePieEcosystemCapture(
      { cutoffDay, windowDays: WINDOW_DAYS[args.window] },
      context,
    );
    snapshots.push({
      cutoffDay,
      status: adapter.status,
      snapshot: buildEthEcosystemCapture({
        window: args.window,
        lang: args.env.lang,
        adapter,
        now: new Date(startedAt),
      }),
      gaps: adapter.gaps,
    });
  }

  const ingestedAt = now();
  const observations = snapshots.flatMap((item) =>
    metricObservationsFromEthEcosystemCapture(item.snapshot, ingestedAt, {
      dimensions: {
        collection_mode: "historical_backfill",
        backfill_run_id: runId,
        revision_basis: "latest_available_at_retrieval",
        source_versioning: "unversioned_export_at_retrieval",
      },
    })
  );
  const persisted = await appendUniqueObservations({ store: args.store, observations });
  const completedAt = now().toISOString();
  const observedTimes = observations.map((item) => item.observed_at).sort();
  const metricKeys = [...new Set(observations.map((item) => item.metric_key))].sort();
  const sourceRefs = [...new Set(GROWTHEPIE_BACKFILL_SOURCES.map((item) => item.source_ref))].sort();
  const assessments = sourceRefs.map((sourceRef) => {
    const assessment = assessSourceForCommercialRedistribution(sourceRef);
    return LicenseAssessmentSchema.parse({
      source_ref: sourceRef,
      policy_status: assessment.policy?.status ?? "unknown",
      attribution_required: assessment.policy?.attributionRequired ?? false,
      commercially_redistributable: assessment.commerciallyRedistributable,
      evidence_url: assessment.policy?.evidenceUrl ?? null,
      reviewed_at: assessment.policy?.reviewedAt ?? null,
    });
  });
  const completeCutoffs = snapshots.filter((item) => item.status === "valid").length;
  const partialCutoffs = snapshots.filter((item) => item.status === "partial").length;
  const unavailableCutoffs = snapshots.filter((item) => item.status === "unavailable").length;
  const status = completeCutoffs === cutoffDays.length
    ? "complete"
    : observations.length > 0
      ? "partial"
      : "failed";

  const core = ManifestCoreSchema.parse({
    id: `backfill:${runId}`,
    run_id: runId,
    source_family: "growthepie-ecosystem",
    collection_mode: "historical_backfill",
    revision_basis: "latest_available_at_retrieval",
    requested: {
      start_cutoff_day: startCutoffDay,
      end_cutoff_day: endCutoffDay,
      window: args.window,
      cutoff_day_count: cutoffDays.length,
    },
    actual: {
      first_observed_at: observedTimes[0] ?? null,
      last_observed_at: observedTimes.at(-1) ?? null,
    },
    started_at: startedAt,
    completed_at: completedAt,
    ingestion_semantics: {
      cutoff_enforced: true,
      ingestion_timestamp_basis: "actual_backfill_run",
      eligible_before_backfill_run: false,
      historical_source_versions_available: false,
    },
    status,
    coverage: {
      complete_cutoff_days: completeCutoffs,
      partial_cutoff_days: partialCutoffs,
      unavailable_cutoff_days: unavailableCutoffs,
      emitted_observation_days: new Set(observations.map((item) => item.observed_at.slice(0, 10))).size,
    },
    observation_count: observations.length,
    inserted_count: persisted.inserted.length,
    skipped_duplicate_count: persisted.skipped.length,
    observation_set_sha256: observationSetFingerprint(observations),
    metric_keys: metricKeys,
    source_refs: sourceRefs,
    source_payloads: captured.payloads(),
    methodology_versions: [...new Set(observations.map((item) => item.methodology_version))].sort(),
    license: {
      commercial_redistribution_allowed: assessments.every((item) => item.commercially_redistributable),
      attribution_required: assessments.some((item) => item.attribution_required),
      assessments,
    },
    gaps: summarizeGaps(snapshots),
    methodology_version: "eth-ecosystem-backfill-manifest-v1",
  });
  const manifest = EthEcosystemBackfillManifestSchema.parse({
    ...core,
    fingerprint_sha256: sha256(stableJson(core)),
  });

  await mkdir(args.manifestDir, { recursive: true });
  const manifestPath = join(args.manifestDir, safeManifestFile(runId));
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  return {
    status,
    manifest_path: manifestPath,
    manifest,
    inserted_observation_ids: persisted.inserted,
    skipped_duplicate_ids: persisted.skipped,
  };
}

export { GROWTHEPIE_BACKFILL_SOURCES, MAX_BACKFILL_CUTOFF_DAYS };
