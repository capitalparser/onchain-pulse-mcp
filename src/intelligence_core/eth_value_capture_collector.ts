import type { EthValueCaptureSnapshot } from "../eth_value_capture/types.js";
import type { HandlerContext } from "../server.js";
import { handleEthValueCapture } from "../server.js";
import { metricObservationsFromEthValueCapture } from "./eth_value_capture_adapter.js";
import type { ForwardCollector } from "./history.js";

export function createEthValueCaptureCollector(args: {
  handlerContext: HandlerContext;
  window?: "7d" | "30d" | "90d";
  paidMode?: "free_only" | "byok_allowed";
  includeRollups?: boolean;
  now?: () => Date;
  fetchSnapshot?: () => Promise<EthValueCaptureSnapshot>;
}): ForwardCollector {
  const window = args.window ?? "30d";
  const paidMode = args.paidMode ?? "free_only";
  const includeRollups = args.includeRollups ?? false;
  const now = args.now ?? (() => new Date());
  const fetchSnapshot = args.fetchSnapshot ?? (() => handleEthValueCapture(
    { window, paid_mode: paidMode, include_rollups: includeRollups },
    args.handlerContext,
  ));

  return {
    id: `eth-value-capture:${window}`,
    version: "v1",
    sourceFamily: "eth-value-capture",
    async collect(cutoffAt: string) {
      const snapshot = await fetchSnapshot();
      const ingestedAt = now();
      const observations = metricObservationsFromEthValueCapture(snapshot, ingestedAt)
        .filter((item) => Date.parse(item.observed_at) <= Date.parse(cutoffAt))
        .filter((item) => Date.parse(item.ingested_at) <= Date.parse(cutoffAt));
      const gaps = snapshot.gaps.map((gap) => `${gap.code}:${gap.detail}`);
      if (observations.length === 0 && snapshot.sources.length > 0) {
        gaps.push("eth-value-capture:no-observations-at-cutoff");
      }
      return { observations, gaps };
    },
  };
}
