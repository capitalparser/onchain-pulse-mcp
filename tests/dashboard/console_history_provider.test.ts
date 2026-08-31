import { describe, expect, it } from "vitest";
import { createConsoleHistoryProvider } from "../../src/dashboard/console_history_provider.js";
import type { EthFrontendHistoryQuery } from "../../src/frontend_contract/eth_history.js";
import type { MetricObservationStore } from "../../src/intelligence_core/store.js";
import type { MetricObservation } from "../../src/intelligence_core/types.js";

function query(): EthFrontendHistoryQuery {
  return {
    metric_keys: ["eth.total_burn_eth"],
    range: "30d",
    window: "30d",
    start_at: "2026-07-25T00:00:00.000Z",
    cutoff_at: "2026-08-23T23:59:59.999Z",
  };
}

function row(index: number, overrides: Partial<MetricObservation> = {}): MetricObservation {
  return {
    id: `metric:${index}`,
    metric_key: "eth.total_burn_eth",
    subject_ref: "ethereum",
    value: index,
    unit: "ETH",
    source_at: "2026-08-20T00:00:00.000Z",
    observed_at: "2026-08-21T00:00:00.000Z",
    ingested_at: "2026-08-21T00:01:00.000Z",
    confidence: 0.9,
    source_refs: ["coinmetrics-community:FeeTotNtv"],
    methodology_version: "eth-value-capture-v1",
    dimensions: { window: "30d" },
    ...overrides,
  };
}

class MemoryStore implements MetricObservationStore {
  readCount = 0;
  constructor(private readonly rows: MetricObservation[]) {}
  async append(): Promise<void> {}
  async readAll(): Promise<MetricObservation[]> {
    this.readCount += 1;
    return [...this.rows];
  }
  async query(): Promise<MetricObservation[]> {
    throw new Error("provider must not re-read JSONL once per metric");
  }
}

describe("console history provider", () => {
  it("reads the backing store once and applies bounded prefiltering", async () => {
    const store = new MemoryStore([
      row(1),
      row(2, { metric_key: "eth.net_issuance_eth" }),
      row(3, { subject_ref: "other" }),
      row(4, { observed_at: "2026-07-01T00:00:00.000Z" }),
    ]);
    const provider = createConsoleHistoryProvider(store);
    const rows = await provider(query());
    expect(store.readCount).toBe(1);
    expect(rows.map((item) => item.id)).toEqual(["metric:1"]);
  });

  it("rejects an excessive revision candidate set", async () => {
    const store = new MemoryStore(Array.from({ length: 20_001 }, (_, index) => row(index)));
    const provider = createConsoleHistoryProvider(store);
    await expect(provider(query())).rejects.toThrow(/candidate limit exceeded/);
  });

  it("applies ingestion cutoff and window eligibility before the candidate limit", async () => {
    const lateIngested = Array.from({ length: 10_000 }, (_, index) => row(index + 1, {
      ingested_at: "2026-08-24T00:00:00.000Z",
    }));
    const wrongWindow = Array.from({ length: 10_000 }, (_, index) => row(index + 10_001, {
      dimensions: { window: "90d" },
    }));
    const eligible = row(20_001);
    const store = new MemoryStore([...lateIngested, ...wrongWindow, eligible]);
    const provider = createConsoleHistoryProvider(store);

    await expect(provider(query())).resolves.toEqual([eligible]);
    expect(store.readCount).toBe(1);
  });
});
