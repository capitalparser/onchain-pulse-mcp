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

async function resultForState(state: Record<string, unknown>) {
  const row = market(0);
  return fetchRobinhoodChainMorpho(
    makeContext({
      env: loadEnv({}),
      fetchImpl: vi.fn(async () => response({
        data: {
          markets: {
            items: [{ ...row, state: { ...row.state, ...state } }],
            pageInfo: { count: 1, countTotal: 1, limit: 100, skip: 0 },
          },
        },
      })) as typeof fetch,
    }),
    new Date("2026-08-30T00:00:00.000Z"),
  );
}

async function resultForHistory(
  historicalState: Record<string, unknown>,
  historyStatus = 200,
  currentState: Record<string, unknown> = {},
) {
  const marketId = `0x${"1".padStart(64, "0")}`;
  const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as { query: string };
    if (request.query.includes("RobinhoodChainMarketHistory")) {
      return response({ data: { market0: { marketId, historicalState } } }, historyStatus);
    }
    return response({
      data: {
        markets: {
          items: [{
            ...market(0, marketId),
            state: {
              supplyAssetsUsd: 120,
              borrowAssetsUsd: 60,
              liquidityAssetsUsd: 60,
              collateralAssetsUsd: 150,
              utilization: 0.5,
              ...currentState,
            },
          }],
          pageInfo: { count: 1, countTotal: 1, limit: 100, skip: 0 },
        },
      },
    });
  });
  return fetchRobinhoodChainMorpho(
    makeContext({ env: loadEnv({}), fetchImpl: fetchImpl as typeof fetch }),
    new Date("2026-08-30T00:00:00.000Z"),
  );
}

