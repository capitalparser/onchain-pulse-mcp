import { describe, expect, it } from "vitest";
import { buildBackfillManifest, exportPointInTime, runForwardCollection, summarizeDataQuality } from "../../src/intelligence_core/history.js";
import type { MetricObservation } from "../../src/intelligence_core/types.js";
import type { MetricObservationStore } from "../../src/intelligence_core/store.js";

class MemoryStore implements MetricObservationStore {
  rows: MetricObservation[] = [];
  async append(observation: MetricObservation): Promise<void> {
    if (this.rows.some((item) => item.id === observation.id)) throw new Error(`duplicate metric observation id: ${observation.id}`);
    this.rows.push(observation);
  }
  async readAll(): Promise<MetricObservation[]> { return [...this.rows]; }
  async query(): Promise<MetricObservation[]> { return [...this.rows]; }
}

function obs(id: string, observedAt: string, overrides: Partial<MetricObservation> = {}): MetricObservation {
  return {
    id,
    metric_key: "eth.net_issuance_eth",
    subject_ref: "ethereum",
    asset_ref: "ETH",
    value: -1,
    unit: "ETH",
    source_at: observedAt,
    observed_at: observedAt,
    ingested_at: observedAt,
    confidence: 1,
    source_refs: ["source-a"],
    methodology_version: "v1",
    dimensions: {},
    ...overrides,
  };
}

describe("P1 history contracts", () => {
  it("rejects observations that exceed a forward collection cutoff", async () => {
    const store = new MemoryStore();
    await expect(runForwardCollection({
      store,
      cutoffAt: "2026-08-20T00:00:00.000Z",
      now: () => new Date("2026-08-20T00:01:00.000Z"),
      collector: {
        id: "collector",
        version: "v1",
        sourceFamily: "eth",
        async collect() { return { observations: [obs("future", "2026-08-20T00:00:01.000Z")] }; },
      },
    })).rejects.toThrow(/exceeds collection cutoff/);
    expect(store.rows).toHaveLength(0);
  });

  it("persists valid observations and reports explicit gaps", async () => {
    const store = new MemoryStore();
    const result = await runForwardCollection({
      store,
      cutoffAt: "2026-08-20T00:00:00.000Z",
      now: () => new Date("2026-08-20T00:01:00.000Z"),
      collector: {
        id: "collector",
        version: "v1",
        sourceFamily: "eth",
        async collect() { return { observations: [obs("a", "2026-08-19T23:59:00.000Z")], gaps: ["one source unavailable"] }; },
      },
    });
    expect(result.emitted_observation_ids).toEqual(["a"]);
    expect(result.gaps).toEqual(["one source unavailable"]);
    expect(store.rows).toHaveLength(1);
  });

  it("builds deterministic backfill fingerprints independent of input order", () => {
    const a = obs("a", "2026-08-01T00:00:00.000Z");
    const b = obs("b", "2026-08-02T00:00:00.000Z", { metric_key: "eth.total_burn_eth", methodology_version: "v2", source_refs: ["source-b"] });
    const base = {
      runId: "run-1",
      source: "test",
      collectorVersion: "v1",
      requestedStart: "2026-08-01T00:00:00.000Z",
      requestedEnd: "2026-08-02T00:00:00.000Z",
      startedAt: "2026-08-03T00:00:00.000Z",
      completedAt: "2026-08-03T00:01:00.000Z",
    };
    const first = buildBackfillManifest({ ...base, observations: [a, b] });
    const second = buildBackfillManifest({ ...base, observations: [b, a] });
    expect(first.fingerprint_sha256).toBe(second.fingerprint_sha256);
    expect(first.actual_range).toEqual({ start: a.observed_at, end: b.observed_at });
    expect(first.methodology_versions).toEqual(["v1", "v2"]);
  });

  it("exports only observations known by the research cutoff", async () => {
    const store = new MemoryStore();
    store.rows = [
      obs("old", "2026-08-01T00:00:00.000Z"),
      obs("revision", "2026-08-10T00:00:00.000Z", { source_at: "2026-08-01T00:00:00.000Z", value: 2 }),
    ];
    const result = await exportPointInTime({ store, cutoffAt: "2026-08-05T00:00:00.000Z" });
    expect(result.map((item) => item.id)).toEqual(["old"]);
  });

  it("returns deterministic filtered exports", async () => {
    const store = new MemoryStore();
    store.rows = [
      obs("b", "2026-08-02T00:00:00.000Z", { metric_key: "eth.total_burn_eth" }),
      obs("a", "2026-08-02T00:00:00.000Z"),
      obs("c", "2026-08-03T00:00:00.000Z", { subject_ref: "bitcoin" }),
    ];
    const result = await exportPointInTime({
      store,
      cutoffAt: "2026-08-03T00:00:00.000Z",
      metricKeys: ["eth.net_issuance_eth", "eth.total_burn_eth"],
      subjectRef: "ethereum",
    });
    expect(result.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("summarizes freshness and methodology versions without filling missing values", () => {
    const result = summarizeDataQuality([
      obs("a", "2026-08-01T00:00:00.000Z"),
      obs("b", "2026-08-10T00:00:00.000Z", { metric_key: "eth.total_burn_eth", methodology_version: "v2" }),
    ], "2026-08-11T00:00:00.000Z", 2 * 24 * 60 * 60 * 1000);
    expect(result).toMatchObject({ record_count: 2, metric_count: 2, stale_record_count: 1, methodology_versions: ["v1", "v2"] });
  });
});
