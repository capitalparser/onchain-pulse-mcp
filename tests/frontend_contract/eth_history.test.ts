import { describe, expect, it } from "vitest";
import {
  buildEthFrontendHistory,
  parseEthFrontendHistorySearchParams,
  type EthFrontendHistoryQuery,
} from "../../src/frontend_contract/eth_history.js";
import type { MetricObservation } from "../../src/intelligence_core/types.js";

function observation(overrides: Partial<MetricObservation> = {}): MetricObservation {
  return {
    id: "metric:test",
    metric_key: "eth.l2_settlement_cost_share",
    subject_ref: "ethereum",
    asset_ref: "ETH",
    value: 0.12,
    unit: "ratio",
    source_at: "2026-08-21T23:00:00.000Z",
    observed_at: "2026-08-21T23:59:00.000Z",
    ingested_at: "2026-08-22T00:05:00.000Z",
    confidence: 0.9,
    source_refs: ["growthepie:rent_paid_usd"],
    methodology_version: "eth-ecosystem-capture-v1",
    dimensions: { window: "30d" },
    ...overrides,
  };
}

function query(metricKeys: EthFrontendHistoryQuery["metric_keys"] = ["eth.l2_settlement_cost_share"]): EthFrontendHistoryQuery {
  return {
    metric_keys: metricKeys,
    range: "30d",
    window: "30d",
    start_at: "2026-07-25T00:00:00.000Z",
    cutoff_at: "2026-08-23T23:59:59.999Z",
  };
}

describe("ETH frontend history query", () => {
  it("applies bounded defaults and rejects unsupported or future input", () => {
    const now = new Date("2026-08-24T00:00:00.000Z");
    const parsed = parseEthFrontendHistorySearchParams(new URLSearchParams(), now);
    expect(parsed.range).toBe("90d");
    expect(parsed.window).toBe("30d");
    expect(parsed.metric_keys).toHaveLength(6);
    expect(parsed.cutoff_at).toBe(now.toISOString());

    expect(() => parseEthFrontendHistorySearchParams(
      new URLSearchParams("unknown=true"),
      now,
    )).toThrow(/unsupported query parameters/);
    expect(() => parseEthFrontendHistorySearchParams(
      new URLSearchParams("cutoff=2026-08-25T00:00:00.000Z"),
      now,
    )).toThrow(/must not be in the future/);
    expect(() => parseEthFrontendHistorySearchParams(
      new URLSearchParams("metrics=eth.not_allowed"),
      now,
    )).toThrow(/history query is invalid/);
    expect(() => parseEthFrontendHistorySearchParams(
      new URLSearchParams("metrics=eth.total_burn_eth,eth.total_burn_eth"),
      now,
    )).toThrow(/history query is invalid/);
  });

  it("selects the latest revision known by the cutoff without leaking later ingestion", () => {
    const rows = [
      observation({ id: "metric:initial", value: 0.1 }),
      observation({
        id: "metric:revision",
        value: 0.11,
        ingested_at: "2026-08-23T12:00:00.000Z",
      }),
      observation({
        id: "metric:late-revision",
        value: 0.2,
        ingested_at: "2026-08-24T00:00:00.000Z",
      }),
      observation({
        id: "metric:next-day",
        value: 0.13,
        source_at: "2026-08-22T23:00:00.000Z",
        observed_at: "2026-08-22T23:59:00.000Z",
        ingested_at: "2026-08-23T12:30:00.000Z",
      }),
    ];
    const history = buildEthFrontendHistory({
      query: query(["eth.l2_settlement_cost_share", "eth.total_burn_eth"]),
      observations: rows,
      generatedAt: new Date("2026-08-24T00:00:00.000Z"),
    });

    expect(history.status).toBe("partial");
    expect(history.series[0]?.points.map((point) => point.value)).toEqual([0.11, 0.13]);
    expect(history.series[0]?.points[0]?.revision_count).toBe(2);
    expect(history.series[1]?.gap_codes).toContain("metric_not_collected");
    expect(history.data_quality.discarded_revision_count).toBe(1);
    expect(history.data_quality.point_in_time_cutoff_applied).toBe(true);
    expect(history.distribution.commercial_redistribution_allowed).toBe(false);
    expect(history.distribution.attribution_required).toBe(true);
    expect(history.distribution.restricted_source_refs).toEqual(["growthepie:rent_paid_usd"]);
  });

  it("fails closed on conflicting latest revisions", () => {
    const history = buildEthFrontendHistory({
      query: query(),
      observations: [
        observation({ id: "metric:a", value: 0.11 }),
        observation({ id: "metric:b", value: 0.19 }),
      ],
      generatedAt: new Date("2026-08-24T00:00:00.000Z"),
    });

    expect(history.status).toBe("unavailable");
    expect(history.series[0]?.points).toEqual([]);
    expect(history.series[0]?.gap_codes).toContain("ambiguous_latest_revision");
    expect(history.data_quality.ambiguous_revision_count).toBe(1);
  });

  it("fails closed when equally latest revisions disagree on public provenance", () => {
    const history = buildEthFrontendHistory({
      query: query(),
      observations: [
        observation({ id: "metric:a", confidence: 0.9 }),
        observation({
          id: "metric:b",
          confidence: 0.7,
          source_refs: ["growthepie:fees_paid_usd"],
        }),
      ],
      generatedAt: new Date("2026-08-24T00:00:00.000Z"),
    });

    expect(history.status).toBe("unavailable");
    expect(history.series[0]?.points).toEqual([]);
    expect(history.series[0]?.gap_codes).toContain("ambiguous_latest_revision");
    expect(history.data_quality.ambiguous_revision_count).toBe(1);
  });

  it("keeps a valid zero value instead of treating it as missing", () => {
    const history = buildEthFrontendHistory({
      query: query(["eth.net_issuance_eth"]),
      observations: [observation({
        id: "metric:zero",
        metric_key: "eth.net_issuance_eth",
        value: 0,
        unit: "ETH",
        source_refs: ["coinmetrics-community:SplyCur"],
        methodology_version: "eth-value-capture-v1",
      })],
      generatedAt: new Date("2026-08-24T00:00:00.000Z"),
    });

    expect(history.series[0]?.points[0]?.value).toBe(0);
    expect(history.status).toBe("partial");
  });
});
