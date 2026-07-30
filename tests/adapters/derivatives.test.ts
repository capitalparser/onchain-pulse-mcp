import { describe, it, expect, vi } from "vitest";
import { makeContext } from "../../src/adapters/base.js";
import { derivatives } from "../../src/adapters/derivatives.js";

function recordingFetch(map: Record<string, { status?: number; body?: unknown; throws?: boolean }>) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = url.toString();
    const headers = Object.fromEntries(new Headers(init?.headers ?? {}).entries());
    calls.push({ url: u, headers });
    for (const [pattern, spec] of Object.entries(map)) {
      if (u.includes(pattern)) {
        if (spec.throws) throw new Error(`network error for ${pattern}`);
        return new Response(JSON.stringify(spec.body ?? {}), { status: spec.status ?? 200 });
      }
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { fn, calls };
}

const happyMap = {
  "BTC-PERPETUAL": { body: { result: 0.00012 } },
  "ETH-PERPETUAL": { body: { result: 0.00018 } },
  "currency=BTC&kind=option": { body: { result: [{ put_call_ratio: 0.62 }] } },
  "currency=ETH&kind=option": { body: { result: [{ put_call_ratio: 0.58 }] } },
  "symbol=BTC&interval=1d": { body: { data: [{ c: 12_500_000_000 }] } },
  "symbol=ETH&interval=1d": { body: { data: [{ c: 5_400_000_000 }] } },
};

const baseEnv = { byok: {}, lang: "en" as const, historyPath: "/tmp/history.json" };

describe("derivatives adapter", () => {
  it("free path returns BTC/ETH funding + put/call from Deribit", async () => {
    const { fn, calls } = recordingFetch(happyMap);
    const ctx = makeContext({ env: baseEnv, fetchImpl: fn });
    const r = await derivatives.fetch(undefined, ctx);
    expect(r.data.funding_btc).toBeCloseTo(0.00012, 6);
    expect(r.data.funding_eth).toBeCloseTo(0.00018, 6);
    expect(r.data.put_call_btc).toBeCloseTo(0.62, 3);
    expect(r.data.put_call_eth).toBeCloseTo(0.58, 3);
    expect(r.sources).toEqual(["deribit"]);
    expect(r.stale).toBe(false);
    expect(calls.some((c) => c.url.includes("BTC-PERPETUAL"))).toBe(true);
    expect(calls.some((c) => c.url.includes("ETH-PERPETUAL"))).toBe(true);
    expect(calls.every((c) => !("cg-api-key" in c.headers))).toBe(true);
  });

  it("BYOK path enriches with Coinglass OI for both BTC and ETH", async () => {
    const { fn, calls } = recordingFetch(happyMap);
    const ctx = makeContext({
      env: { ...baseEnv, byok: { coinglass: "test-key" } },
      fetchImpl: fn,
    });
    const r = await derivatives.fetch(undefined, ctx);
    expect(r.data.oi_btc_usd).toBe(12_500_000_000);
    expect(r.data.oi_eth_usd).toBe(5_400_000_000);
    expect(r.sources).toEqual(["deribit", "coinglass"]);
    const cgCalls = calls.filter((c) => c.url.includes("oi-weight-ohlc"));
    expect(cgCalls.length).toBe(2);
    for (const c of cgCalls) {
      expect(c.headers["cg-api-key"]).toBe("test-key");
    }
    const deribitCalls = calls.filter((c) => c.url.includes("deribit.com"));
    for (const c of deribitCalls) {
      expect(c.headers["cg-api-key"]).toBeUndefined();
    }
  });

  it("F9 partial failure: Coinglass 401 - Deribit data survives, OI keys omitted, stale_data annotated", async () => {
    const { fn } = recordingFetch({
      ...happyMap,
      "symbol=BTC&interval=1d": { status: 401, body: { error: "auth" } },
      "symbol=ETH&interval=1d": { status: 401, body: { error: "auth" } },
    });
    const ctx = makeContext({
      env: { ...baseEnv, byok: { coinglass: "bad-key" } },
      fetchImpl: fn,
    });
    const r = await derivatives.fetch(undefined, ctx);
    expect(r.data.funding_btc).toBeCloseTo(0.00012, 6);
    expect(r.data.oi_btc_usd).toBeUndefined();
    expect(r.data.oi_eth_usd).toBeUndefined();
    expect(r.sources).toEqual(["deribit"]);
    expect(r.stale).toBe(false);
    expect(r.stale_data).toContain("coinglass:auth_rejected");
  });

  it("F9 partial failure: ETH funding 5xx - BTC keys survive, eth keys omitted with annotation", async () => {
    const { fn } = recordingFetch({
      ...happyMap,
      "ETH-PERPETUAL": { status: 503, body: { error: "upstream" } },
    });
    const ctx = makeContext({ env: baseEnv, fetchImpl: fn });
    const r = await derivatives.fetch(undefined, ctx);
    expect(r.data.funding_btc).toBeCloseTo(0.00012, 6);
    expect(r.data.funding_eth).toBeUndefined();
    expect(r.stale_data).toContain("deribit:eth_funding_unavailable");
  });

  it("F9 full failure: all Deribit endpoints down - falls back to stale cache after TTL expiry", async () => {
    vi.useFakeTimers();
    try {
      const happy = recordingFetch(happyMap);
      const ctx = makeContext({ env: baseEnv, fetchImpl: happy.fn });
      const fresh = await derivatives.fetch(undefined, ctx);
      expect(fresh.stale).toBe(false);

      await vi.advanceTimersByTimeAsync(derivatives.ttlMs + 1_000);

      const failing = recordingFetch({
        "BTC-PERPETUAL": { throws: true },
        "ETH-PERPETUAL": { throws: true },
        "currency=BTC&kind=option": { throws: true },
        "currency=ETH&kind=option": { throws: true },
      });
      ctx.fetch = failing.fn;
      const r = await derivatives.fetch(undefined, ctx);
      expect(r.stale).toBe(true);
      expect(r.data.funding_btc).toBeCloseTo(0.00012, 6);
    } finally {
      vi.useRealTimers();
    }
  });

  it("capabilities reports enrichment when key present", () => {
    expect(derivatives.capabilities(baseEnv).byok_active).toEqual([]);
    expect(derivatives.capabilities({ ...baseEnv, byok: { coinglass: "k" } }).byok_active).toContain(
      "coinglass",
    );
  });
});
