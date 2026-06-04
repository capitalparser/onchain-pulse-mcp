import { describe, it, expect } from "vitest";
import { getTokenForensics } from "../../src/tools/get_token_forensics.js";

describe("get_token_forensics", () => {
  it("builds a thin-data snapshot from pool discovery and explicit source gaps", () => {
    const r = getTokenForensics({
      chain: "base",
      tokenAddress: "0xtoken",
      poolResult: {
        data: {
          pool_address: "0xpool",
          base_token_symbol: "VVV",
          liquidity_usd: 250_000,
          volume_24h_usd: 50_000,
          price_usd: 1.2,
        },
        sources: ["dexscreener"],
        asOf: "2026-05-25T12:00:00Z",
        stale: false,
        stale_data: [],
      },
      rpcResult: {
        data: { checked_wallets: [] },
        sources: [],
        asOf: "2026-05-25T12:00:01Z",
        stale: false,
        stale_data: ["rpc_cross_check:no_wallets"],
      },
      byokActive: [],
      paidSourcesActive: [],
    });

    expect(r.flow_reading).toBe("thin-data");
    expect(r.token.symbol).toBe("VVV");
    expect(r.token.pool_address).toBe("0xpool");
    expect(r.sources).toEqual(["dexscreener"]);
    expect(r.gaps.map((g) => g.code)).toEqual(["source_access_gap", "rpc_gap"]);
    expect(r.confidence).toBeLessThan(1);
    expect(r.pool_context?.liquidity_usd).toBe(250_000);
    expect(r.sentiment_context).toBeUndefined();
    expect(r.summary).toMatch(/thin data/i);
  });

  it("returns unknown when no pool can be discovered", () => {
    const r = getTokenForensics({
      chain: "base",
      tokenAddress: "0xtoken",
      poolResult: {
        data: {},
        sources: [],
        asOf: "2026-05-25T12:00:00Z",
        stale: false,
        stale_data: ["dexscreener:no_matching_pool"],
      },
      rpcResult: {
        data: { checked_wallets: [] },
        sources: [],
        asOf: "2026-05-25T12:00:01Z",
        stale: false,
        stale_data: ["rpc_cross_check:no_wallets"],
      },
      byokActive: [],
      paidSourcesActive: [],
    });

    expect(r.flow_reading).toBe("unknown");
    expect(r.gaps.map((g) => g.code)).toContain("source_access_gap");
    expect(r.confidence).toBe(0);
  });
});
