import type { EthValueCaptureSnapshot } from "../eth_value_capture/types.js";
import type { HandlerContext } from "../server.js";
import { handleEthValueCapture } from "../server.js";
import { metricObservationsFromEthValueCapture } from "./eth_value_capture_adapter.js";
import type { MetricObservationStore } from "./store.js";

export interface EthCollectionRunResult {
  collector_id: "eth-value-capture:30d";
  fetched_at: string;
  snapshot_as_of: string;
  emitted_observation_ids: string[];
  skipped_duplicate_ids: string[];
  gaps: string[];
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
  const emitted: string[] = [];
  const skipped: string[] = [];

  for (const observation of observations) {
    if (existingIds.has(observation.id)) {
      skipped.push(observation.id);
      continue;
    }
    await args.store.append(observation);
    existingIds.add(observation.id);
    emitted.push(observation.id);
  }

  return {
    collector_id: "eth-value-capture:30d",
    fetched_at: ingestedAt.toISOString(),
    snapshot_as_of: snapshot.as_of,
    emitted_observation_ids: emitted,
    skipped_duplicate_ids: skipped,
    gaps: snapshot.gaps.map((gap) => `${gap.code}:${gap.detail}`),
  };
}
