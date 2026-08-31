import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { runIntelligenceExportCli } from "../../src/intelligence_core/cli.js";
import type { EnvConfig } from "../../src/env.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function fixture(): Promise<{ root: string; env: EnvConfig; output: string }> {
  const root = await mkdtemp(join(tmpdir(), "opm-research-export-"));
  roots.push(root);
  const history = join(root, "history.jsonl");
  const output = join(root, "export.json");
  await writeFile(history, `${JSON.stringify({
    id: "metric:one",
    metric_key: "eth.net_issuance_eth",
    subject_ref: "ethereum",
    asset_ref: "ETH",
    value: -1,
    unit: "ETH",
    source_at: "2026-08-30T00:00:00.000Z",
    observed_at: "2026-08-30T00:00:00.000Z",
    ingested_at: "2026-08-30T01:00:00.000Z",
    confidence: 1,
    source_refs: ["coinmetrics-community:SplyCur"],
    methodology_version: "eth-value-capture-v1",
    dimensions: { window: "30d" },
  })}\n`, "utf8");
  return {
    root,
    output,
    env: { byok: {}, lang: "en", historyPath: join(root, "pulse.json"), intelligenceHistoryPath: history },
  };
}

describe("intelligence export CLI", () => {
  it("writes a sealed offline export from the configured canonical store", async () => {
    const { env, output } = await fixture();
    const result = await runIntelligenceExportCli(env, [
      "--output", output,
      "--cutoff-at", "2026-08-31T00:00:00.000Z",
      "--source-commit", "a".repeat(40),
      "--metric-key", "eth.net_issuance_eth",
    ], () => new Date("2026-08-31T01:00:00.000Z"));

    const payload = JSON.parse(await readFile(output, "utf8"));
    expect(result).toMatchObject({ mode: "intelligence-export", record_count: 1, gaps: [] });
    expect(payload.export_checksum).toBe(result.export_checksum);
    expect(payload.observations).toHaveLength(1);
  });

  it("refuses to overwrite an evidence artifact", async () => {
    const { env, output } = await fixture();
    await writeFile(output, "already sealed", "utf8");

    await expect(runIntelligenceExportCli(env, [
      "--output", output,
      "--cutoff-at", "2026-08-31T00:00:00.000Z",
      "--source-commit", "a".repeat(40),
      "--metric-key", "eth.net_issuance_eth",
    ])).rejects.toThrow(/already exists/);
  });
});
