import { describe, expect, it } from "vitest";
import {
  buildEthFrontendHistory,
  parseEthFrontendHistorySearchParams,
  type EthFrontendHistoryQuery,
} from "../../src/frontend_contract/eth_history.js";
import type { MetricObservation } from "../../src/intelligence_core/types.js";

const NOW = new Date("2026-09-02T00:00:00.000Z");

function query(overrides: Partial<EthFrontendHistoryQuery> = {}): EthFrontendHistoryQuery {
  return {
    metric_keys: ["eth.total_burn_eth"],
    range: "30d",
    window: "30d",
    start_at: "2026-08-03T00:00:00.000Z",
    cutoff_at: "2026-09-01T23:59:59.999Z",
    ...overrides,
  };
}

function row(overrides: Partial<MetricObservation> = {}): MetricObservation {
  return {
    id: "metric:a",
    metric_key: "eth.total_burn_eth",
    subject_ref: "ethereum",
    asset_ref: "ETH",
    value: 1,
    unit: "ETH",
    source_at: "2026-08-31T10:00:00.000Z",
    observed_at: "2026-08-31T15:30:00.000Z",
    ingested_at: "2026-08-31T18:00:00.000Z",
    confidence: 0.9,
    source_refs: ["growthepie:rent_paid_eth"],
    methodology_version: "eth-value-capture-v1",
    dimensions: { window: "30d" },
    ...overrides,
  };
}

function build(rows: MetricObservation[], requested = query()) {
  return buildEthFrontendHistory({ query: requested, observations: rows, generatedAt: NOW });
}

function equivalentRow(overrides: Partial<MetricObservation> = {}): MetricObservation {
  return row({
    id: "metric:b",
    source_at: "2026-08-31T19:00:00+09:00",
    observed_at: "2026-09-01T00:30:00+09:00",
    ingested_at: "2026-08-31T14:00:00-04:00",
    ...overrides,
  });
}

