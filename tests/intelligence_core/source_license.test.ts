import { describe, expect, it } from "vitest";
import {
  assertCommerciallyRedistributable,
  assessSourceForCommercialRedistribution,
} from "../../src/intelligence_core/source_license.js";
import type { MetricObservation } from "../../src/intelligence_core/types.js";

function observation(sourceRefs: string[]): MetricObservation {
  return {
    id: `metric:${sourceRefs.join("|")}`,
    metric_key: "test.metric",
    value: 1,
    unit: "count",
    source_at: "2026-08-20T00:00:00.000Z",
    observed_at: "2026-08-20T00:00:00.000Z",
    ingested_at: "2026-08-20T00:01:00.000Z",
    confidence: 0.9,
    source_refs: sourceRefs,
    methodology_version: "test-v1",
    dimensions: {},
  };
}

describe("source license commercialization gate", () => {
  it("classifies seeded restricted sources", () => {
    expect(assessSourceForCommercialRedistribution("coinmetrics-community:SplyCur").policy?.status)
      .toBe("internal_research_ok");
    expect(assessSourceForCommercialRedistribution("dune:eth-value").policy?.status)
      .toBe("commercial_contract_required");
    expect(assessSourceForCommercialRedistribution("growthepie:rent_paid_usd").policy).toMatchObject({
      status: "commercial_review_required",
      attributionRequired: true,
    });
    expect(assessSourceForCommercialRedistribution("defillama").policy?.status)
      .toBe("internal_research_ok");
    expect(assessSourceForCommercialRedistribution("defillama-stablecoins").policy?.status)
      .toBe("internal_research_ok");
  });

  it("fails closed for unknown source refs", () => {
    expect(() => assertCommerciallyRedistributable([observation(["unknown-vendor:metric"])])).toThrow(
      /unknown source licensing status/,
    );
  });

  it("blocks GrowThePie and DefiLlama observations from commercial redistribution by default", () => {
    expect(() => assertCommerciallyRedistributable([
      observation(["growthepie:fees_paid_usd"]),
      observation(["defillama-stablecoins"]),
    ])).toThrow(/commercial redistribution blocked/);
  });

  it("inherits the most restrictive upstream source for derived observations", () => {
    expect(() => assertCommerciallyRedistributable([
      observation(["coinmetrics-community:SplyCur", "growthepie:rent_paid_eth"]),
    ])).toThrow(/commercial redistribution blocked/);
  });

  it("allows an explicit reviewed source-prefix override without mutating the registry", () => {
    expect(() => assertCommerciallyRedistributable(
      [observation(["dune:approved-enterprise-contract"])],
      ["dune"],
    )).not.toThrow();
  });
});
