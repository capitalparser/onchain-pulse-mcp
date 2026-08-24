import { dirname, join } from "node:path";
import type { EnvConfig } from "../env.js";
import { runGrowThePieEcosystemBackfill } from "./backfill.js";
import { JsonlMetricObservationStore } from "./store.js";

export interface IntelligenceBackfillCliArgs {
  startCutoffDay: string;
  endCutoffDay: string;
  window: "7d" | "30d" | "90d";
  manifestDir?: string;
  runId?: string;
}

export function parseIntelligenceBackfillCliArgs(argv: readonly string[]): IntelligenceBackfillCliArgs {
  let startCutoffDay: string | undefined;
  let endCutoffDay: string | undefined;
  let window: IntelligenceBackfillCliArgs["window"] = "30d";
  let manifestDir: string | undefined;
  let runId: string | undefined;
  const seen = new Set<string>();

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === undefined) break;
    if (!["--start", "--end", "--window", "--manifest-dir", "--run-id"].includes(flag)) {
      throw new Error(`unknown intelligence-backfill argument: ${flag}`);
    }
    if (seen.has(flag)) throw new Error(`duplicate intelligence-backfill argument: ${flag}`);
    seen.add(flag);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`${flag} requires a value`);
    }
    index += 1;
    if (flag === "--start") startCutoffDay = value;
    if (flag === "--end") endCutoffDay = value;
    if (flag === "--manifest-dir") manifestDir = value;
    if (flag === "--run-id") runId = value;
    if (flag === "--window") {
      if (value !== "7d" && value !== "30d" && value !== "90d") {
        throw new Error("--window must be 7d, 30d, or 90d");
      }
      window = value;
    }
  }
  if (startCutoffDay === undefined) throw new Error("--start is required");
  if (endCutoffDay === undefined) throw new Error("--end is required");
  return {
    startCutoffDay,
    endCutoffDay,
    window,
    ...(manifestDir === undefined ? {} : { manifestDir }),
    ...(runId === undefined ? {} : { runId }),
  };
}

export async function runIntelligenceBackfillCli(
  env: EnvConfig,
  argv: readonly string[],
): Promise<unknown> {
  const historyPath = env.intelligenceHistoryPath;
  if (!historyPath) throw new Error("intelligenceHistoryPath is required for intelligence-backfill");
  const parsed = parseIntelligenceBackfillCliArgs(argv);
  const manifestDir = parsed.manifestDir ?? join(dirname(historyPath), "backfills");
  const result = await runGrowThePieEcosystemBackfill({
    env,
    store: new JsonlMetricObservationStore(historyPath),
    manifestDir,
    startCutoffDay: parsed.startCutoffDay,
    endCutoffDay: parsed.endCutoffDay,
    window: parsed.window,
    ...(parsed.runId === undefined ? {} : { runId: parsed.runId }),
  });
  return {
    mode: "intelligence-backfill",
    source_family: "growthepie-ecosystem",
    history_path: historyPath,
    status: result.status,
    manifest_path: result.manifest_path,
    inserted_observation_count: result.inserted_observation_ids.length,
    skipped_duplicate_count: result.skipped_duplicate_ids.length,
    manifest_fingerprint_sha256: result.manifest.fingerprint_sha256,
  };
}
