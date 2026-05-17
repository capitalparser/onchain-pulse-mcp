import { describe, it, expect } from "vitest";
import { makeContext } from "../../src/adapters/base.js";
import { cexFlow } from "../../src/adapters/cex_flow.js";

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

function coinGeckoOk(): Response {
  return new Response(JSON.stringify([{ id: "binance", trade_volume_24h_btc: 100_000 }]), { status: 200 });
}

describe("cex_flow adapter", () => {
  it("free path returns top-CEX 24h volume aggregate", async () => {
    const ctx = makeContext({
      env,
      fetchImpl: fakeFetch({
        "exchanges?per_page=10": [
          { id: "binance", trade_volume_24h_btc: 200_000 },
          { id: "coinbase", trade_volume_24h_btc: 50_000 },
          { id: "okx", trade_volume_24h_btc: 80_000 },
        ],
      }),
    });
    const r = await cexFlow.fetch(undefined, ctx);
    expect(r.data.cex_volume_24h_btc).toBe(330_000);
    expect(r.sources).toContain("coingecko");
  });

  it("BYOK path enriches with Glassnode exchange inflow when key set", async () => {
    const ctx = makeContext({
      env: { ...env, byok: { glassnode: "g-1" } },
      fetchImpl: fakeFetch({
        "exchanges?per_page=10": [{ id: "binance", trade_volume_24h_btc: 100_000 }],
        transfers_volume_to_exchanges_sum: [{ t: 1_715_000_000, v: 5_000 }],
      }),
    });
    const r = await cexFlow.fetch(undefined, ctx);
    expect(r.data.exchange_inflow_btc_24h).toBe(5_000);
    expect(r.sources).toContain("glassnode");
  });

  it("F14 Glassnode 401: free CoinGecko data survives, glassnode keys omitted, stale_data annotated", async () => {
    const ctx = makeContext({
      env: { ...env, byok: { glassnode: "bad-key" } },
      fetchImpl: (async (url: string | URL | Request) => {
        const u = url.toString();
        if (u.includes("exchanges?per_page=10")) return coinGeckoOk();
        if (u.includes("glassnode.com")) {
          return new Response(JSON.stringify({ message: "unauthorized" }), { status: 401 });
        }
        return new Response("nf", { status: 404 });
      }) as typeof fetch,
    });
    const r = await cexFlow.fetch(undefined, ctx);
    expect(r.data.cex_volume_24h_btc).toBe(100_000);
    expect(r.data.exchange_inflow_btc_24h).toBeUndefined();
    expect(r.sources).toContain("coingecko");
    expect(r.sources).not.toContain("glassnode");
    expect(r.stale_data).toContain("glassnode:auth_rejected");
  });

  it("F14 Glassnode 429: rate-limited annotation; data unchanged from free path", async () => {
    const ctx = makeContext({
      env: { ...env, byok: { glassnode: "k" } },
      fetchImpl: (async (url: string | URL | Request) => {
        const u = url.toString();
        if (u.includes("exchanges?per_page=10")) return coinGeckoOk();
        if (u.includes("glassnode.com")) return new Response("rate limit exceeded", { status: 429 });
        return new Response("nf", { status: 404 });
      }) as typeof fetch,
    });
    const r = await cexFlow.fetch(undefined, ctx);
    expect(r.data.cex_volume_24h_btc).toBe(100_000);
    expect(r.stale_data).toContain("glassnode:rate_limited");
  });

  it("F14 Glassnode empty series: inflow omitted with empty_series annotation; CoinGecko still wins", async () => {
    const ctx = makeContext({
      env: { ...env, byok: { glassnode: "k" } },
      fetchImpl: (async (url: string | URL | Request) => {
        const u = url.toString();
        if (u.includes("exchanges?per_page=10")) return coinGeckoOk();
        if (u.includes("glassnode.com")) return new Response("[]", { status: 200 });
        return new Response("nf", { status: 404 });
      }) as typeof fetch,
    });
    const r = await cexFlow.fetch(undefined, ctx);
    expect(r.data.cex_volume_24h_btc).toBe(100_000);
    expect(r.data.exchange_inflow_btc_24h).toBeUndefined();
    expect(r.stale_data).toContain("glassnode:empty_series");
  });

  it("F14 Glassnode schema drift: malformed payload -> omitted with parse annotation, no crash", async () => {
    const ctx = makeContext({
      env: { ...env, byok: { glassnode: "k" } },
      fetchImpl: (async (url: string | URL | Request) => {
        const u = url.toString();
        if (u.includes("exchanges?per_page=10")) return coinGeckoOk();
        if (u.includes("glassnode.com")) {
          return new Response(JSON.stringify({ data: { wrong: "shape" } }), { status: 200 });
        }
        return new Response("nf", { status: 404 });
      }) as typeof fetch,
    });
    const r = await cexFlow.fetch(undefined, ctx);
    expect(r.data.exchange_inflow_btc_24h).toBeUndefined();
    expect(r.stale_data).toContain("glassnode:schema_drift");
  });
});
