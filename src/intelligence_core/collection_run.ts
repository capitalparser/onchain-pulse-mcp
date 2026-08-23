import type { EthEcosystemCaptureSnapshot } from "../eth_ecosystem_capture/types.js";
import type { EthValueCaptureSnapshot } from "../eth_value_capture/types.js";
import type { HandlerContext } from "../server.js";
import { handleEthEcosystemCapture, handleEthValueCapture } from "../server.js";
import { metricObservationsFromEthEcosystemCapture } from "./eth_ecosystem_capture_adapter.js";
import { metricObservationsFromEthValueCapture } from "./eth_value_capture_adapter.js";
import type { MetricObservationStore } from "./store.js";
import type { MetricObservation } from "./types.js";

export interface EthCollectionRunResult {
  collector_id: "eth-value-capture:30d";
  fetched_at: string;
  snapshot_as_of: string;
  emitted_observation_ids: string[];
  skipped_duplicate_ids: string[];
  gaps: string[];
}

export interface EthIntelligenceSourceCollectionResult {
  status: "collected" | "failed";
  snapshot_as_of: string | null;
  emitted_observation_count: number;
  skipped_duplicate_count: number;
  gaps: string[];
}

export interface EthIntelligenceCollectionRunResult {
  collector_id: "eth-intelligence:30d";
  status: "complete" | "partial" | "failed";
  fetched_at: string;
  sources: {
    value_capture: EthIntelligenceSourceCollectionResult;
    ecosystem_capture: EthIntelligenceSourceCollectionResult;
  };
  emitted_observation_ids: string[];
  skipped_duplicate_ids: string[];
  gaps: string[];
}

async function appendUniqueObservations(args: {
  store: MetricObservationStore;
  observations: MetricObservation[];
  existingIds: Set<string>;
}): Promise<{ emitted: string[]; skipped: string[] }> {
  const emitted: string[] = [];
  const skipped: string[] = [];
  for (const observation of args.observations) {
    if (args.existingIds.has(observation.id)) {
      skipped.push(observation.id);
      continue;
    }
    await args.store.append(observation);
    args.existingIds.add(observation.id);
    emitted.push(observation.id);
  }
  return { emitted, skipped };
}

export async function runEthValueCaptureCollectionOnce(args: {
  handlerContext: HandlerContext;
  store: MetricObservationStore;
  now?: () => Date;
  fetchSnapshot?: () => Promise<EthValueCaptureSnapshot>;
}): Promise<EthCollectionRunResult> {
  const now = args.now ?? (() => new Date());
  const fetchSnapshot = args.fetchSnapshot ?? (() => handleEthValueCapture(
    { window: "30d", paid_mode: "free_only", include_rollups: false },
    args.handlerContext,
  ));
  const snapshot = await fetchSnapshot();
  const ingestedAt = now();
  const observations = metricObservationsFromEthValueCapture(snapshot, ingestedAt);
  const existingIds = new Set((await args.store.readAll()).map((item) => item.id));
  const persisted = await appendUniqueObservations({
    store: args.store,
    observations,
    existingIds,
  });

  return {
    collector_id: "eth-value-capture:30d",
    fetched_at: ingestedAt.toISOString(),
    snapshot_as_of: snapshot.as_of,
    emitted_observation_ids: persisted.emitted,
    skipped_duplicate_ids: persisted.skipped,
    gaps: snapshot.gaps.map((gap) => `${gap.code}:${gap.detail}`),
  };
}

