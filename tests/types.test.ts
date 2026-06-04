import { describe, it, expect } from "vitest";
import { AdapterResultSchema, ForensicsSnapshotSchema, ToolResponseSchema, type Reading } from "../src/types.js";

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

describe("ForensicsSnapshotSchema", () => {
  it("accepts a token-level forensic snapshot with explicit gaps", () => {
    const r = ForensicsSnapshotSchema.parse({
      summary: "VVV on Base has thin data; pool discovered but wallet-flow source is unavailable.",
      flow_reading: "thin-data",
      as_of: "2026-05-25T12:00:00Z",
      token: {
        chain: "base",
        address: "0xacfe6019ed1a7dc6f7b508c02d1b04ec88cc21bf",
        symbol: "VVV",
        pool_address: "0xpool",
      },
      windows: {},
      top_sellers: [],
      top_accumulators: [],
      cex_deposit_risk: { level: "unknown", signals: [] },
      pool_context: { liquidity_usd: 250_000, volume_24h_usd: 50_000, price_usd: 1.2 },
      sources: ["dexscreener"],
      stale_data: [],
      confidence: 0.35,
      capabilities: { byok_active: [], paid_sources_active: [] },
      gaps: [{ code: "source_access_gap", detail: "Wallet-flow paid source unavailable." }],
    });

    expect(r.flow_reading).toBe("thin-data");
    expect(r.pool_context?.liquidity_usd).toBe(250_000);
    expect(r.gaps[0]?.code).toBe("source_access_gap");
  });

  it("rejects prescriptive trade language in flow_reading", () => {
    expect(() =>
      ForensicsSnapshotSchema.parse({
        summary: "buy",
        flow_reading: "buy",
        as_of: "2026-05-25T12:00:00Z",
        token: { chain: "base", address: "0xabc" },
        windows: {},
        top_sellers: [],
        top_accumulators: [],
        cex_deposit_risk: { level: "low", signals: [] },
        sources: [],
        stale_data: [],
        confidence: 1,
        capabilities: { byok_active: [], paid_sources_active: [] },
        gaps: [],
      }),
    ).toThrow();
  });
});
