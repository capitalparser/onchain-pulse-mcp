import { createHash } from "node:crypto";
import { z } from "zod";
import { listFeatureDefinitions } from "./feature_registry.js";
import { exportPointInTime, summarizeDataQuality } from "./history.js";
import {
  SOURCE_LICENSE_POLICIES,
  assessSourceForInternalResearch,
  type SourceCommercialStatus,
} from "./source_license.js";
import type { MetricObservationStore } from "./store.js";
import { IsoTimestampSchema, MetricObservationSchema, type MetricObservation } from "./types.js";

const CommitSchema = z.string().regex(/^[0-9a-f]{40}$/);

export interface ResearchFeatureDefinition {
  metric_key: string;
  methodology_version: string;
  cadence: "block" | "hourly" | "daily" | "weekly" | "event";
  staleness_seconds: number;
  historical_availability: "BACKFILL_SUPPORTED" | "SOURCE_DEPENDENT" | "FORWARD_ONLY" | "UNVERIFIABLE";
}

export interface ResearchLicenseEntry {
  source: string;
  internal_research_status: "ALLOWED" | "RESTRICTED" | "UNKNOWN";
  redistribution_status: "APPROVED" | "NOT_APPROVED" | "CONTRACT_REQUIRED" | "REVIEW_REQUIRED" | "BLOCKED";
  attribution_required: boolean;
  unresolved_commercial_review: boolean;
}

export interface IntelligenceResearchSourceExport {
  schema_version: "onchain-intelligence-research-export-v1";
  source_repository: string;
  source_commit: string;
  generated_at: string;
  cutoff_at: string;
  feature_registry: {
    schema_version: "intelligence-feature-registry-v1";
    source_repository: string;
    source_commit: string;
    feature_definitions: ResearchFeatureDefinition[];
    registry_checksum: string;
  };
  source_license_registry: {
    schema_version: "source-license-registry-v1";
    source_repository: string;
    source_commit: string;
    license_entries: ResearchLicenseEntry[];
    registry_checksum: string;
  };
  observations: MetricObservation[];
  data_quality_summary: {
    record_count: number;
    metric_count: number;
    first_observed_at: string | null;
    last_observed_at: string | null;
    methodology_versions: string[];
  };
  gaps: string[];
  export_checksum: string;
}

export async function buildIntelligenceResearchExport(args: {
  store: MetricObservationStore;
  sourceRepository: string;
  sourceCommit: string;
  generatedAt: string;
  cutoffAt: string;
  metricKeys: string[];
}): Promise<IntelligenceResearchSourceExport> {
  const generatedAt = IsoTimestampSchema.parse(args.generatedAt);
  const cutoffAt = IsoTimestampSchema.parse(args.cutoffAt);
  if (Date.parse(generatedAt) < Date.parse(cutoffAt)) {
    throw new Error("generatedAt must be at or after cutoffAt");
  }
  if (!args.sourceRepository.trim()) throw new Error("sourceRepository must not be empty");
  const sourceCommit = CommitSchema.parse(args.sourceCommit);
  const metricKeys = [...new Set(args.metricKeys)].sort();
  if (metricKeys.length === 0) throw new Error("at least one metric key is required");

  const canonicalFeatures = new Map(listFeatureDefinitions().map((item) => [item.key, item]));
  const featureDefinitions = metricKeys.map((key): ResearchFeatureDefinition => {
    const feature = canonicalFeatures.get(key);
    if (feature === undefined) throw new Error(`unknown feature key: ${key}`);
    return {
      metric_key: feature.key,
      methodology_version: feature.methodology_version,
      cadence: feature.cadence,
      staleness_seconds: feature.staleness_seconds,
      historical_availability: !feature.point_in_time_safe
        ? "UNVERIFIABLE"
        : feature.backfill === "supported"
          ? "BACKFILL_SUPPORTED"
          : feature.backfill === "forward_only"
            ? "FORWARD_ONLY"
            : "SOURCE_DEPENDENT",
    };
  });
  const featureRegistry = sealRegistry({
    schema_version: "intelligence-feature-registry-v1" as const,
    source_repository: args.sourceRepository,
    source_commit: sourceCommit,
    feature_definitions: featureDefinitions,
  });
  const licenseEntries = SOURCE_LICENSE_POLICIES
    .map((policy): ResearchLicenseEntry => ({
      source: policy.sourcePrefix,
      internal_research_status: assessSourceForInternalResearch(policy.sourcePrefix).status,
      redistribution_status: redistributionStatus(policy.status),
      attribution_required: policy.attributionRequired,
      unresolved_commercial_review: policy.status !== "commercial_redistribution_ok" && policy.status !== "blocked",
    }))
    .sort((left, right) => left.source.localeCompare(right.source));
  const sourceLicenseRegistry = sealRegistry({
    schema_version: "source-license-registry-v1" as const,
    source_repository: args.sourceRepository,
    source_commit: sourceCommit,
    license_entries: licenseEntries,
  });
  const observations = (await exportPointInTime({
    store: args.store,
    cutoffAt,
    metricKeys,
  })).map((item) => MetricObservationSchema.parse(item));
  const dataQuality = summarizeDataQuality(observations, cutoffAt, 0);
  const unsigned = {
    schema_version: "onchain-intelligence-research-export-v1" as const,
    source_repository: args.sourceRepository,
    source_commit: sourceCommit,
    generated_at: generatedAt,
    cutoff_at: cutoffAt,
    feature_registry: featureRegistry,
    source_license_registry: sourceLicenseRegistry,
    observations,
    data_quality_summary: {
      record_count: dataQuality.record_count,
      metric_count: dataQuality.metric_count,
      first_observed_at: dataQuality.first_observed_at,
      last_observed_at: dataQuality.last_observed_at,
      methodology_versions: dataQuality.methodology_versions,
    },
    gaps: observations.length === 0 ? ["no_observations_at_cutoff"] : [],
  };
  return { ...unsigned, export_checksum: canonicalChecksum(unsigned) };
}

export function verifyIntelligenceResearchExport(exported: IntelligenceResearchSourceExport): boolean {
  const { export_checksum: exportChecksum, ...unsigned } = exported;
  const feature = exported.feature_registry;
  const { registry_checksum: featureChecksum, ...unsignedFeature } = feature;
  const license = exported.source_license_registry;
  const { registry_checksum: licenseChecksum, ...unsignedLicense } = license;
  return exportChecksum === canonicalChecksum(unsigned)
    && featureChecksum === canonicalChecksum(unsignedFeature)
    && licenseChecksum === canonicalChecksum(unsignedLicense);
}

function sealRegistry<T extends object>(payload: T): T & { registry_checksum: string } {
  return { ...payload, registry_checksum: canonicalChecksum(payload) };
}

function redistributionStatus(status: SourceCommercialStatus): ResearchLicenseEntry["redistribution_status"] {
  if (status === "commercial_redistribution_ok") return "APPROVED";
  if (status === "commercial_contract_required") return "CONTRACT_REQUIRED";
  if (status === "commercial_review_required" || status === "attribution_required") return "REVIEW_REQUIRED";
  if (status === "blocked") return "BLOCKED";
  return "NOT_APPROVED";
}

function canonicalChecksum(payload: unknown): string {
  return createHash("sha256").update(canonicalJson(payload), "utf8").digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("canonical JSON does not support non-finite numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  throw new Error("unsupported canonical JSON value");
}
