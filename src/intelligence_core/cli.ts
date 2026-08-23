import { makeContext } from "../adapters/base.js";
import type { EnvConfig } from "../env.js";
import { runEthIntelligenceCollectionOnce } from "./collection_run.js";
import { JsonlMetricObservationStore } from "./store.js";

export async function runIntelligenceCollectCli(env: EnvConfig): Promise<unknown> {
  const path = env.intelligenceHistoryPath;
  if (!path) throw new Error("intelligenceHistoryPath is required for intelligence-collect");
  const ctx = makeContext({ env });
  const store = new JsonlMetricObservationStore(path);
  const result = await runEthIntelligenceCollectionOnce({
    handlerContext: { env, ctx },
    store,
  });
  return {
    mode: "intelligence-collect",
    path,
    ...result,
  };
}