describe("ETH history UTC time contract", () => {
  it("buckets positive and negative offsets by UTC day while retaining the original strings", () => {
    const rows = [equivalentRow(), row({
      id: "metric:next-day",
      observed_at: "2026-08-31T20:30:00-04:00",
      ingested_at: "2026-09-01T01:00:00.000Z",
      value: 2,
    })];
    const history = build(rows);
    const series = history.series[0]!;
    expect(series.points.map((point) => point.value)).toEqual([1, 2]);
    expect(series.points.map((point) => point.observed_at)).toEqual(rows.map((item) => item.observed_at));
    expect(series.coverage.observed_day_count).toBe(2);
    expect(series.coverage.missing_day_count).toBe(28);
    expect(series.coverage.missing_date_samples).not.toContain("2026-08-31");
    expect(series.coverage.missing_date_samples).not.toContain("2026-09-01");
  });

  it("selects latest observed time by epoch rather than local wall-clock text", () => {
    const history = build([
      row({ id: "metric:old", observed_at: "2026-08-31T20:00:00+09:00" }),
      row({ id: "metric:new", observed_at: "2026-08-31T16:00:00Z", value: 2 }),
    ]);
    expect(history.series[0]!.points.map((point) => point.value)).toEqual([2]);
    expect(history.data_quality.discarded_revision_count).toBe(1);
  });

  it("selects latest ingestion for the same observed instant expressed with different offsets", () => {
    const history = build([
      equivalentRow({ ingested_at: "2026-09-01T02:00:00+09:00", value: 1 }),
      row({ ingested_at: "2026-08-31T18:00:00Z", value: 2 }),
    ]);
    expect(history.series[0]!.points.map((point) => point.value)).toEqual([2]);
    expect(history.series[0]!.points[0]!.revision_count).toBe(2);
    expect(history.data_quality.ambiguous_revision_count).toBe(0);
  });

  it("omits conflicting equally-latest instants across offset representations", () => {
    const history = build([row(), equivalentRow({ value: 2 })]);
    expect(history.status).toBe("unavailable");
    expect(history.series[0]!.points).toEqual([]);
    expect(history.data_quality.discarded_revision_count).toBe(2);
    expect(history.data_quality.ambiguous_revision_count).toBe(1);
  });

  it("does not invent a provenance conflict from equivalent source/observed/ingested timestamps", () => {
    const rows = [row(), equivalentRow()];
    const before = JSON.stringify(rows);
    for (const item of rows) {
      Object.freeze(item.dimensions);
      Object.freeze(item.source_refs);
      Object.freeze(item);
    }
    const forward = build(rows);
    const reversed = build([...rows].reverse());
    expect(forward).toEqual(reversed);
    expect(forward.series[0]!.points).toHaveLength(1);
    expect(forward.series[0]!.points[0]!.observed_at).toBe(rows[0]!.observed_at);
    expect(forward.data_quality.ambiguous_revision_count).toBe(0);
    expect(forward.data_quality.discarded_revision_count).toBe(1);
    expect(JSON.stringify(rows)).toBe(before);
  });

  it("still treats genuinely different source instants as a provenance conflict", () => {
    const history = build([row(), equivalentRow({ source_at: "2026-08-31T11:00:00Z" })]);
    expect(history.series[0]!.points).toEqual([]);
    expect(history.data_quality.ambiguous_revision_count).toBe(1);
  });

  it("finds the latest ingestion across series by epoch", () => {
    const history = build([
      row({ ingested_at: "2026-09-01T08:00:00+09:00" }), // August 31, 23:00Z
      row({ id: "metric:issuance", metric_key: "eth.net_issuance_eth", ingested_at: "2026-09-01T01:00:00Z" }),
    ], query({ metric_keys: ["eth.total_burn_eth", "eth.net_issuance_eth"] }));
    expect(history.data_quality.latest_ingested_at).toBe("2026-09-01T01:00:00Z");
  });

  it("uses UTC days for direct typed-query boundaries, without rewriting the returned boundaries", () => {
    const requested = query({
      start_at: "2026-08-03T09:00:00+09:00",
      cutoff_at: "2026-09-02T08:59:59.999+09:00",
    });
    const history = build([equivalentRow()], requested);
    expect(history.start_at).toBe(requested.start_at);
    expect(history.cutoff_at).toBe(requested.cutoff_at);
    expect(history.data_quality.expected_day_count).toBe(30);
    expect(history.series[0]!.coverage.missing_day_count).toBe(29);
  });

  it("keeps the ingestion cutoff strict even when an offset date prefix looks earlier", () => {
    const history = build([row({ ingested_at: "2026-09-01T20:00:00-04:00" })]);
    expect(history.status).toBe("unavailable");
    expect(history.data_quality.selected_point_count).toBe(0);
    expect(history.data_quality.discarded_revision_count).toBe(0);
  });

  it("retains leap-day coverage across a local midnight", () => {
    const generatedAt = new Date("2024-03-01T02:00:00Z");
    const requested = parseEthFrontendHistorySearchParams(new URLSearchParams({
      range: "30d", metrics: "eth.total_burn_eth", cutoff: generatedAt.toISOString(),
    }), generatedAt);
    const history = buildEthFrontendHistory({ query: requested, generatedAt, observations: [row({
      source_at: "2024-02-29T22:00:00Z",
      observed_at: "2024-03-01T00:30:00+01:00",
      ingested_at: "2024-03-01T00:00:00Z",
    })] });
    expect(history.series[0]!.coverage.missing_date_samples).not.toContain("2024-02-29");
    expect(history.series[0]!.coverage.missing_date_samples).toContain("2024-03-01");
  });

  it("preserves zero, unit-rejection counts, and methodology segments", () => {
    const history = build([
      equivalentRow({ value: 0 }),
      row({ id: "metric:next", observed_at: "2026-08-31T20:30:00-04:00", ingested_at: "2026-09-01T01:00:00Z", methodology_version: "eth-value-capture-v2" }),
    ]);
    expect(history.series[0]!.points.map((point) => point.value)).toEqual([0, 1]);
    expect(history.series[0]!.methodology_segments.map((segment) => segment.methodology_version))
      .toEqual(["eth-value-capture-v1", "eth-value-capture-v2"]);
    const mismatch = build([equivalentRow({ unit: "USD" })]);
    expect(mismatch.data_quality.selected_point_count).toBe(0);
    expect(mismatch.data_quality.discarded_revision_count).toBe(1);
  });
});
