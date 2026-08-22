import { describe, expect, it } from "vitest";
import type { GrowThePieEcosystemResult } from "../../src/adapters/eth_ecosystem_growthepie.js";
import { buildEthEcosystemCapture } from "../../src/eth_ecosystem_capture/metrics.js";
import { EthEcosystemCaptureSnapshotSchema } from "../../src/eth_ecosystem_capture/types.js";

function adapter(overrides: Partial<GrowThePieEcosystemResult> = {}): GrowThePieEcosystemResult {
  return {
    status: "valid",
    cutoffDay: "2026-07-31",
    asOf: "2026-07-30T00:00:00Z",
    metrics: {
      l2UserFeesUsd: { current: 900, previous: 450 },
      l2RentPaidUsd: { current: 180, previous: 90 },
      l2SettlementCostShare: { current: 0.2, previous: 0.2 },
      ethereumL1StablecoinSupplyUsd: { current: 1_000, previous: 900 },
      ethereumL2StablecoinSupplyUsd: { current: 500, previous: 400 },
      ethereumEcosystemStablecoinSupplyUsd: { current: 1_500, previous: 1_300 },
    },
    includedL2Origins: ["arbitrum", "base"],
    excludedExternalDaOrigins: ["arbitrum_nova"],
    sources: [
      "growthepie:master",
      "growthepie:fees_paid_usd",
      "growthepie:rent_paid_usd",
      "growthepie:stables_mcap",
    ],
    sourceStatus: [
      { source: "growthepie:master", role: "metadata", as_of: "2026-07-30T00:00:00Z", stale: false },
      { source: "growthepie:fees_paid_usd", role: "fees", as_of: "2026-07-30T00:00:00Z", stale: false },
      { source: "growthepie:rent_paid_usd", role: "rent", as_of: "2026-07-30T00:00:00Z", stale: false },
      { source: "growthepie:stables_mcap", role: "stablecoins", as_of: "2026-07-30T00:00:00Z", stale: false },
    ],
    stale: false,
    gaps: [],
    confidence: 1,
    ...overrides,
  };
}

describe("buildEthEcosystemCapture", () => {
  it("separates Ethereum ecosystem growth from settlement-cost capture", () => {
    const result = buildEthEcosystemCapture({
      window: "30d",
      lang: "en",
      adapter: adapter(),
      now: new Date("2026-07-31T01:00:00Z"),
    });

    expect(result.status).toBe("complete");
    expect(result.metrics.l2_user_fees_usd).toEqual({
      current: 900,
      previous: 450,
      delta: 450,
      pct_change: 1,
      unit: "USD",
    });
    expect(result.metrics.l2_settlement_cost_share).toEqual({
      current: 0.2,
      previous: 0.2,
      delta: 0,
      unit: "ratio",
    });
    expect(result.metrics.ethereum_ecosystem_stablecoin_supply_usd).toEqual({
      current: 1_500,
      previous: 1_300,
      delta: 200,
      pct_change: 200 / 1_300,
      unit: "USD",
    });
    expect(result.coverage).toEqual({
      included_l2_count: 2,
      included_l2_origins: ["arbitrum", "base"],
      excluded_external_da_origins: ["arbitrum_nova"],
    });
    expect(EthEcosystemCaptureSnapshotSchema.parse(result)).toEqual(result);
  });

  it("keeps a stale or gapped source partial even when cached values remain", () => {
    const sourceStatus = adapter().sourceStatus.map((source) => ({ ...source, stale: true }));
    const result = buildEthEcosystemCapture({
      window: "30d",
      lang: "ko",
      adapter: adapter({
        status: "partial",
        stale: true,
        confidence: 0.75,
        sourceStatus,
        gaps: [{ code: "source_stale", detail: "cached" }],
      }),
      now: new Date("2026-07-31T01:00:00Z"),
    });

    expect(result.status).toBe("partial");
    expect(result.stale_data).toEqual(sourceStatus.map((source) => source.source));
    expect(result.confidence).toBe(0.75);
    expect(result.summary).toMatch(/일부 제공/);
  });

  it("returns a bounded unavailable snapshot without filling metrics with zero", () => {
    const result = buildEthEcosystemCapture({
      window: "30d",
      lang: "en",
      adapter: adapter({
        status: "unavailable",
        asOf: null,
        metrics: {
          l2UserFeesUsd: { current: null, previous: null },
          l2RentPaidUsd: { current: null, previous: null },
          l2SettlementCostShare: { current: null, previous: null },
          ethereumL1StablecoinSupplyUsd: { current: null, previous: null },
          ethereumL2StablecoinSupplyUsd: { current: null, previous: null },
          ethereumEcosystemStablecoinSupplyUsd: { current: null, previous: null },
        },
        includedL2Origins: [],
        excludedExternalDaOrigins: [],
        sources: [],
        sourceStatus: [],
        confidence: 0,
        gaps: [{ code: "source_access_gap", detail: "offline" }],
      }),
      now: new Date("2026-07-31T01:00:00Z"),
    });

    expect(result.status).toBe("unavailable");
    expect(result.metrics.l2_user_fees_usd.current).toBeNull();
    expect(result.metrics.ethereum_ecosystem_stablecoin_supply_usd.current).toBeNull();
    expect(result.confidence).toBe(0);
    expect(EthEcosystemCaptureSnapshotSchema.parse(result)).toEqual(result);
  });

  it("rejects schema drift in coverage counts", () => {
    const result = buildEthEcosystemCapture({
      window: "30d",
      lang: "en",
      adapter: adapter(),
      now: new Date("2026-07-31T01:00:00Z"),
    });

    expect(() => EthEcosystemCaptureSnapshotSchema.parse({
      ...result,
      coverage: { ...result.coverage, included_l2_count: 99 },
    })).toThrow();
  });
});
