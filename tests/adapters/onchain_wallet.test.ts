import { describe, it, expect } from "vitest";
import { makeContext } from "../../src/adapters/base.js";
import { onchainWallet } from "../../src/adapters/onchain_wallet.js";

const env = { byok: {}, lang: "en" as const, historyPath: "/tmp/history.json" };

function fakeFetch(map: Record<string, unknown | string>): typeof fetch {
  return (async (url: string | URL | Request) => {
    const u = url.toString();
    for (const [pat, body] of Object.entries(map)) {
      if (u.includes(pat)) {
        const isJson = typeof body !== "string";
        return new Response(isJson ? JSON.stringify(body) : body, { status: 200 });
      }
    }
    return new Response("nf", { status: 404 });
  }) as typeof fetch;
}

const stableFlat = [
  { date: 1, totalCirculating: { peggedUSD: 100 } },
  { date: 2, totalCirculating: { peggedUSD: 100 } },
  { date: 3, totalCirculating: { peggedUSD: 100 } },
  { date: 4, totalCirculating: { peggedUSD: 100 } },
  { date: 5, totalCirculating: { peggedUSD: 100 } },
  { date: 6, totalCirculating: { peggedUSD: 100 } },
  { date: 7, totalCirculating: { peggedUSD: 100 } },
  { date: 8, totalCirculating: { peggedUSD: 100 } },
];

describe("onchain_wallet adapter", () => {
  it("free path computes stablecoin 7d delta", async () => {
    const ctx = makeContext({
      env,
      fetchImpl: fakeFetch({
        "stablecoincharts/all": [
          { date: 1714435200, totalCirculating: { peggedUSD: 150_000_000_000 } },
          { date: 1714521600, totalCirculating: { peggedUSD: 150_500_000_000 } },
          { date: 1714608000, totalCirculating: { peggedUSD: 151_000_000_000 } },
          { date: 1714694400, totalCirculating: { peggedUSD: 151_500_000_000 } },
          { date: 1714780800, totalCirculating: { peggedUSD: 152_000_000_000 } },
          { date: 1714867200, totalCirculating: { peggedUSD: 152_500_000_000 } },
          { date: 1714953600, totalCirculating: { peggedUSD: 152_800_000_000 } },
          { date: 1715040000, totalCirculating: { peggedUSD: 153_100_000_000 } },
        ],
      }),
    });
    const r = await onchainWallet.fetch(undefined, ctx);
    expect(r.data.stablecoin_7d_delta_pct).toBeCloseTo(0.02067, 4);
    expect(r.sources).toContain("defillama-stablecoins");
  });

  it("BYOK path adds smart_money_net_usd when NANSEN_API_KEY set", async () => {
    const ctx = makeContext({
      env: { ...env, byok: { nansen: "n-1" } },
      fetchImpl: fakeFetch({
        "stablecoincharts/all": stableFlat,
        "nansen.ai": { data: { net_usd_7d: 25_000_000 } },
      }),
    });
    const r = await onchainWallet.fetch(undefined, ctx);
    expect(r.data.smart_money_net_usd).toBe(25_000_000);
    expect(r.sources).toContain("nansen");
  });

  it("F13 Nansen 401: free data preserved, smart_money_net_usd omitted, stale_data annotated, server does not crash", async () => {
    const ctx = makeContext({
      env: { ...env, byok: { nansen: "fake-key-401" } },
      fetchImpl: (async (url: string | URL | Request) => {
        const u = url.toString();
        if (u.includes("stablecoincharts/all")) {
          return new Response(
            JSON.stringify([...stableFlat.slice(0, 7), { date: 8, totalCirculating: { peggedUSD: 102 } }]),
            { status: 200 },
          );
        }
        if (u.includes("nansen.ai")) {
          return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
        }
        return new Response("nf", { status: 404 });
      }) as typeof fetch,
    });
    const r = await onchainWallet.fetch(undefined, ctx);
    expect(r.data.stablecoin_7d_delta_pct).toBeCloseTo(0.02, 4);
    expect(r.data.smart_money_net_usd).toBeUndefined();
    expect(r.sources).toContain("defillama-stablecoins");
    expect(r.sources).not.toContain("nansen");
    expect(r.stale_data).toContain("nansen:auth_rejected");
    expect(r.stale).toBe(false);
  });

  it("F13 Nansen 403: same fail-safe behaviour as 401", async () => {
    const ctx = makeContext({
      env: { ...env, byok: { nansen: "fake-key-403" } },
      fetchImpl: (async (url: string | URL | Request) => {
        const u = url.toString();
        if (u.includes("stablecoincharts/all")) {
          return new Response(JSON.stringify(stableFlat), { status: 200 });
        }
        if (u.includes("nansen.ai")) {
          return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
        }
        return new Response("nf", { status: 404 });
      }) as typeof fetch,
    });
    const r = await onchainWallet.fetch(undefined, ctx);
    expect(r.data.smart_money_net_usd).toBeUndefined();
    expect(r.stale_data).toContain("nansen:auth_rejected");
  });

  it("F13 Nansen 5xx / network error: data preserved, generic stale annotation", async () => {
    const ctx = makeContext({
      env: { ...env, byok: { nansen: "key" } },
      fetchImpl: (async (url: string | URL | Request) => {
        const u = url.toString();
        if (u.includes("stablecoincharts/all")) {
          return new Response(JSON.stringify(stableFlat), { status: 200 });
        }
        if (u.includes("nansen.ai")) {
          throw new Error("ECONNRESET");
        }
        return new Response("nf", { status: 404 });
      }) as typeof fetch,
    });
    const r = await onchainWallet.fetch(undefined, ctx);
    expect(r.data.smart_money_net_usd).toBeUndefined();
    expect(r.stale_data).toContain("nansen:network_error");
  });

  it("capabilities reports BYOK presence", () => {
    expect(onchainWallet.capabilities(env).byok_active).toEqual([]);
    expect(onchainWallet.capabilities({ ...env, byok: { nansen: "k" } }).byok_active).toContain("nansen");
  });
});
