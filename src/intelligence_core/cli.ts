import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { makeContext } from "../adapters/base.js";
import type { EnvConfig } from "../env.js";
import { runEthValueCaptureCollectionOnce } from "./collection_run.js";
import { buildIntelligenceResearchExport } from "./research_export.js";
import { JsonlMetricObservationStore } from "./store.js";

export async function runIntelligenceCollectCli(env: EnvConfig): Promise<unknown> {
  const path = env.intelligenceHistoryPath;
  if (!path) throw new Error("intelligenceHistoryPath is required for intelligence-collect");
  const ctx = makeContext({ env });
  const store = new JsonlMetricObservationStore(path);
  const result = await runEthValueCaptureCollectionOnce({
    handlerContext: { env, ctx },
    store,
  });
  return {
    mode: "intelligence-collect",
    path,
    ...result,
  };
}

export async function runIntelligenceExportCli(
  env: EnvConfig,
  args: string[],
  now: () => Date = () => new Date(),
): Promise<{
  mode: "intelligence-export";
  output: string;
  source_commit: string;
  cutoff_at: string;
  record_count: number;
  gaps: string[];
  export_checksum: string;
}> {
  const parsed = parseExportArgs(args);
  const path = env.intelligenceHistoryPath;
  if (!path) throw new Error("intelligenceHistoryPath is required for intelligence-export");
  const exported = await buildIntelligenceResearchExport({
    store: new JsonlMetricObservationStore(path),
    sourceRepository: "capitalparser/onchain-pulse-mcp",
    sourceCommit: parsed.sourceCommit,
    generatedAt: now().toISOString(),
    cutoffAt: parsed.cutoffAt,
    metricKeys: parsed.metricKeys,
  });
  await mkdir(dirname(parsed.output), { recursive: true });
  try {
    await writeFile(parsed.output, `${JSON.stringify(exported, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`research evidence output already exists: ${parsed.output}`);
    }
    throw error;
  }
  return {
    mode: "intelligence-export",
    output: parsed.output,
    source_commit: exported.source_commit,
    cutoff_at: exported.cutoff_at,
    record_count: exported.data_quality_summary.record_count,
    gaps: exported.gaps,
    export_checksum: exported.export_checksum,
  };
}

function parseExportArgs(args: string[]): {
  output: string;
  cutoffAt: string;
  sourceCommit: string;
  metricKeys: string[];
} {
  let output: string | undefined;
  let cutoffAt: string | undefined;
  let sourceCommit: string | undefined;
  const metricKeys: string[] = [];
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (value === undefined) throw new Error(`missing value for ${flag}`);
    if (flag === "--output") output = value;
    else if (flag === "--cutoff-at") cutoffAt = value;
    else if (flag === "--source-commit") sourceCommit = value;
    else if (flag === "--metric-key") metricKeys.push(value);
    else throw new Error(`unknown intelligence-export argument: ${flag}`);
  }
  if (!output) throw new Error("--output is required");
  if (!cutoffAt) throw new Error("--cutoff-at is required");
  if (!sourceCommit) throw new Error("--source-commit is required");
  if (metricKeys.length === 0) throw new Error("at least one --metric-key is required");
  return { output, cutoffAt, sourceCommit, metricKeys };
}
