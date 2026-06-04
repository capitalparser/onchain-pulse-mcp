import { describe, it, expect } from "vitest";
import { makeContext } from "../../src/adapters/base.js";
import { dexPool } from "../../src/adapters/dex_pool.js";

const env = { byok: {}, lang: "en" as const, historyPath: "/tmp/history.json" };

function fakeFetch(body: unknown, status = 200): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
}

describe("dex_pool adapter", () => {
  it("selects the highest-liquidity pool and normalizes token market fields", async () => {
    const ctx = makeContext({
      env,
      fetchImpl: fakeFetch({
        pairs: [
          {
            chainId: "base",
            pairAddress: "0xlow",
            dexId: "uniswap",
            liquidity: { usd: 40_000 },
            volume: { h24: 300_000 },
            priceUsd: "1.15",
            priceChange: { h24: 4.2 },
            baseToken: { address: "0xtoken", symbol: "AAA" },
            quoteToken: { address: "0xusdc", symbol: "USDC" },
          },
          {
            chainId: "base",
            pairAddress: "0xhigh",
            dexId: "aerodrome",
            liquidity: { usd: 250_000 },
            volume: { h24: 50_000 },
            priceUsd: "1.2",
            priceChange: { h24: 5.5 },
            baseToken: { address: "0xtoken", symbol: "AAA" },
            quoteToken: { address: "0xweth", symbol: "WETH" },
          },
        ],
      }),
    });

    const r = await dexPool.fetch({ chain: "base", tokenAddress: "0xtoken" }, ctx);

    expect(r.data.pool_address).toBe("0xhigh");
    expect(r.data.dex).toBe("aerodrome");
    expect(r.data.liquidity_usd).toBe(250_000);
    expect(r.data.volume_24h_usd).toBe(50_000);
    expect(r.data.price_usd).toBe(1.2);
    expect(r.data.price_change_24h_pct).toBe(5.5);
    expect(r.data.base_token_symbol).toBe("AAA");
    expect(r.data.quote_token_symbol).toBe("WETH");
    expect(r.stale_data).toEqual([]);
    expect(r.sources).toEqual(["dexscreener"]);
  });

  it("annotates thin_liquidity when the best pool has low liquidity", async () => {
    const ctx = makeContext({
      env,
      fetchImpl: fakeFetch({
        pairs: [
          {
            chainId: "base",
            pairAddress: "0xthin",
            dexId: "uniswap",
            liquidity: { usd: 12_000 },
            volume: { h24: 7_500 },
            priceUsd: "0.04",
            baseToken: { address: "0xtoken", symbol: "THIN" },
            quoteToken: { address: "0xusdc", symbol: "USDC" },
          },
        ],
      }),
    });

    const r = await dexPool.fetch({ chain: "base", tokenAddress: "0xtoken" }, ctx);

    expect(r.data.pool_address).toBe("0xthin");
    expect(r.stale_data).toEqual(["dexscreener:thin_liquidity"]);
  });
});
