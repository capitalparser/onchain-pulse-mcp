import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { JsonlMetricObservationStore } from "../../src/intelligence_core/store.js";
import { MetricObservationSchema, type MetricObservation } from "../../src/intelligence_core/types.js";

const tempDirs: string[] = [];

async function makeStore(): Promise<{ dir: string; path: string; store: JsonlMetricObservationStore }> {
  const dir = await mkdtemp(join(tmpdir(), "opm-intelligence-core-"));
  tempDirs.push(dir);
  const path = join(dir, "metrics", "observations.jsonl");
  return { dir, path, store: new JsonlMetricObservationStore(path) };
}

function observation(overrides: Partial<MetricObservation> = {}): MetricObservation {
  return {
    id: "obs-1",
    metric_key: "eth.net_issuance_eth",
    subject_ref: "ethereum",
    asset_ref: "ETH",
    value: -12.5,
    unit: "ETH",
    source_at: "2026-08-20T00:00:00.000Z",
    observed_at: "2026-08-20T00:05:00.000Z",
    ingested_at: "2026-08-20T00:06:00.000Z",
    confidence: 0.9,
    source_refs: ["coinmetrics-community:SplyCur"],
    methodology_version: "eth-value-capture-v1",
    dimensions: { window: "30d" },
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("MetricObservationSchema", () => {
  it("enforces source_at <= observed_at <= ingested_at", () => {
    expect(() => MetricObservationSchema.parse(observation({
      source_at: "2026-08-20T00:10:00.000Z",
      observed_at: "2026-08-20T00:05:00.000Z",
    }))).toThrow(/observed_at must be at or after source_at/);

    expect(() => MetricObservationSchema.parse(observation({
      observed_at: "2026-08-20T00:07:00.000Z",
      ingested_at: "2026-08-20T00:06:00.000Z",
    }))).toThrow(/ingested_at must be at or after observed_at/);
  });

  it("rejects unknown fields and invalid confidence", () => {
    expect(() => MetricObservationSchema.parse({ ...observation(), unexpected: true })).toThrow();
    expect(() => MetricObservationSchema.parse(observation({ confidence: 1.1 }))).toThrow();
  });
});

describe("JsonlMetricObservationStore", () => {
  it("appends, replays, and returns chronological observations", async () => {
    const { store } = await makeStore();
    await store.append(observation({ id: "late", observed_at: "2026-08-20T01:00:00.000Z", ingested_at: "2026-08-20T01:01:00.000Z" }));
    await store.append(observation({ id: "early", observed_at: "2026-08-20T00:30:00.000Z", ingested_at: "2026-08-20T00:31:00.000Z" }));

    const result = await store.readAll();
    expect(result.map((item) => item.id)).toEqual(["early", "late"]);
  });

  it("rejects duplicate ids against persisted observations", async () => {
    const { store } = await makeStore();
    await store.append(observation());
    await expect(store.append(observation({ value: 99 }))).rejects.toThrow(/duplicate metric observation id/);
  });

  it("filters by metric, subject, and inclusive observed-at window", async () => {
    const { store } = await makeStore();
    await store.append(observation({ id: "a", observed_at: "2026-08-20T00:10:00.000Z", ingested_at: "2026-08-20T00:11:00.000Z" }));
    await store.append(observation({ id: "b", metric_key: "eth.total_burn_eth", observed_at: "2026-08-20T00:20:00.000Z", ingested_at: "2026-08-20T00:21:00.000Z" }));
    await store.append(observation({ id: "c", subject_ref: "bitcoin", observed_at: "2026-08-20T00:30:00.000Z", ingested_at: "2026-08-20T00:31:00.000Z" }));

    const result = await store.query({
      metricKey: "eth.net_issuance_eth",
      subjectRef: "ethereum",
      startObservedAt: "2026-08-20T00:10:00.000Z",
      endObservedAt: "2026-08-20T00:25:00.000Z",
    });
    expect(result.map((item) => item.id)).toEqual(["a"]);
  });

  it("rejects malformed or duplicate persisted rows instead of silently skipping them", async () => {
    const { path, store } = await makeStore();
    await writeFile(path, `${JSON.stringify(observation())}\nnot-json\n`, { encoding: "utf8", flag: "w" }).catch(async (error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });

    // Parent directory may not exist before the first append. Create it through a valid append, then replace the file.
    if ((await store.readAll().catch(() => null)) === null) {
      const { dirname } = await import("node:path");
      const { mkdir } = await import("node:fs/promises");
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${JSON.stringify(observation())}\nnot-json\n`, "utf8");
    }
    await expect(store.readAll()).rejects.toThrow(/invalid JSONL at line 2/);
  });

  it("rejects inverted query windows", async () => {
    const { store } = await makeStore();
    await expect(store.query({
      startObservedAt: "2026-08-21T00:00:00.000Z",
      endObservedAt: "2026-08-20T00:00:00.000Z",
    })).rejects.toThrow(/startObservedAt must be at or before endObservedAt/);
  });
});
