import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { JsonlMetricObservationStore } from "../../src/intelligence_core/store.js";
import type { MetricObservation } from "../../src/intelligence_core/types.js";

const cleanup: string[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function row(id: string, value: number): MetricObservation {
  return {
    id,
    metric_key: "eth.total_burn_eth",
    subject_ref: "ethereum",
    asset_ref: "ETH",
    value,
    unit: "ETH",
    source_at: "2026-08-20T00:00:00.000Z",
    observed_at: "2026-08-21T00:00:00.000Z",
    ingested_at: "2026-08-23T00:00:00.000Z",
    confidence: 0.9,
    source_refs: ["test:source"],
    methodology_version: "test-v1",
    dimensions: { window: "30d" },
  };
}

describe("JsonlMetricObservationStore.appendMany", () => {
  it("persists a validated batch in one append operation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "opm-store-batch-"));
    cleanup.push(directory);
    const path = join(directory, "history.jsonl");
    const store = new JsonlMetricObservationStore(path);
    await store.appendMany([row("metric:a", 1), row("metric:b", 2)]);
    expect((await store.readAll()).map((item) => item.id)).toEqual(["metric:a", "metric:b"]);
    expect((await readFile(path, "utf8")).trim().split("\n")).toHaveLength(2);
  });

  it("rejects duplicates within a batch or against persisted history", async () => {
    const directory = await mkdtemp(join(tmpdir(), "opm-store-batch-"));
    cleanup.push(directory);
    const store = new JsonlMetricObservationStore(join(directory, "history.jsonl"));
    await expect(store.appendMany([row("metric:a", 1), row("metric:a", 1)]))
      .rejects.toThrow(/duplicate metric observation id in append batch/);
    await store.append(row("metric:a", 1));
    await expect(store.appendMany([row("metric:a", 1), row("metric:b", 2)]))
      .rejects.toThrow(/duplicate metric observation id: metric:a/);
  });
});
