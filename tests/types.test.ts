import { describe, it, expect } from "vitest";
import { AdapterResultSchema, ToolResponseSchema, type Reading } from "../src/types.js";

describe("ToolResponseSchema", () => {
  it("accepts a fully-populated response", () => {
    const ok = ToolResponseSchema.parse({
      summary: "ETF +$340M 7d, reading: risk-on (78/100)",
      score: 78,
      reading: "risk-on",
      as_of: "2026-05-08T07:00:00Z",
      inputs: { etf_7d_net_usd: 340_000_000 },
      sources: ["farside.co.uk", "defillama"],
      stale_data: [],
      confidence: 1.0,
      capabilities: { byok_active: [] },
    });
    expect(ok.reading satisfies Reading).toBe("risk-on");
  });

  it("accepts unknown reading and null score for full-failure case", () => {
    const r = ToolResponseSchema.parse({
      summary: "data unavailable",
      score: null,
      reading: "unknown",
      as_of: "2026-05-08T07:00:00Z",
      inputs: {},
      sources: [],
      stale_data: ["all sources down"],
      confidence: 0,
      capabilities: { byok_active: [] },
    });
    expect(r.score).toBeNull();
  });

  it("rejects an out-of-range score", () => {
    expect(() =>
      ToolResponseSchema.parse({
        summary: "x",
        score: 150,
        reading: "risk-on",
        as_of: "2026-05-08T07:00:00Z",
        inputs: {},
        sources: [],
        stale_data: [],
        confidence: 1,
        capabilities: { byok_active: [] },
      }),
    ).toThrow();
  });
});

describe("AdapterResultSchema", () => {
  it("accepts optional per-source stale_data annotations", () => {
    const r = AdapterResultSchema.parse({
      data: { funding_avg_btc_eth: 0.012 },
      sources: ["deribit"],
      asOf: "2026-05-08T07:00:00Z",
      stale: false,
      stale_data: ["coinglass:auth_rejected"],
    });
    expect(r.stale_data).toEqual(["coinglass:auth_rejected"]);
  });
});
