import { makeContext } from "../adapters/base.js";
import type { EnvConfig } from "../env.js";
import { runEthValueCaptureCollectionOnce } from "./collection_run.js";
import { JsonlMetricObservationStore } from "./store.js";

export async function runIntelligenceCollectCli(env: EnvConfig): Promise<unknown> {
  const ctx = makeContext({ env });
  const store = new JsonlMetricObservationStore(env.intelligenceHistoryPath);
  const result = await runEthValueCaptureCollectionOnce({
    handlerContext: { env, ctx },
    store,
  });
  return {
    mode: "intelligence-collect",
    path: env.intelligenceHistoryPath,
    ...result,
  };
}
