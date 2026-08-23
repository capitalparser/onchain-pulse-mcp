import type {
  EthFrontendHistoryQuery,
} from "../frontend_contract/eth_history.js";
import type { MetricObservationStore } from "../intelligence_core/store.js";
import type { MetricObservation } from "../intelligence_core/types.js";

export type ConsoleHistoryProvider = (
  query: EthFrontendHistoryQuery,
) => Promise<MetricObservation[]>;

export function createConsoleHistoryProvider(
  store: MetricObservationStore,
): ConsoleHistoryProvider {
  return async (query) => {
    const rows = await Promise.all(query.metric_keys.map((metricKey) => store.query({
      metricKey,
      subjectRef: "ethereum",
      startObservedAt: query.start_at,
      endObservedAt: query.cutoff_at,
    })));
    return rows.flat();
  };
}
