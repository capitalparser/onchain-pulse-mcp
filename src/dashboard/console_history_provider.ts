import type {
  EthFrontendHistoryMetricKey,
  EthFrontendHistoryQuery,
} from "../frontend_contract/eth_history.js";
import type { MetricObservationStore } from "../intelligence_core/store.js";
import type { MetricObservation } from "../intelligence_core/types.js";

export type ConsoleHistoryProvider = (
  query: EthFrontendHistoryQuery,
) => Promise<MetricObservation[]>;

const MAX_HISTORY_CANDIDATES = 20_000;

export function createConsoleHistoryProvider(
  store: MetricObservationStore,
): ConsoleHistoryProvider {
  return async (query) => {
    const metricKeys = new Set(query.metric_keys);
    const startMs = Date.parse(query.start_at);
    const cutoffMs = Date.parse(query.cutoff_at);
    const rows = (await store.readAll()).filter((observation) =>
      observation.subject_ref === "ethereum"
      && metricKeys.has(observation.metric_key as EthFrontendHistoryMetricKey)
      && Date.parse(observation.observed_at) >= startMs
      && Date.parse(observation.observed_at) <= cutoffMs
      && Date.parse(observation.ingested_at) <= cutoffMs
      && observation.dimensions.window === query.window
    );
    if (rows.length > MAX_HISTORY_CANDIDATES) {
      throw new Error("history candidate limit exceeded");
    }
    return rows;
  };
}
