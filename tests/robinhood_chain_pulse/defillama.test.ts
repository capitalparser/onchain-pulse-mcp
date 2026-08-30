import { describe, expect, it, vi } from "vitest";
import { makeContext } from "../../src/adapters/base.js";
import {
  ROBINHOOD_DEFILLAMA_URLS,
  fetchRobinhoodChainDefiLlama,
} from "../../src/adapters/robinhood_chain_defillama.js";
import { loadEnv } from "../../src/env.js";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function fetchFixture(overrides: Partial<Record<keyof typeof ROBINHOOD_DEFILLAMA_URLS, unknown>> = {}) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url === ROBINHOOD_DEFILLAMA_URLS.chains) {
      return response(overrides.chains ?? [{ name: "Robinhood Chain", tvl: 700_000_000, change_1d: 1.5 }]);
    }
    if (url === ROBINHOOD_DEFILLAMA_URLS.stablecoinChains) {
      return response(overrides.stablecoinChains ?? [{
        name: "Robinhood Chain",
        totalCirculatingUSD: { peggedUSD: 750_000_000 },
        change_7d: 3.2,
      }]);
    }
    if (url === ROBINHOOD_DEFILLAMA_URLS.dexOverview) {
      return response(overrides.dexOverview ?? {
        total24h: 900_000_000,
        total7d: 4_000_000_000,
        change_7d: 18,
        protocols: [{ name: "dex-a" }, { name: "dex-b" }],
      });
    }
    if (url === ROBINHOOD_DEFILLAMA_URLS.feeOverview) {
      return response(overrides.feeOverview ?? {
        total24h: 5_000_000,
        total7d: 27_000_000,
        change_7d: 12,
        protocols: [{ name: "app-a" }],
      });
    }
    return response({}, 404);
  });
}

describe("Robinhood Chain DefiLlama adapter", () => {
  it("normalizes bounded chain fundamentals", async () => {
    const fetchImpl = fetchFixture();
    const result = await fetchRobinhoodChainDefiLlama(
      makeContext({ env: loadEnv({}), fetchImpl: fetchImpl as typeof fetch }),
      new Date("2026-08-30T00:00:00.000Z"),
    );
    expect(result.status).toBe("valid");
    expect(result.metrics.tvl_usd).toBe(700_000_000);
    expect(result.metrics.stablecoin_supply_usd).toBe(750_000_000);
    expect(result.metrics.dex_volume_24h_usd).toBe(900_000_000);
    expect(result.metrics.app_fees_24h_usd).toBe(5_000_000);
    expect(result.confidence).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("returns partial without filling a failed source with zero", async () => {
    const fetchImpl = fetchFixture({ dexOverview: null });
    fetchImpl.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === ROBINHOOD_DEFILLAMA_URLS.dexOverview) return response({}, 503);
      if (url === ROBINHOOD_DEFILLAMA_URLS.chains) return response([{ name: "Robinhood Chain", tvl: 100, change_1d: 0 }]);
      if (url === ROBINHOOD_DEFILLAMA_URLS.stablecoinChains) return response([{ name: "Robinhood Chain", totalCirculatingUSD: 90 }]);
      if (url === ROBINHOOD_DEFILLAMA_URLS.feeOverview) return response({ total24h: 5, protocols: [] });
      return response({}, 404);
    });
    const result = await fetchRobinhoodChainDefiLlama(
      makeContext({ env: loadEnv({}), fetchImpl: fetchImpl as typeof fetch }),
      new Date("2026-08-30T00:00:00.000Z"),
    );
    expect(result.status).toBe("partial");
    expect(result.metrics.dex_volume_24h_usd).toBeNull();
    expect(result.metrics.tvl_usd).toBe(100);
    expect(result.gaps.some((gap) => gap.code.includes("source_access_gap"))).toBe(true);
  });

  it("fails closed on a missing Robinhood Chain row", async () => {
    const result = await fetchRobinhoodChainDefiLlama(
      makeContext({
        env: loadEnv({}),
        fetchImpl: fetchFixture({ chains: [{ name: "Other", tvl: 1 }] }) as typeof fetch,
      }),
      new Date("2026-08-30T00:00:00.000Z"),
    );
    expect(result.status).toBe("partial");
    expect(result.metrics.tvl_usd).toBeNull();
    expect(result.gaps.some((gap) => gap.code.includes("schema_drift"))).toBe(true);
  });

  it("returns marked stale data after the cache TTL when every refresh source fails", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-08-30T00:00:00.000Z"));
      const liveFetch = fetchFixture();
      let refreshFails = false;
      const fetchImpl = vi.fn(async (input: string | URL | Request) => (
        refreshFails ? response({}, 503) : liveFetch(input)
      ));
      const ctx = makeContext({ env: loadEnv({}), fetchImpl: fetchImpl as typeof fetch });

      const fresh = await fetchRobinhoodChainDefiLlama(ctx, new Date());
      expect(fresh.status).toBe("valid");

      refreshFails = true;
      vi.advanceTimersByTime(15 * 60_000 + 1);
      const stale = await fetchRobinhoodChainDefiLlama(ctx, new Date());

      expect(stale.status).toBe("partial");
      expect(stale.stale).toBe(true);
      expect(stale.metrics.tvl_usd).toBe(700_000_000);
      expect(stale.staleData).toContain("defillama:stale_cache");
    } finally {
      vi.useRealTimers();
    }
  });
});
