import { describe, it, expect } from "vitest";
import { getKrPremium } from "../../src/tools/get_kr_premium.js";

describe("get_kr_premium", () => {
  it("formats kimchi premium for BTC and ETH when asset=all", async () => {
    const r = await getKrPremium({
      asset: "all",
      adapterResult: {
        data: {
          kr_premium_btc: 0.022,
          kr_premium_eth: 0.018,
          upbit_volume_btc_24h: 3_000,
          upbit_volume_eth_24h: 50_000,
        },
        sources: ["upbit", "coingecko"],
        asOf: "2026-05-08T07:00:00Z",
        stale: false,
      },
      lang: "en",
      byokActive: [],
      staleData: [],
    });

    expect(r.summary).toMatch(/BTC kimchi \+2\.2%/);
    expect(r.summary).toMatch(/ETH kimchi \+1\.8%/);
    expect(r.inputs.kr_premium_btc).toBeCloseTo(0.022, 4);
  });

  it("filters to BTC when asset=BTC", async () => {
    const r = await getKrPremium({
      asset: "BTC",
      adapterResult: {
        data: { kr_premium_btc: 0.022, kr_premium_eth: 0.018 },
        sources: [],
        asOf: "x",
        stale: false,
      },
      lang: "en",
      byokActive: [],
      staleData: [],
    });

    expect(r.inputs.kr_premium_btc).toBeCloseTo(0.022, 4);
    expect(r.inputs.kr_premium_eth).toBeUndefined();
  });
});
