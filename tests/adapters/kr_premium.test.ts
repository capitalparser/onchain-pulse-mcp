import { describe, it, expect } from "vitest";
import { makeContext } from "../../src/adapters/base.js";
import { krPremium } from "../../src/adapters/kr_premium.js";

const env = { byok: {}, lang: "en" as const, historyPath: "/tmp/history.json" };

function fakeFetch(map: Record<string, unknown>): typeof fetch {
  return (async (url: string | URL | Request) => {
    const u = url.toString();
    for (const [pat, body] of Object.entries(map)) {
      if (u.includes(pat)) return new Response(JSON.stringify(body), { status: 200 });
    }
    return new Response("nf", { status: 404 });
  }) as typeof fetch;
}

describe("kr_premium adapter", () => {
  it("computes kimchi premium for BTC and ETH", async () => {
    const ctx = makeContext({
      env,
      fetchImpl: fakeFetch({
        "api.upbit.com/v1/ticker": [
          { market: "KRW-BTC", trade_price: 138_000_000, acc_trade_volume_24h: 3_000 },
          { market: "KRW-ETH", trade_price: 5_400_000, acc_trade_volume_24h: 50_000 },
        ],
        "ids=bitcoin,ethereum&vs_currencies=usd": {
          bitcoin: { usd: 100_000, usd_24h_vol: 30_000_000_000 },
          ethereum: { usd: 4_000, usd_24h_vol: 15_000_000_000 },
        },
        "ids=tether&vs_currencies=krw": { tether: { krw: 1_350 } },
      }),
    });
    const r = await krPremium.fetch(undefined, ctx);
    expect(r.data.kr_premium_btc).toBeCloseTo(0.02222, 4);
    expect(r.data.kr_premium_eth).toBeCloseTo(5_400_000 / (4_000 * 1_350) - 1, 4);
    expect(r.data.upbit_volume_btc_24h).toBe(3_000);
    expect(r.sources).toEqual(expect.arrayContaining(["upbit", "coingecko"]));
  });

  it("returns kimchi as undefined if Upbit is down", async () => {
    const ctx = makeContext({
      env,
      fetchImpl: (async (url: string | URL | Request) => {
        const u = url.toString();
        if (u.includes("upbit.com")) return new Response("err", { status: 503 });
        if (u.includes("ids=bitcoin,ethereum&vs_currencies=usd")) {
          return new Response(JSON.stringify({ bitcoin: { usd: 100_000 }, ethereum: { usd: 4_000 } }), {
            status: 200,
          });
        }
        if (u.includes("ids=tether")) {
          return new Response(JSON.stringify({ tether: { krw: 1_350 } }), { status: 200 });
        }
        return new Response("nf", { status: 404 });
      }) as typeof fetch,
    });
    const r = await krPremium.fetch(undefined, ctx);
    expect(r.data.kr_premium_btc).toBeUndefined();
    expect(r.stale).toBe(true);
  });
});
