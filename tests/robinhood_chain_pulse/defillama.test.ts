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

const STABLECOIN_HISTORY_URL = "https://stablecoins.llama.fi/stablecoincharts/Robinhood%20Chain";
const FIXTURE_NOW = new Date("2026-08-30T12:00:00.000Z");
const DAY_SECONDS = 86_400;

function unix(date: Date): number {
  return Math.floor(date.getTime() / 1_000);
}

function stablecoinHistoryFixture() {
  const now = unix(FIXTURE_NOW);
  return [
    { date: String(now - 8 * DAY_SECONDS), totalCirculatingUSD: { peggedUSD: 680_000_000 } },
    { date: String(now - 7 * DAY_SECONDS), totalCirculatingUSD: { peggedUSD: 700_000_000 } },
    { date: String(now - DAY_SECONDS), totalCirculatingUSD: { peggedUSD: 750_000_000 } },
    { date: String(now + DAY_SECONDS), totalCirculatingUSD: { peggedUSD: 9_999_000_000 } },
  ];
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
      }]);
    }
    if (url === STABLECOIN_HISTORY_URL) {
      return response(stablecoinHistoryFixture());
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
      FIXTURE_NOW,
    );
    expect(result.status).toBe("valid");
    expect(result.metrics.tvl_usd).toBe(700_000_000);
    expect(result.metrics.stablecoin_supply_usd).toBe(750_000_000);
    expect(result.metrics.stablecoin_change_7d_pct).toBeCloseTo((50_000_000 / 700_000_000) * 100);
    expect(result.metrics.dex_volume_24h_usd).toBe(900_000_000);
    expect(result.metrics.app_fees_24h_usd).toBe(5_000_000);
    expect(result.confidence).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });

  it("keeps current stablecoin supply but returns partial when chain history is unavailable", async () => {
    const base = fetchFixture();
    const fetchImpl = vi.fn(async (input: string | URL | Request) => (
      String(input) === STABLECOIN_HISTORY_URL ? response({}, 503) : base(input)
    ));

    const result = await fetchRobinhoodChainDefiLlama(
      makeContext({ env: loadEnv({}), fetchImpl: fetchImpl as typeof fetch }),
      FIXTURE_NOW,
    );

    expect(result.status).toBe("partial");
    expect(result.metrics.stablecoin_supply_usd).toBe(750_000_000);
    expect(result.metrics.stablecoin_change_7d_pct).toBeNull();
    expect(result.gaps.map((gap) => gap.code)).toContain("defillama-stablecoins:history:source_access_gap");
  });

  it("keeps 7d change null when no observation exists at or before the UTC baseline cutoff", async () => {
    const now = unix(FIXTURE_NOW);
    const base = fetchFixture();
    const fetchImpl = vi.fn(async (input: string | URL | Request) => (
      String(input) === STABLECOIN_HISTORY_URL
        ? response([{ date: String(now - DAY_SECONDS), totalCirculatingUSD: { peggedUSD: 10 } }])
        : base(input)
    ));

    const result = await fetchRobinhoodChainDefiLlama(
      makeContext({ env: loadEnv({}), fetchImpl: fetchImpl as typeof fetch }),
      FIXTURE_NOW,
    );

    expect(result.status).toBe("partial");
    expect(result.metrics.stablecoin_change_7d_pct).toBeNull();
    expect(result.gaps.map((gap) => gap.code)).toContain("defillama-stablecoins:history:baseline_gap");
  });

  it("distinguishes a current zero observation from missing history", async () => {
    const now = unix(FIXTURE_NOW);
    const base = fetchFixture({ stablecoinChains: [{
      name: "Robinhood Chain",
      totalCirculatingUSD: { peggedUSD: 0 },
    }] });
    const fetchImpl = vi.fn(async (input: string | URL | Request) => (
      String(input) === STABLECOIN_HISTORY_URL
        ? response([
          { date: String(now - 7 * DAY_SECONDS), totalCirculatingUSD: { peggedUSD: 100 } },
          { date: String(now), totalCirculatingUSD: { peggedUSD: 0 } },
        ])
        : base(input)
    ));

    const result = await fetchRobinhoodChainDefiLlama(
      makeContext({ env: loadEnv({}), fetchImpl: fetchImpl as typeof fetch }),
      FIXTURE_NOW,
    );

    expect(result.status).toBe("valid");
    expect(result.metrics.stablecoin_supply_usd).toBe(0);
    expect(result.metrics.stablecoin_change_7d_pct).toBe(-100);
  });

  it("ignores a malformed future history row before validating its supply", async () => {
    const now = unix(FIXTURE_NOW);
    const base = fetchFixture({ stablecoinChains: [{
      name: "Robinhood Chain",
      totalCirculatingUSD: { peggedUSD: 110 },
    }] });
    const fetchImpl = vi.fn(async (input: string | URL | Request) => (
      String(input) === STABLECOIN_HISTORY_URL
        ? response([
          { date: String(now - 7 * DAY_SECONDS), totalCirculatingUSD: { peggedUSD: 100 } },
          { date: String(now), totalCirculatingUSD: { peggedUSD: 110 } },
          { date: String(now + DAY_SECONDS), totalCirculatingUSD: {} },
        ])
        : base(input)
    ));

    const result = await fetchRobinhoodChainDefiLlama(
      makeContext({ env: loadEnv({}), fetchImpl: fetchImpl as typeof fetch }),
      FIXTURE_NOW,
    );

    expect(result.status).toBe("valid");
    expect(result.metrics.stablecoin_change_7d_pct).toBeCloseTo(10);
    expect(result.gaps.map((gap) => gap.code)).not.toContain("defillama-stablecoins:history:schema_drift");
  });

  it("keeps the 7d change null when the current history observation is older than 48 hours", async () => {
    const now = unix(FIXTURE_NOW);
    const base = fetchFixture();
    const fetchImpl = vi.fn(async (input: string | URL | Request) => (
      String(input) === STABLECOIN_HISTORY_URL
        ? response([
          { date: String(now - 10 * DAY_SECONDS), totalCirculatingUSD: { peggedUSD: 100 } },
          { date: String(now - 49 * 60 * 60), totalCirculatingUSD: { peggedUSD: 110 } },
        ])
        : base(input)
    ));

    const result = await fetchRobinhoodChainDefiLlama(
      makeContext({ env: loadEnv({}), fetchImpl: fetchImpl as typeof fetch }),
      FIXTURE_NOW,
    );

    expect(result.status).toBe("partial");
    expect(result.metrics.stablecoin_change_7d_pct).toBeNull();
    expect(result.gaps.map((gap) => gap.code)).toContain("defillama-stablecoins:history:current_stale");
  });

  it("keeps the 7d change null when the baseline is more than 48 hours behind its cutoff", async () => {
    const now = unix(FIXTURE_NOW);
    const base = fetchFixture();
    const fetchImpl = vi.fn(async (input: string | URL | Request) => (
      String(input) === STABLECOIN_HISTORY_URL
        ? response([
          { date: String(now - 7 * DAY_SECONDS - 49 * 60 * 60), totalCirculatingUSD: { peggedUSD: 100 } },
          { date: String(now - 60 * 60), totalCirculatingUSD: { peggedUSD: 110 } },
        ])
        : base(input)
    ));

    const result = await fetchRobinhoodChainDefiLlama(
      makeContext({ env: loadEnv({}), fetchImpl: fetchImpl as typeof fetch }),
      FIXTURE_NOW,
    );

    expect(result.status).toBe("partial");
    expect(result.metrics.stablecoin_change_7d_pct).toBeNull();
    expect(result.gaps.map((gap) => gap.code)).toContain("defillama-stablecoins:history:baseline_stale");
  });

  it("rejects conflicting stablecoin values at one history timestamp", async () => {
    const now = unix(FIXTURE_NOW);
    const base = fetchFixture();
    const fetchImpl = vi.fn(async (input: string | URL | Request) => (
      String(input) === STABLECOIN_HISTORY_URL
        ? response([
          { date: String(now - 7 * DAY_SECONDS), totalCirculatingUSD: { peggedUSD: 100 } },
          { date: String(now), totalCirculatingUSD: { peggedUSD: 110 } },
          { date: String(now), totalCirculatingUSD: { peggedUSD: 111 } },
        ])
        : base(input)
    ));

    const result = await fetchRobinhoodChainDefiLlama(
      makeContext({ env: loadEnv({}), fetchImpl: fetchImpl as typeof fetch }),
      FIXTURE_NOW,
    );

    expect(result.status).toBe("partial");
    expect(result.metrics.stablecoin_change_7d_pct).toBeNull();
    expect(result.gaps.map((gap) => gap.code)).toContain("defillama-stablecoins:history:duplicate_timestamp_conflict");
  });

  it("collapses identical duplicate timestamps deterministically", async () => {
    const now = unix(FIXTURE_NOW);
    const base = fetchFixture({ stablecoinChains: [{
      name: "Robinhood Chain",
      totalCirculatingUSD: { peggedUSD: 110 },
    }] });
    const fetchImpl = vi.fn(async (input: string | URL | Request) => (
      String(input) === STABLECOIN_HISTORY_URL
        ? response([
          { date: String(now - 7 * DAY_SECONDS), totalCirculatingUSD: { peggedUSD: 100 } },
          { date: String(now), totalCirculatingUSD: { peggedUSD: 110 } },
          { date: String(now), totalCirculatingUSD: { peggedUSD: 110 } },
        ])
        : base(input)
    ));

    const result = await fetchRobinhoodChainDefiLlama(
      makeContext({ env: loadEnv({}), fetchImpl: fetchImpl as typeof fetch }),
      FIXTURE_NOW,
    );

    expect(result.status).toBe("valid");
    expect(result.metrics.stablecoin_change_7d_pct).toBeCloseTo(10);
    expect(result.gaps.map((gap) => gap.code)).not.toContain("defillama-stablecoins:history:duplicate_timestamp_conflict");
  });

  it("warns without replacing current stock when fresh history differs by more than 1 percent", async () => {
    const now = unix(FIXTURE_NOW);
    const base = fetchFixture({ stablecoinChains: [{
      name: "Robinhood Chain",
      totalCirculatingUSD: { peggedUSD: 120 },
    }] });
    const fetchImpl = vi.fn(async (input: string | URL | Request) => (
      String(input) === STABLECOIN_HISTORY_URL
        ? response([
          { date: String(now - 7 * DAY_SECONDS), totalCirculatingUSD: { peggedUSD: 100 } },
          { date: String(now), totalCirculatingUSD: { peggedUSD: 110 } },
        ])
        : base(input)
    ));

    const result = await fetchRobinhoodChainDefiLlama(
      makeContext({ env: loadEnv({}), fetchImpl: fetchImpl as typeof fetch }),
      FIXTURE_NOW,
    );

    expect(result.status).toBe("partial");
    expect(result.metrics.stablecoin_supply_usd).toBe(120);
    expect(result.metrics.stablecoin_change_7d_pct).toBeCloseTo(10);
    expect(result.gaps.map((gap) => gap.code)).toContain("defillama-stablecoins:history:current_stock_divergence");
  });

  it("returns partial without filling a failed source with zero", async () => {
    const fetchImpl = fetchFixture({ dexOverview: null });
    fetchImpl.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === ROBINHOOD_DEFILLAMA_URLS.dexOverview) return response({}, 503);
      if (url === ROBINHOOD_DEFILLAMA_URLS.chains) return response([{ name: "Robinhood Chain", tvl: 100, change_1d: 0 }]);
      if (url === ROBINHOOD_DEFILLAMA_URLS.stablecoinChains) return response([{ name: "Robinhood Chain", totalCirculatingUSD: 90 }]);
      if (url === STABLECOIN_HISTORY_URL) return response(stablecoinHistoryFixture());
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

  it("preserves cached unavailable source statuses while marking cached valid sources stale", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-08-30T00:00:00.000Z"));
      let refreshFails = false;
      const partialFetch = fetchFixture();
      const fetchImpl = vi.fn(async (input: string | URL | Request) => {
        if (refreshFails || String(input) === ROBINHOOD_DEFILLAMA_URLS.dexOverview) {
          return response({}, 503);
        }
        return partialFetch(input);
      });
      const ctx = makeContext({ env: loadEnv({}), fetchImpl: fetchImpl as typeof fetch });

      const partial = await fetchRobinhoodChainDefiLlama(ctx, new Date());
      expect(partial.sourceStatus.find((source) => source.source.includes("dexs:"))?.status).toBe("unavailable");

      refreshFails = true;
      vi.advanceTimersByTime(15 * 60_000 + 1);
      const stale = await fetchRobinhoodChainDefiLlama(ctx, new Date());

      expect(stale.sourceStatus.find((source) => source.source.includes("dexs:"))?.status).toBe("unavailable");
      expect(stale.sourceStatus.find((source) => source.source === "defillama:chains")?.status).toBe("stale");
    } finally {
      vi.useRealTimers();
    }
  });
});
