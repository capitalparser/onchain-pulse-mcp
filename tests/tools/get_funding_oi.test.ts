import { describe, it, expect } from "vitest";
import { getFundingOi } from "../../src/tools/get_funding_oi.js";

describe("get_funding_oi", () => {
  it("returns BTC funding/PCR/OI summary", async () => {
    const r = await getFundingOi({
      asset: "BTC",
      adapterResult: {
        data: {
          funding_btc: 0.00018,
          funding_eth: 0.00012,
          put_call_btc: 0.62,
          put_call_eth: 0.58,
          oi_btc_usd: 12_500_000_000,
        },
        sources: ["deribit", "coinglass"],
        asOf: "2026-05-08T07:00:00Z",
        stale: false,
      },
      lang: "en",
      byokActive: ["coinglass"],
      staleData: [],
    });

    expect(r.inputs.funding_btc).toBeCloseTo(0.00018, 6);
    expect(r.inputs.put_call_btc).toBeCloseTo(0.62, 3);
    expect(r.inputs.oi_btc_usd).toBe(12_500_000_000);
    expect(r.summary).toMatch(/BTC/);
    expect(r.summary).toMatch(/funding/i);
  });

  it("rejects invalid asset", async () => {
    await expect(
      getFundingOi({
        asset: "DOGE" as unknown as "BTC",
        adapterResult: { data: {}, sources: [], asOf: "x", stale: false },
        lang: "en",
        byokActive: [],
        staleData: [],
      }),
    ).rejects.toThrow(/asset/);
  });
});