export async function runEthIntelligenceCollectionOnce(args: {
  handlerContext: HandlerContext;
  store: MetricObservationStore;
  now?: () => Date;
  fetchValueCaptureSnapshot?: () => Promise<EthValueCaptureSnapshot>;
  fetchEcosystemCaptureSnapshot?: () => Promise<EthEcosystemCaptureSnapshot>;
}): Promise<EthIntelligenceCollectionRunResult> {
  const now = args.now ?? (() => new Date());
  const fetchValueCaptureSnapshot = args.fetchValueCaptureSnapshot ?? (() => handleEthValueCapture(
    { window: "30d", paid_mode: "free_only", include_rollups: false },
    args.handlerContext,
  ));
  const fetchEcosystemCaptureSnapshot = args.fetchEcosystemCaptureSnapshot ?? (() => handleEthEcosystemCapture(
    { window: "30d" },
    args.handlerContext,
  ));
  const [valueCaptureResult, ecosystemCaptureResult] = await Promise.allSettled([
    fetchValueCaptureSnapshot(),
    fetchEcosystemCaptureSnapshot(),
  ]);
  const ingestedAt = now();
  const existingIds = new Set((await args.store.readAll()).map((item) => item.id));
  const emittedObservationIds: string[] = [];
  const skippedDuplicateIds: string[] = [];
  const gaps: string[] = [];

  const valueCapture: EthIntelligenceSourceCollectionResult = await (async () => {
    if (valueCaptureResult.status === "rejected") {
      const sourceGap = "value_capture:collection_failed";
      gaps.push(sourceGap);
      return {
        status: "failed",
        snapshot_as_of: null,
        emitted_observation_count: 0,
        skipped_duplicate_count: 0,
        gaps: [sourceGap],
      };
    }
    try {
      const observations = metricObservationsFromEthValueCapture(valueCaptureResult.value, ingestedAt);
      const persisted = await appendUniqueObservations({ store: args.store, observations, existingIds });
      emittedObservationIds.push(...persisted.emitted);
      skippedDuplicateIds.push(...persisted.skipped);
      const sourceGaps = valueCaptureResult.value.gaps.map((gap) =>
        `value_capture:${gap.code}:${gap.detail}`
      );
      gaps.push(...sourceGaps);
      return {
        status: "collected",
        snapshot_as_of: valueCaptureResult.value.as_of,
        emitted_observation_count: persisted.emitted.length,
        skipped_duplicate_count: persisted.skipped.length,
        gaps: sourceGaps,
      };
    } catch {
      const sourceGap = "value_capture:normalization_failed";
      gaps.push(sourceGap);
      return {
        status: "failed",
        snapshot_as_of: valueCaptureResult.value.as_of,
        emitted_observation_count: 0,
        skipped_duplicate_count: 0,
        gaps: [sourceGap],
      };
    }
  })();

  const ecosystemCapture: EthIntelligenceSourceCollectionResult = await (async () => {
    if (ecosystemCaptureResult.status === "rejected") {
      const sourceGap = "ecosystem_capture:collection_failed";
      gaps.push(sourceGap);
      return {
        status: "failed",
        snapshot_as_of: null,
        emitted_observation_count: 0,
        skipped_duplicate_count: 0,
        gaps: [sourceGap],
      };
    }
    try {
      const observations = metricObservationsFromEthEcosystemCapture(ecosystemCaptureResult.value, ingestedAt);
      const persisted = await appendUniqueObservations({ store: args.store, observations, existingIds });
      emittedObservationIds.push(...persisted.emitted);
      skippedDuplicateIds.push(...persisted.skipped);
      const sourceGaps = ecosystemCaptureResult.value.gaps.map((gap) =>
        `ecosystem_capture:${gap.code}:${gap.detail}`
      );
      gaps.push(...sourceGaps);
      return {
        status: "collected",
        snapshot_as_of: ecosystemCaptureResult.value.as_of,
        emitted_observation_count: persisted.emitted.length,
        skipped_duplicate_count: persisted.skipped.length,
        gaps: sourceGaps,
      };
    } catch {
      const sourceGap = "ecosystem_capture:normalization_failed";
      gaps.push(sourceGap);
      return {
        status: "failed",
        snapshot_as_of: ecosystemCaptureResult.value.as_of,
        emitted_observation_count: 0,
        skipped_duplicate_count: 0,
        gaps: [sourceGap],
      };
    }
  })();

  const collectedCount = [valueCapture, ecosystemCapture]
    .filter((result) => result.status === "collected").length;
  return {
    collector_id: "eth-intelligence:30d",
    status: collectedCount === 2 ? "complete" : collectedCount === 1 ? "partial" : "failed",
    fetched_at: ingestedAt.toISOString(),
    sources: {
      value_capture: valueCapture,
      ecosystem_capture: ecosystemCapture,
    },
    emitted_observation_ids: emittedObservationIds,
    skipped_duplicate_ids: skippedDuplicateIds,
    gaps,
  };
}
