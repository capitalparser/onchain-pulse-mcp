import { describe, it, expect, vi } from "vitest";
import { TTLCache } from "../../src/cache.js";
import { withCache, makeContext, type Adapter } from "../../src/adapters/base.js";
import type { AdapterResult } from "../../src/types.js";

const env = { byok: {}, lang: "en" as const, historyPath: "/tmp/history.json" };

describe("withCache", () => {
  it("uses fresh cache when loader resolves", async () => {
    const cache = new TTLCache<AdapterResult>({ ttlMs: 60_000, max: 10 });
    const loader = vi.fn(async () => ({
      data: { x: 1 },
      sources: ["s"],
      asOf: "2026-05-08T00:00:00Z",
      stale: false,
    }));
    const r1 = await withCache(cache, "k", loader);
    const r2 = await withCache(cache, "k", loader);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(r1.stale).toBe(false);
    expect(r2.stale).toBe(false);
  });

  it("returns stale fallback when loader throws and stale exists", async () => {
    const cache = new TTLCache<AdapterResult>({ ttlMs: 1, max: 10 });
    let n = 0;
    const loader = async () => {
      n++;
      if (n === 1) {
        return { data: { x: 1 }, sources: ["s"], asOf: "t1", stale: false };
      }
      throw new Error("boom");
    };
    await withCache(cache, "k", loader);
    await new Promise((r) => setTimeout(r, 5));
    const r = await withCache(cache, "k", loader);
    expect(r.stale).toBe(true);
    expect(r.data).toEqual({ x: 1 });
  });

  it("rethrows when loader throws and no stale exists", async () => {
    const cache = new TTLCache<AdapterResult>({ ttlMs: 60_000, max: 10 });
    await expect(
      withCache(cache, "k", async () => {
        throw new Error("nope");
      }),
    ).rejects.toThrow("nope");
  });
});

describe("makeContext", () => {
  it("returns a context with a cache factory keyed by adapter name", () => {
    const ctx = makeContext({ env });
    expect(typeof ctx.cacheFor).toBe("function");
    expect(typeof ctx.fetch).toBe("function");
  });

  it("caches are isolated per adapter (no cross-contamination)", () => {
    const ctx = makeContext({ env });
    const a = ctx.cacheFor({ name: "derivatives", ttlMs: 90_000, max: 32 });
    const b = ctx.cacheFor({ name: "macro_rwa", ttlMs: 600_000, max: 32 });
    expect(a).not.toBe(b);
    a.set("k", { data: { from: "deriv" }, sources: [], asOf: "", stale: false });
    expect(b.get("k")).toBeUndefined();
  });

  it("returns the same cache instance on repeated calls for the same adapter", () => {
    const ctx = makeContext({ env });
    const a1 = ctx.cacheFor({ name: "derivatives", ttlMs: 90_000, max: 32 });
    const a2 = ctx.cacheFor({ name: "derivatives", ttlMs: 90_000, max: 32 });
    expect(a1).toBe(a2);
  });

  it("honours each adapter's declared ttlMs (no shared default override)", async () => {
    const ctx = makeContext({ env });
    const shortLived = ctx.cacheFor({ name: "fast", ttlMs: 1, max: 8 });
    const longLived = ctx.cacheFor({ name: "slow", ttlMs: 60_000, max: 8 });
    shortLived.set("k", { data: { value: 1 }, sources: [], asOf: "", stale: false });
    longLived.set("k", { data: { value: 2 }, sources: [], asOf: "", stale: false });
    await new Promise((r) => setTimeout(r, 5));
    expect(shortLived.get("k")).toBeUndefined();
    expect(longLived.get("k")).toBeDefined();
  });
});

describe("Adapter interface", () => {
  it("can be implemented", () => {
    const stub: Adapter = {
      name: "stub",
      ttlMs: 1000,
      capabilities: () => ({ byok_active: [], sources: ["x"] }),
      fetch: async () => ({ data: {}, sources: [], asOf: "", stale: false }),
    };
    expect(stub.name).toBe("stub");
  });
});
