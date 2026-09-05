import { describe, expect, it, vi } from "vitest";
import { buildBackfillManifest, exportPointInTime, runForwardCollection, summarizeDataQuality } from "../../src/intelligence_core/history.js";
import type { MetricObservationStore } from "../../src/intelligence_core/store.js";
import type { MetricObservation } from "../../src/intelligence_core/types.js";

const cutoff = "2026-08-20T00:00:00.000Z";
function row(id: string, at = cutoff): MetricObservation {
  return {
    id, metric_key: "eth.total_burn_eth", subject_ref: "ethereum", value: 1, unit: "ETH",
    source_at: at, observed_at: at, ingested_at: at, confidence: 1,
    source_refs: ["test:source"], methodology_version: "test-v1", dimensions: {},
  };
}
function memoryStore() {
  const rows: MetricObservation[] = [];
  const store = {
    append: vi.fn(async (item: MetricObservation) => { rows.push(item); }),
    readAll: vi.fn(async () => [...rows]),
    query: vi.fn(async () => [...rows]),
  } satisfies MetricObservationStore;
  return { rows, store };
}
function collect(store: MetricObservationStore, observations: MetricObservation[], gaps: string[] = []) {
  return runForwardCollection({
    store, cutoffAt: cutoff, now: () => new Date("2026-08-20T00:01:00.000Z"),
    collector: { id: "test", version: "v1", sourceFamily: "eth", collect: async () => ({ observations, gaps }) },
  });
}

describe("forward collection preflight", () => {
  it("writes nothing when a later row exceeds the cutoff", async () => {
    const { rows, store } = memoryStore();
    await expect(collect(store, [row("valid"), row("future", "2026-08-20T00:00:01.000Z")]))
      .rejects.toThrow(/exceeds collection cutoff/);
    expect(rows).toEqual([]);
    expect(store.append).not.toHaveBeenCalled();
  });

  it("rejects duplicate ids before calling even a permissive append-only adapter", async () => {
    const { rows, store } = memoryStore();
    await expect(collect(store, [row("duplicate"), row("duplicate")])).rejects.toThrow(/duplicate/);
    expect(rows).toEqual([]);
  });

  it("validates result metadata and count bounds before writes", async () => {
    const { rows, store } = memoryStore();
    await expect(collect(store, [row("valid")], [""])).rejects.toThrow();
    await expect(collect(store, Array.from({ length: 10001 }, (_, i) => row(String(i))))).rejects.toThrow();
    expect(rows).toEqual([]);
    expect(store.append).not.toHaveBeenCalled();
  });

  it("rejects a future cutoff before writes, not after appending valid rows", async () => {
    const { rows, store } = memoryStore();
    await expect(runForwardCollection({
      store, cutoffAt: "2026-08-21T00:00:00.000Z", now: () => new Date(cutoff),
      collector: { id: "test", version: "v1", sourceFamily: "eth", collect: async () => ({ observations: [row("valid")] }) },
    })).rejects.toThrow(/cutoff_at must not be after completed_at/);
    expect(rows).toEqual([]);
  });

  it("uses one batch append and records completion after persistence", async () => {
    const { store } = memoryStore();
    let persisted = false;
    const appendMany = vi.fn(async (_items: readonly MetricObservation[]) => { persisted = true; });
    const completed = "2026-08-20T00:02:00.000Z";
    const result = await runForwardCollection({
      store: { ...store, appendMany }, cutoffAt: cutoff,
      now: () => new Date(persisted ? completed : cutoff),
      collector: { id: "test", version: "v1", sourceFamily: "eth", collect: async () => ({ observations: [row("a"), row("b")] }) },
    });
    expect(appendMany).toHaveBeenCalledTimes(1);
    expect(appendMany).toHaveBeenCalledWith([row("a"), row("b")]);
    expect(store.append).not.toHaveBeenCalled();
    expect(result.completed_at).toBe(completed);
    expect(result.emitted_observation_ids).toEqual(["a", "b"]);
  });

  it("preserves the append-only compatibility path and empty collection behavior", async () => {
    const { rows, store } = memoryStore();
    expect((await collect(store, [row("a"), row("b")])).emitted_observation_ids).toEqual(["a", "b"]);
    expect(rows).toHaveLength(2);
    const appendMany = vi.fn(async (_items: readonly MetricObservation[]) => {});
    expect((await collect({ ...store, appendMany }, [])).emitted_observation_ids).toEqual([]);
    expect(appendMany).not.toHaveBeenCalled();
  });
});

describe("history ordering across supported ISO offsets", () => {
  const early = row("early", "2026-08-20T00:00:00+09:00"); // Aug 19, 15:00 UTC
  const late = row("late", "2026-08-19T20:00:00Z");

  it("builds a chronological manifest range and order-independent fingerprint", () => {
    const base = {
      runId: "test", source: "test", collectorVersion: "v1", requestedStart: null, requestedEnd: null,
      startedAt: cutoff, completedAt: cutoff,
    };
    const first = buildBackfillManifest({ ...base, observations: [late, early] });
    const second = buildBackfillManifest({ ...base, observations: [early, late] });
    expect(first.actual_range).toEqual({ start: early.observed_at, end: late.observed_at });
    expect(first.fingerprint_sha256).toBe(second.fingerprint_sha256);
  });

  it("orders exports by instants, including the ingestion tie-breaker", async () => {
    const { store, rows } = memoryStore();
    rows.push(late, early);
    expect((await exportPointInTime({ store, cutoffAt: cutoff })).map((item) => item.id)).toEqual(["early", "late"]);
    rows.splice(0, rows.length,
      { ...early, id: "late-ingestion", ingested_at: late.ingested_at },
      { ...early, id: "early-ingestion" },
    );
    expect((await exportPointInTime({ store, cutoffAt: cutoff })).map((item) => item.id))
      .toEqual(["early-ingestion", "late-ingestion"]);
  });

  it("reports first and last observation by actual time without normalizing stored evidence", () => {
    const result = summarizeDataQuality([late, early], cutoff, 0);
    expect(result.first_observed_at).toBe(early.observed_at);
    expect(result.last_observed_at).toBe(late.observed_at);
    expect(result.stale_record_count).toBe(2);
  });
});
