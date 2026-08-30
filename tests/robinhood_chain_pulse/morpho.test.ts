import { describe, expect, it, vi } from "vitest";
import { makeContext } from "../../src/adapters/base.js";
import { fetchRobinhoodChainMorpho, MORPHO_GRAPHQL_URL } from "../../src/adapters/robinhood_chain_morpho.js";
import { loadEnv } from "../../src/env.js";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function market(index: number, marketId = `market-${index}`) {
  return {
    marketId,
    loanAsset: { address: `0xloan${index}`, symbol: "USDG" },
    collateralAsset: { address: `0xcollateral${index}`, symbol: "WETH" },
    state: {
      supplyAssetsUsd: 1,
      borrowAssetsUsd: 0.5,
      liquidityAssetsUsd: 0.5,
      collateralAssetsUsd: 2,
      utilization: 0.5,
    },
  };
}

function variablesFrom(init?: RequestInit): { first?: number; skip?: number } {
  const body = JSON.parse(String(init?.body)) as { variables?: { first?: number; skip?: number } };
  return body.variables ?? {};
}

describe("Robinhood Chain Morpho adapter", () => {
  it("aggregates listed lending supply, borrow, liquidity, and utilisation", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe(MORPHO_GRAPHQL_URL);
      expect(init?.method).toBe("POST");
      expect(String(init?.body)).toContain("chainId_in: [4663]");
      return response({
        data: {
          markets: {
            items: [
              {
                marketId: "market-1",
                loanAsset: { address: "0x1", symbol: "USDG" },
                collateralAsset: { address: "0x2", symbol: "WETH" },
                state: {
                  supplyAssetsUsd: 100_000_000,
                  borrowAssetsUsd: 70_000_000,
                  liquidityAssetsUsd: 30_000_000,
                  collateralAssetsUsd: 140_000_000,
                  utilization: 0.7,
                },
              },
              {
                marketId: "market-2",
                loanAsset: { address: "0x3", symbol: "USDe" },
                collateralAsset: { address: "0x4", symbol: "NVDA" },
                state: {
                  supplyAssetsUsd: "20_000_000".replaceAll("_", ""),
                  borrowAssetsUsd: 10_000_000,
                  liquidityAssetsUsd: 10_000_000,
                  collateralAssetsUsd: 25_000_000,
                  utilization: 0.5,
                },
              },
            ],
            pageInfo: { count: 2, countTotal: 2, limit: 100, skip: 0 },
          },
        },
      });
    });
    const result = await fetchRobinhoodChainMorpho(
      makeContext({ env: loadEnv({}), fetchImpl: fetchImpl as typeof fetch }),
      new Date("2026-08-30T00:00:00.000Z"),
    );
    expect(result.status).toBe("valid");
    expect(result.metrics.supply_usd).toBe(120_000_000);
    expect(result.metrics.borrow_usd).toBe(80_000_000);
    expect(result.metrics.liquidity_usd).toBe(40_000_000);
    expect(result.metrics.utilisation).toBeCloseTo(2 / 3);
    expect(result.metrics.high_utilisation_market_count).toBe(0);
    expect(result.metrics.loan_asset_symbols).toEqual(["USDe", "USDG"]);
    expect(result.metrics.stock_token_collateral_market_count).toBeNull();
    expect(result.gaps.some((gap) => gap.code.includes("stock_token_classification_gap"))).toBe(true);
  });

  it("returns zero credit with an explicit no-market gap rather than unavailable provider data", async () => {
    const result = await fetchRobinhoodChainMorpho(
      makeContext({
        env: loadEnv({}),
        fetchImpl: vi.fn(async () => response({
          data: {
            markets: {
              items: [],
              pageInfo: { count: 0, countTotal: 0, limit: 100, skip: 0 },
            },
          },
        })) as typeof fetch,
      }),
      new Date("2026-08-30T00:00:00.000Z"),
    );
    expect(result.status).toBe("partial");
    expect(result.metrics.supply_usd).toBe(0);
    expect(result.metrics.borrow_usd).toBe(0);
    expect(result.gaps.map((gap) => gap.code)).toContain("morpho-api:no_listed_markets");
  });

  it("keeps valid credit totals but marks missing collateral value as null and partial", async () => {
    const result = await fetchRobinhoodChainMorpho(
      makeContext({
        env: loadEnv({}),
        fetchImpl: vi.fn(async () => response({
          data: {
            markets: {
              items: [{
                marketId: "market-missing-collateral",
                loanAsset: { address: "0x1", symbol: "USDG" },
                collateralAsset: { address: "0x2", symbol: "WETH" },
                state: {
                  supplyAssetsUsd: 100,
                  borrowAssetsUsd: 40,
                  liquidityAssetsUsd: 60,
                  utilization: 0.4,
                },
              }],
              pageInfo: { count: 1, countTotal: 1, limit: 100, skip: 0 },
            },
          },
        })) as typeof fetch,
      }),
      new Date("2026-08-30T00:00:00.000Z"),
    );

    expect(result.status).toBe("partial");
    expect(result.metrics.supply_usd).toBe(100);
    expect(result.metrics.borrow_usd).toBe(40);
    expect(result.metrics.liquidity_usd).toBe(60);
    expect(result.metrics.collateral_usd).toBeNull();
    expect(result.gaps.map((gap) => gap.code)).toContain("morpho-api:collateral_value_gap");
  });

  it("bounds provider and schema failure", async () => {
    const result = await fetchRobinhoodChainMorpho(
      makeContext({
        env: loadEnv({}),
        fetchImpl: vi.fn(async () => response({ data: { bad: true } })) as typeof fetch,
      }),
      new Date("2026-08-30T00:00:00.000Z"),
    );
    expect(result.status).toBe("unavailable");
    expect(result.metrics.supply_usd).toBeNull();
    expect(result.gaps[0]?.code).toBe("morpho-api:schema_drift");
  });

  it("fetches and aggregates 101 listed markets across two bounded pages", async () => {
    const rows = Array.from({ length: 101 }, (_, index) => market(index));
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const { first, skip } = variablesFrom(init);
      expect(first).toBe(100);
      const offset = skip ?? 0;
      const items = rows.slice(offset, offset + 100);
      return response({
        data: {
          markets: {
            items,
            pageInfo: { count: items.length, countTotal: rows.length, limit: 100, skip: offset },
          },
        },
      });
    });

    const result = await fetchRobinhoodChainMorpho(
      makeContext({ env: loadEnv({}), fetchImpl: fetchImpl as typeof fetch }),
      new Date("2026-08-30T00:00:00.000Z"),
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("valid");
    expect(result.metrics.listed_market_count).toBe(101);
    expect(result.metrics.supply_usd).toBe(101);
    expect(result.metrics.borrow_usd).toBe(50.5);
    expect(result.metrics.collateral_usd).toBe(202);
  });

  it("keeps 101 unique asset symbols within the explicit market bound", async () => {
    const rows = Array.from({ length: 101 }, (_, index) => ({
      ...market(index),
      loanAsset: { address: `0xloan${index}`, symbol: `LOAN${String(index).padStart(3, "0")}` },
      collateralAsset: { address: `0xcollateral${index}`, symbol: `COLLATERAL${String(index).padStart(3, "0")}` },
    }));
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const offset = variablesFrom(init).skip ?? 0;
      const items = rows.slice(offset, offset + 100);
      return response({
        data: {
          markets: {
            items,
            pageInfo: { count: items.length, countTotal: rows.length, limit: 100, skip: offset },
          },
        },
      });
    });

    const result = await fetchRobinhoodChainMorpho(
      makeContext({ env: loadEnv({}), fetchImpl: fetchImpl as typeof fetch }),
      new Date("2026-08-30T00:00:00.000Z"),
    );

    expect(result.status).toBe("valid");
    expect(result.metrics.loan_asset_symbols).toHaveLength(101);
    expect(result.metrics.collateral_asset_symbols).toHaveLength(101);
  });

  it("aggregates collateral gaps across 101 markets without overflowing the snapshot bound", async () => {
    const rows = Array.from({ length: 101 }, (_, index) => {
      const row = market(index);
      const { collateralAssetsUsd: _missing, ...state } = row.state;
      return { ...row, state };
    });
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const offset = variablesFrom(init).skip ?? 0;
      const items = rows.slice(offset, offset + 100);
      return response({
        data: {
          markets: {
            items,
            pageInfo: { count: items.length, countTotal: rows.length, limit: 100, skip: offset },
          },
        },
      });
    });

    const result = await fetchRobinhoodChainMorpho(
      makeContext({ env: loadEnv({}), fetchImpl: fetchImpl as typeof fetch }),
      new Date("2026-08-30T00:00:00.000Z"),
    );

    expect(result.status).toBe("partial");
    expect(result.metrics.supply_usd).toBe(101);
    expect(result.metrics.collateral_usd).toBeNull();
    expect(result.gaps.filter((gap) => gap.code === "morpho-api:collateral_value_gap")).toHaveLength(1);
    expect(result.gaps.find((gap) => gap.code === "morpho-api:collateral_value_gap")?.detail).toContain("101");
  });

  it("rejects a page that exceeds the requested first=100 bound", async () => {
    const rows = Array.from({ length: 101 }, (_, index) => market(index));
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const offset = variablesFrom(init).skip ?? 0;
      return response({
        data: {
          markets: {
            items: rows,
            pageInfo: { count: rows.length, countTotal: rows.length, limit: 100, skip: offset },
          },
        },
      });
    });

    const result = await fetchRobinhoodChainMorpho(
      makeContext({ env: loadEnv({}), fetchImpl: fetchImpl as typeof fetch }),
      new Date("2026-08-30T00:00:00.000Z"),
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("unavailable");
    expect(result.gaps.map((gap) => gap.code)).toContain("morpho-api:pagination_page_invalid");
  });

  it("fails closed when a market ID repeats across pages", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => market(index));
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const offset = variablesFrom(init).skip ?? 0;
      const items = offset === 0 ? firstPage : [market(100, "MARKET-0")];
      return response({
        data: {
          markets: {
            items,
            pageInfo: { count: items.length, countTotal: 101, limit: 100, skip: offset },
          },
        },
      });
    });

    const result = await fetchRobinhoodChainMorpho(
      makeContext({ env: loadEnv({}), fetchImpl: fetchImpl as typeof fetch }),
      new Date("2026-08-30T00:00:00.000Z"),
    );

    expect(result.status).toBe("unavailable");
    expect(result.metrics.supply_usd).toBeNull();
    expect(result.gaps.map((gap) => gap.code)).toContain("morpho-api:duplicate_market_id");
  });

  it("fails closed when countTotal changes between pages", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => market(index));
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const offset = variablesFrom(init).skip ?? 0;
      const items = offset === 0 ? firstPage : [market(100)];
      return response({
        data: {
          markets: {
            items,
            pageInfo: {
              count: items.length,
              countTotal: offset === 0 ? 101 : 102,
              limit: 100,
              skip: offset,
            },
          },
        },
      });
    });

    const result = await fetchRobinhoodChainMorpho(
      makeContext({ env: loadEnv({}), fetchImpl: fetchImpl as typeof fetch }),
      new Date("2026-08-30T00:00:00.000Z"),
    );

    expect(result.status).toBe("unavailable");
    expect(result.gaps.map((gap) => gap.code)).toContain("morpho-api:pagination_inconsistent_total");
  });

  it("fails closed when the provider total exceeds the explicit market limit", async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const offset = variablesFrom(init).skip ?? 0;
      const items = Array.from({ length: 100 }, (_, index) => market(index));
      return response({
        data: {
          markets: {
            items,
            pageInfo: { count: items.length, countTotal: 1_001, limit: 100, skip: offset },
          },
        },
      });
    });

    const result = await fetchRobinhoodChainMorpho(
      makeContext({ env: loadEnv({}), fetchImpl: fetchImpl as typeof fetch }),
      new Date("2026-08-30T00:00:00.000Z"),
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("unavailable");
    expect(result.gaps.map((gap) => gap.code)).toContain("morpho-api:pagination_limit");
  });

  it("returns marked stale data after the cache TTL when the market refresh fails", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-08-30T00:00:00.000Z"));
      let refreshFails = false;
      const fetchImpl = vi.fn(async () => refreshFails
        ? response({}, 503)
        : response({
          data: {
            markets: {
              items: [{
                marketId: "market-1",
                loanAsset: { address: "0x1", symbol: "USDG" },
                collateralAsset: { address: "0x2", symbol: "WETH" },
                state: {
                  supplyAssetsUsd: 100,
                  borrowAssetsUsd: 50,
                  liquidityAssetsUsd: 50,
                  collateralAssetsUsd: 125,
                  utilization: 0.5,
                },
              }],
              pageInfo: { count: 1, countTotal: 1, limit: 100, skip: 0 },
            },
          },
        }));
      const ctx = makeContext({ env: loadEnv({}), fetchImpl: fetchImpl as typeof fetch });

      const fresh = await fetchRobinhoodChainMorpho(ctx, new Date());
      expect(fresh.status).toBe("valid");

      refreshFails = true;
      vi.advanceTimersByTime(10 * 60_000 + 1);
      const stale = await fetchRobinhoodChainMorpho(ctx, new Date());

      expect(stale.status).toBe("partial");
      expect(stale.stale).toBe(true);
      expect(stale.metrics.supply_usd).toBe(100);
      expect(stale.staleData).toContain("morpho-api:stale_cache");
    } finally {
      vi.useRealTimers();
    }
  });
});
