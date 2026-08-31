import { describe, expect, it } from "vitest";
import {
  buildIntelligenceResearchExport,
  verifyIntelligenceResearchExport,
} from "../../src/intelligence_core/research_export.js";
import {
  assessSourceForInternalResearch,
} from "../../src/intelligence_core/source_license.js";
import type { MetricObservation } from "../../src/intelligence_core/types.js";
import type { MetricObservationStore } from "../../src/intelligence_core/store.js";

class MemoryStore implements MetricObservationStore {
  constructor(readonly rows: MetricObservation[]) {}
  async append(): Promise<void> { throw new Error("not used"); }
  async readAll(): Promise<MetricObservation[]> { return [...this.rows]; }
  async query(): Promise<MetricObservation[]> { return [...this.rows]; }
}

function observation(overrides: Partial<MetricObservation> = {}): MetricObservation {
  return {
    id: "metric:eth:2026-08-30",
    metric_key: "eth.net_issuance_eth",
    subject_ref: "ethereum",
    asset_ref: "ETH",
    value: -10,
    unit: "ETH",
    source_at: "2026-08-30T00:00:00.000Z",
    observed_at: "2026-08-30T00:00:00.000Z",
    ingested_at: "2026-08-30T01:00:00.000Z",
    confidence: 0.9,
    source_refs: ["coinmetrics-community:SplyCur"],
    methodology_version: "eth-value-capture-v1",
    dimensions: { window: "30d" },
    ...overrides,
  };
}

const base = {
  sourceRepository: "capitalparser/onchain-pulse-mcp",
  sourceCommit: "a".repeat(40),
  generatedAt: "2026-08-31T01:00:00.000Z",
  cutoffAt: "2026-08-31T00:00:00.000Z",
};

describe("immutable intelligence research export", () => {
  it("binds PIT observations, registries, source identity, and checksums", async () => {
    const result = await buildIntelligenceResearchExport({
      ...base,
      store: new MemoryStore([observation()]),
      metricKeys: ["eth.net_issuance_eth"],
    });

    expect(result.observations.map((item) => item.id)).toEqual(["metric:eth:2026-08-30"]);
    expect(result.source_repository).toBe(base.sourceRepository);
    expect(result.source_commit).toBe(base.sourceCommit);
    expect(result.feature_registry.feature_definitions).toEqual([
      expect.objectContaining({
        metric_key: "eth.net_issuance_eth",
        methodology_version: "eth-value-capture-v1",
        historical_availability: "BACKFILL_SUPPORTED",
      }),
    ]);
    expect(result.source_license_registry.license_entries).toContainEqual(
      expect.objectContaining({
        source: "coinmetrics-community",
        internal_research_status: "ALLOWED",
        redistribution_status: "NOT_APPROVED",
      }),
    );
    expect(result.gaps).toEqual([]);
    expect(verifyIntelligenceResearchExport(result)).toBe(true);
  });

  it("excludes future observations and later ingestions at the cutoff", async () => {
    const result = await buildIntelligenceResearchExport({
      ...base,
      store: new MemoryStore([
        observation(),
        observation({ id: "future", observed_at: "2026-09-01T00:00:00.000Z", ingested_at: "2026-09-01T00:00:00.000Z" }),
        observation({ id: "late", ingested_at: "2026-09-01T00:00:00.000Z" }),
      ]),
      metricKeys: ["eth.net_issuance_eth"],
    });

    expect(result.observations.map((item) => item.id)).toEqual(["metric:eth:2026-08-30"]);
  });

  it("preserves empty history as an explicit non-evidence gap", async () => {
    const result = await buildIntelligenceResearchExport({
      ...base,
      store: new MemoryStore([]),
      metricKeys: ["eth.net_issuance_eth"],
    });

    expect(result.observations).toEqual([]);
    expect(result.gaps).toEqual(["no_observations_at_cutoff"]);
    expect(result.data_quality_summary.record_count).toBe(0);
    expect(verifyIntelligenceResearchExport(result)).toBe(true);
  });

  it("detects a resealed-content mutation", async () => {
    const result = await buildIntelligenceResearchExport({
      ...base,
      store: new MemoryStore([observation()]),
      metricKeys: ["eth.net_issuance_eth"],
    });
    result.observations[0]!.value = 999;

    expect(verifyIntelligenceResearchExport(result)).toBe(false);
  });

  it("rejects unknown metric keys before exporting", async () => {
    await expect(buildIntelligenceResearchExport({
      ...base,
      store: new MemoryStore([]),
      metricKeys: ["eth.unknown"],
    })).rejects.toThrow(/unknown feature key/);
  });
});

describe("internal research source admission", () => {
  it("keeps internal use separate from commercial redistribution", () => {
    expect(assessSourceForInternalResearch("coinmetrics-community:SplyCur")).toMatchObject({
      admitted: true,
      status: "ALLOWED",
    });
    expect(assessSourceForInternalResearch("dune:eth-value")).toMatchObject({
      admitted: false,
      status: "RESTRICTED",
    });
    expect(assessSourceForInternalResearch("unknown-source:metric")).toMatchObject({
      admitted: false,
      status: "UNKNOWN",
    });
  });
});
