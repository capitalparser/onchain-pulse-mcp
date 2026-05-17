import { describe, it, expect, vi } from "vitest";
import { makeContext, type Adapter } from "../../src/adapters/base.js";
import { fanOutAdapters } from "../../src/pipeline/fanout.js";
import type { AdapterResult } from "../../src/types.js";

const env = { byok: { coinglass: "k" }, lang: "en" as const, historyPath: "/tmp/history.json" };

function fakeAdapter(name: string, result: AdapterResult, capability: string[] = []): Adapter {
  return {
    name,
    ttlMs: 60_000,
    capabilities: () => ({ byok_active: capability, sources: [name] }),
    fetch: vi.fn(async () => result),
  };
}

describe("fanOutAdapters", () => {
  it("F17 fans out to all adapters in parallel and merges sources + byokActive", async () => {
    const ctx = makeContext({ env });
    const adapters = [
      fakeAdapter(
        "derivatives",
        { data: { funding_btc: 0.0001 }, sources: ["deribit", "coinglass"], asOf: "t1", stale: false },
        ["coinglass"],
      ),
      fakeAdapter("macro_rwa", { data: { etf_7d_net_usd: 340e6 }, sources: ["farside.co.uk"], asOf: "t2", stale: false }),
      fakeAdapter("onchain_wallet", {
        data: { stablecoin_7d_delta_pct: 0.014 },
        sources: ["defillama-stablecoins"],
        asOf: "t3",
        stale: false,
      }),
      fakeAdapter("cex_flow", { data: { cex_volume_24h_btc: 200_000 }, sources: ["coingecko"], asOf: "t4", stale: false }),
      fakeAdapter("kr_premium", { data: { upbit_volume_btc_24h: 3_000 }, sources: ["upbit"], asOf: "t5", stale: false }),
    ];
    const out = await fanOutAdapters(adapters, ctx);
    for (const a of adapters) expect(a.fetch).toHaveBeenCalledTimes(1);
    expect(Object.keys(out.perAdapter).sort()).toEqual([
      "cex_flow",
      "derivatives",
      "kr_premium",
      "macro_rwa",
      "onchain_wallet",
    ]);
    expect(out.sources).toEqual(
      expect.arrayContaining(["coingecko", "coinglass", "defillama-stablecoins", "deribit", "farside.co.uk", "upbit"]),
    );
    expect(out.byokActive).toEqual(["coinglass"]);
    expect(out.staleData).toEqual([]);
    expect(out.asOf).toBe("t5");
  });

  it("F17 partial failure: one adapter throws - others survive, staleData annotated, no rejection", async () => {
    const ctx = makeContext({ env: { ...env, byok: {} } });
    const failing: Adapter = {
      name: "derivatives",
      ttlMs: 60_000,
      capabilities: () => ({ byok_active: [], sources: ["deribit"] }),
      fetch: vi.fn(async () => {
        throw new Error("upstream down");
      }),
    };
    const ok = fakeAdapter("macro_rwa", {
      data: { etf_7d_net_usd: 100e6 },
      sources: ["farside.co.uk"],
      asOf: "t",
      stale: false,
    });
    const out = await fanOutAdapters([failing, ok], ctx);
    expect(out.perAdapter.derivatives?.data).toEqual({});
    expect(out.perAdapter.macro_rwa?.data.etf_7d_net_usd).toBe(100e6);
    expect(out.staleData).toContain("derivatives:adapter_threw");
  });

  it("F17 propagates per-adapter stale_data into the merged staleData", async () => {
    const ctx = makeContext({ env: { ...env, byok: {} } });
    const flaky = fakeAdapter("derivatives", {
      data: { funding_btc: 0.0001 },
      sources: ["deribit"],
      asOf: "t",
      stale: false,
      stale_data: ["coinglass:auth_rejected"],
    });
    const out = await fanOutAdapters([flaky], ctx);
    expect(out.staleData).toContain("coinglass:auth_rejected");
  });

  it("F17 stale fallback adapter result is preserved with stale: true flag bubbled up", async () => {
    const ctx = makeContext({ env: { ...env, byok: {} } });
    const stale = fakeAdapter("macro_rwa", {
      data: { etf_7d_net_usd: 200e6 },
      sources: ["farside.co.uk"],
      asOf: "t-old",
      stale: true,
    });
    const out = await fanOutAdapters([stale], ctx);
    expect(out.perAdapter.macro_rwa?.stale).toBe(true);
    expect(out.staleData).toContain("macro_rwa:stale_fallback");
  });
});
