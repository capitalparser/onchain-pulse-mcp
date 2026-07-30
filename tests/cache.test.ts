import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TTLCache } from "../src/cache.js";

describe("TTLCache", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns cached value within TTL", async () => {
    const c = new TTLCache<string>({ ttlMs: 1000, max: 10 });
    let calls = 0;
    const loader = async () => {
      calls++;
      return "v";
    };
    expect(await c.getOrLoad("k", loader)).toBe("v");
    expect(await c.getOrLoad("k", loader)).toBe("v");
    expect(calls).toBe(1);
  });

  it("re-loads after TTL expires", async () => {
    const c = new TTLCache<string>({ ttlMs: 1000, max: 10 });
    let calls = 0;
    const loader = async () => `v${++calls}`;
    expect(await c.getOrLoad("k", loader)).toBe("v1");
    await vi.advanceTimersByTimeAsync(1500);
    expect(await c.getOrLoad("k", loader)).toBe("v2");
  });

  it("getStale returns last value even after TTL expires", async () => {
    const c = new TTLCache<string>({ ttlMs: 1000, max: 10 });
    await c.getOrLoad("k", async () => "v1");
    await vi.advanceTimersByTimeAsync(1500);
    expect(c.getStale("k")).toBe("v1");
  });

  it("evicts least-recently-used entries past max", async () => {
    const c = new TTLCache<string>({ ttlMs: 60_000, max: 2 });
    await c.getOrLoad("a", async () => "a");
    await c.getOrLoad("b", async () => "b");
    await c.getOrLoad("c", async () => "c");
    expect(c.getStale("a")).toBeUndefined();
  });

  it("coalesces concurrent getOrLoad calls for the same key (single upstream call)", async () => {
    const c = new TTLCache<string>({ ttlMs: 60_000, max: 10 });
    let calls = 0;
    const loader = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 50));
      return `v${calls}`;
    };
    const p = Promise.all([
      c.getOrLoad("k", loader),
      c.getOrLoad("k", loader),
      c.getOrLoad("k", loader),
    ]);
    await vi.advanceTimersByTimeAsync(60);
    const [a, b, d] = await p;
    expect([a, b, d]).toEqual(["v1", "v1", "v1"]);
    expect(calls).toBe(1);
  });

  it("does NOT coalesce calls across different keys", async () => {
    const c = new TTLCache<string>({ ttlMs: 60_000, max: 10 });
    let calls = 0;
    const loader = async () => `v${++calls}`;
    const [a, b] = await Promise.all([
      c.getOrLoad("a", loader),
      c.getOrLoad("b", loader),
    ]);
    expect(a).not.toBe(b);
    expect(calls).toBe(2);
  });

  it("clears the in-flight map when the loader rejects, allowing retry", async () => {
    const c = new TTLCache<string>({ ttlMs: 60_000, max: 10 });
    let calls = 0;
    const loader = vi.fn(async () => {
      calls++;
      if (calls === 1) throw new Error("first attempt fails");
      return "ok";
    });
    await expect(c.getOrLoad("k", loader)).rejects.toThrow("first attempt fails");
    expect(await c.getOrLoad("k", loader)).toBe("ok");
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("set/get expose direct cache writes for deterministic tests", async () => {
    const c = new TTLCache<string>({ ttlMs: 60_000, max: 10 });
    c.set("k", "manual");
    expect(c.get("k")).toBe("manual");
    await vi.advanceTimersByTimeAsync(120_000);
    expect(c.get("k")).toBeUndefined();
    expect(c.getStale("k")).toBe("manual");
  });
});