describe("Robinhood Chain Morpho adapter", () => {
  it("calculates bounded 7d supply, borrow, and utilisation changes from market history", async () => {
    const now = Math.floor(new Date("2026-08-30T00:00:00.000Z").getTime() / 1_000);
    const marketId = `0x${"1".padStart(64, "0")}`;
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { query: string };
      if (request.query.includes("RobinhoodChainMarketHistory")) {
        return response({
          data: {
            market0: {
              marketId,
              historicalState: {
                supplyAssetsUsd: [{ x: now, y: 120 }, { x: now - 7 * 86_400, y: 100 }],
                borrowAssetsUsd: [{ x: now, y: 60 }, { x: now - 7 * 86_400, y: 40 }],
                utilization: [{ x: now, y: 0.5 }, { x: now - 7 * 86_400, y: 0.4 }],
              },
            },
          },
        });
      }
      return response({
        data: {
          markets: {
            items: [{
              ...market(0, marketId),
              state: {
                supplyAssetsUsd: 120,
                borrowAssetsUsd: 60,
                liquidityAssetsUsd: 60,
                collateralAssetsUsd: 150,
                utilization: 0.5,
              },
            }],
            pageInfo: { count: 1, countTotal: 1, limit: 100, skip: 0 },
          },
        },
      });
    });

    const result = await fetchRobinhoodChainMorpho(
      makeContext({ env: loadEnv({}), fetchImpl: fetchImpl as typeof fetch }),
      new Date("2026-08-30T00:00:00.000Z"),
    );

    expect(result.status).toBe("valid");
    expect(result.metrics.supply_change_7d_pct).toBeCloseTo(20);
    expect(result.metrics.borrow_change_7d_pct).toBeCloseTo(50);
    expect(result.metrics.utilisation_change_7d).toBeCloseTo(0.1);
    expect(result.metrics.history_market_count).toBe(1);
    expect(result.metrics.history_covered_market_count).toBe(1);
    expect(result.metrics.unique_borrowers_change_7d_pct).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("preserves current credit but nulls all deltas when a market has no 7d baseline", async () => {
    const now = Math.floor(new Date("2026-08-30T00:00:00.000Z").getTime() / 1_000);
    const result = await resultForHistory({
      supplyAssetsUsd: [{ x: now, y: 120 }],
      borrowAssetsUsd: [{ x: now, y: 60 }],
      utilization: [{ x: now, y: 0.5 }],
    });

    expect(result.status).toBe("partial");
    expect(result.metrics.supply_usd).toBe(120);
    expect(result.metrics.borrow_usd).toBe(60);
    expect(result.metrics.supply_change_7d_pct).toBeNull();
    expect(result.metrics.borrow_change_7d_pct).toBeNull();
    expect(result.metrics.utilisation_change_7d).toBeNull();
    expect(result.metrics.history_covered_market_count).toBe(0);
    expect(result.gaps.map((gap) => gap.code)).toContain("morpho-api:history_coverage_gap");
  });

  it("keeps utilisation change null when baseline supply is zero", async () => {
    const now = Math.floor(new Date("2026-08-30T00:00:00.000Z").getTime() / 1_000);
    const result = await resultForHistory({
      supplyAssetsUsd: [{ x: now, y: 120 }, { x: now - 7 * 86_400, y: 0 }],
      borrowAssetsUsd: [{ x: now, y: 60 }, { x: now - 7 * 86_400, y: 0 }],
      utilization: [{ x: now, y: 0.5 }, { x: now - 7 * 86_400, y: 0 }],
    });

    expect(result.metrics.supply_usd).toBe(120);
    expect(result.metrics.borrow_usd).toBe(60);
    expect(result.metrics.utilisation_change_7d).toBeNull();
    expect(result.gaps.map((gap) => gap.code)).toContain("morpho-api:history_baseline_zero");
  });

  it("keeps utilisation change null when current supply is zero", async () => {
    const now = Math.floor(new Date("2026-08-30T00:00:00.000Z").getTime() / 1_000);
    const result = await resultForHistory({
      supplyAssetsUsd: [{ x: now, y: 0 }, { x: now - 7 * 86_400, y: 100 }],
      borrowAssetsUsd: [{ x: now, y: 0 }, { x: now - 7 * 86_400, y: 40 }],
      utilization: [{ x: now, y: 0 }, { x: now - 7 * 86_400, y: 0.4 }],
    }, 200, {
      supplyAssetsUsd: 0,
      borrowAssetsUsd: 0,
      liquidityAssetsUsd: 0,
      utilization: 0,
    });

    expect(result.metrics.supply_usd).toBe(0);
    expect(result.metrics.borrow_usd).toBe(0);
    expect(result.metrics.utilisation_change_7d).toBeNull();
    expect(result.gaps.map((gap) => gap.code)).toContain("morpho-api:history_utilisation_denominator_zero");
  });

  it("rejects conflicting values at one Morpho history timestamp", async () => {
    const now = Math.floor(new Date("2026-08-30T00:00:00.000Z").getTime() / 1_000);
    const result = await resultForHistory({
      supplyAssetsUsd: [
        { x: now, y: 120 },
        { x: now, y: 121 },
        { x: now - 7 * 86_400, y: 100 },
      ],
      borrowAssetsUsd: [{ x: now, y: 60 }, { x: now - 7 * 86_400, y: 40 }],
      utilization: [{ x: now, y: 0.5 }, { x: now - 7 * 86_400, y: 0.4 }],
    });

    expect(result.status).toBe("partial");
    expect(result.metrics.supply_change_7d_pct).toBeNull();
    expect(result.gaps.map((gap) => gap.code)).toContain("morpho-api:history_duplicate_timestamp_conflict");
  });

  it("rejects out-of-range historical utilisation", async () => {
    const now = Math.floor(new Date("2026-08-30T00:00:00.000Z").getTime() / 1_000);
    const result = await resultForHistory({
      supplyAssetsUsd: [{ x: now, y: 120 }, { x: now - 7 * 86_400, y: 100 }],
      borrowAssetsUsd: [{ x: now, y: 60 }, { x: now - 7 * 86_400, y: 40 }],
      utilization: [{ x: now, y: 1.5 }, { x: now - 7 * 86_400, y: 0.4 }],
    });

    expect(result.status).toBe("partial");
    expect(result.metrics.utilisation_change_7d).toBeNull();
    expect(result.gaps.map((gap) => gap.code)).toContain("morpho-api:history_schema_drift");
  });

  it("preserves current credit when the history request is unavailable", async () => {
    const result = await resultForHistory({}, 503);

    expect(result.status).toBe("partial");
    expect(result.metrics.supply_usd).toBe(120);
    expect(result.metrics.supply_change_7d_pct).toBeNull();
    expect(result.sourceStatus.find((source) => source.source === "morpho-api:market-history:4663")?.status).toBe("unavailable");
    expect(result.gaps.map((gap) => gap.code)).toContain("morpho-api:history_source_access_gap");
  });

  it("batches at most 25 market-history aliases per GraphQL request", async () => {
    const now = Math.floor(new Date("2026-08-30T00:00:00.000Z").getTime() / 1_000);
    const rows = Array.from({ length: 26 }, (_, index) => market(
      index,
      `0x${index.toString(16).padStart(64, "0")}`,
    ));
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as {
        query: string;
        variables: Record<string, unknown>;
      };
      if (request.query.includes("RobinhoodChainMarketHistory")) {
        const marketVariables = Object.entries(request.variables)
          .filter(([key]) => key.startsWith("marketId"));
        expect(marketVariables.length).toBeLessThanOrEqual(25);
        return response({
          data: Object.fromEntries(marketVariables.map(([, marketId], index) => [
            `market${index}`,
            {
              marketId,
              historicalState: {
                supplyAssetsUsd: [{ x: now, y: 1 }, { x: now - 7 * 86_400, y: 1 }],
                borrowAssetsUsd: [{ x: now, y: 0.5 }, { x: now - 7 * 86_400, y: 0.5 }],
                utilization: [{ x: now, y: 0.5 }, { x: now - 7 * 86_400, y: 0.5 }],
              },
            },
          ])),
        });
      }
      return response({
        data: {
          markets: {
            items: rows,
            pageInfo: { count: rows.length, countTotal: rows.length, limit: 100, skip: 0 },
          },
        },
      });
    });

    const result = await fetchRobinhoodChainMorpho(
      makeContext({ env: loadEnv({}), fetchImpl: fetchImpl as typeof fetch }),
      new Date("2026-08-30T00:00:00.000Z"),
    );

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(result.status).toBe("valid");
    expect(result.metrics.history_market_count).toBe(26);
    expect(result.metrics.history_covered_market_count).toBe(26);
  });

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
    expect(result.status).toBe("partial");
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

  it.each([1.5, -0.1])("rejects provider utilisation outside [0,1]: %s", async (utilization) => {
    const result = await resultForState({
      supplyAssetsUsd: 100,
      borrowAssetsUsd: 50,
      liquidityAssetsUsd: 50,
      utilization,
    });

    expect(result.status).toBe("partial");
    expect(result.metrics.utilisation).toBeNull();
    expect(result.metrics.high_utilisation_market_count).toBeNull();
    expect(result.gaps.map((gap) => gap.code)).toContain("morpho-api:utilisation_out_of_range");
  });

  it("fails closed when borrow materially exceeds positive supply", async () => {
    const result = await resultForState({
      supplyAssetsUsd: 100,
      borrowAssetsUsd: 101,
      liquidityAssetsUsd: 0,
      utilization: 1,
    });

    expect(result.status).toBe("partial");
    expect(result.metrics.supply_usd).toBe(100);
    expect(result.metrics.borrow_usd).toBe(101);
    expect(result.metrics.utilisation).toBeNull();
    expect(result.gaps.map((gap) => gap.code)).toContain("morpho-api:utilisation_inconsistent");
  });

  it("fails closed when supply is zero but borrow is positive", async () => {
    const result = await resultForState({
      supplyAssetsUsd: 0,
      borrowAssetsUsd: 1,
      liquidityAssetsUsd: 0,
      utilization: 1,
    });

    expect(result.status).toBe("partial");
    expect(result.metrics.utilisation).toBeNull();
    expect(result.gaps.map((gap) => gap.code)).toContain("morpho-api:utilisation_inconsistent");
  });

  it("accepts a borrow excess within the explicit positive-supply rounding tolerance", async () => {
    const result = await resultForState({
      supplyAssetsUsd: 100,
      borrowAssetsUsd: 100.000_000_05,
      liquidityAssetsUsd: 0,
      utilization: 1,
    });

    expect(result.status).toBe("partial");
    expect(result.metrics.utilisation).toBe(1);
    expect(result.gaps.map((gap) => gap.code)).not.toContain("morpho-api:utilisation_inconsistent");
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
    expect(result.status).toBe("partial");
    expect(result.gaps.map((gap) => gap.code)).toContain("morpho-api:history_limit");
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

    expect(result.status).toBe("partial");
    expect(result.gaps.map((gap) => gap.code)).toContain("morpho-api:history_limit");
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
      expect(fresh.status).toBe("partial");

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
