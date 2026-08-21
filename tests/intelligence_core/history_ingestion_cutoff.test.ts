import { describe, expect, it } from "vitest";
import { exportPointInTime } from "../../src/intelligence_core/history.js";
import type { MetricObservationStore } from "../../src/intelligence_core/store.js";
import type { MetricObservation } from "../../src/intelligence_core/types.js";

class MemoryStore implements MetricObservationStore {
  constructor(private readonly rows: MetricObservation[]) {}
  async append(): Promise<void> { throw new Error("not used"); }
  async readAll(): Promise<MetricObservation[]> { return [...this.rows]; }
  async query(): Promise<MetricObservation[]> { return [...this.rows]; }
}

function observation(id: string, observedAt: string, ingestedAt: string, value: number): MetricObservation {
  return {
    id,
    metric_key: "eth.net_issuance_eth",
    subject_ref: "ethereum",
    asset_ref: "ETH",
    value,
    unit: "ETH",
    source_at: observedAt,
    observed_at: observedAt,
    ingested_at: ingestedAt,
    confidence: 1,
    source_refs: ["test-source"],
    methodology_version: "v1",
    dimensions: {},
  };
}

describe("point-in-time ingestion cutoff", () => {
  it("excludes a late-arriving observation even when its observed_at is before cutoff", async () => {
    const store = new MemoryStore([
      observation("known", "2026-08-01T00:00:00.000Z", "2026-08-01T00:01:00.000Z", 1),
      observation("late", "2026-08-02T00:00:00.000Z", "2026-08-10T00:00:00.000Z", 9),
    ]);

    const rows = await exportPointInTime({
      store,
      cutoffAt: "2026-08-05T00:00:00.000Z",
      subjectRef: "ethereum",
    });

    expect(rows.map((row) => row.id)).toEqual(["known"]);
  });
});
