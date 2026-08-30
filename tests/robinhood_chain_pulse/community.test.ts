import { describe, expect, it, vi } from "vitest";
import { makeContext } from "../../src/adapters/base.js";
import {
  ROBINHOOD_DEXSCREENER_URL,
  fetchRobinhoodChainCommunity,
} from "../../src/adapters/robinhood_chain_community.js";
import { loadEnv } from "../../src/env.js";
import { ROBINHOOD_COMMUNITY_TOKEN_UNIVERSE } from "../../src/robinhood_chain_pulse/registry.js";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function pair(args: {
  address: string;
  symbol: string;
  pairAddress: string;
  liquidity: number;
  volume: number;
  marketCap: number;
  change: number;
}) {
  return {
    chainId: "robinhood",
    dexId: "uniswap",
    pairAddress: args.pairAddress,
    baseToken: { address: args.address, symbol: args.symbol },
    quoteToken: { address: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73", symbol: "WETH" },
    priceUsd: "0.01",
    priceChange: { h24: args.change },
    marketCap: args.marketCap,
    fdv: args.marketCap,
    liquidity: { usd: args.liquidity },
    volume: { h24: args.volume },
    txns: { h24: { buys: 100, sells: 80 } },
  };
}

function fetchFixture() {
  const [cashcat, stonk, mancer] = ROBINHOOD_COMMUNITY_TOKEN_UNIVERSE;
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url === ROBINHOOD_DEXSCREENER_URL) {
      return response([
        pair({
          address: cashcat!.address,
          symbol: "CASHCAT",
          pairAddress: "0xpair-cash-low",
          liquidity: 30_000,
          volume: 90_000,
          marketCap: 10_000_000,
          change: 20,
        }),
        pair({
          address: cashcat!.address,
          symbol: "CASHCAT",
          pairAddress: "0xpair-cash-primary",
          liquidity: 300_000,
          volume: 600_000,
          marketCap: 50_000_000,
          change: 20,
        }),
        pair({
          address: stonk!.address,
          symbol: "STONKBROKER",
          pairAddress: "0xpair-stonk",
          liquidity: 100_000,
          volume: 150_000,
          marketCap: 10_000_000,
          change: 8,
        }),
        pair({
          address: mancer!.address,
          symbol: "MANCER",
          pairAddress: "0xpair-mancer",
          liquidity: 50_000,
          volume: 60_000,
          marketCap: 5_000_000,
          change: 5,
        }),
        pair({
          address: "0x0000000000000000000000000000000000000001",
          symbol: "CASHCAT",
          pairAddress: "0xfake-ticker-pair",
          liquidity: 9_000_000,
          volume: 9_000_000,
          marketCap: 9_000_000_000,
          change: 9_000,
        }),
      ]);
    }
    const token = ROBINHOOD_COMMUNITY_TOKEN_UNIVERSE.find(
      (candidate) => url.toLowerCase().endsWith(candidate.address.toLowerCase()),
    );
    if (token !== undefined) {
      return response({ symbol: token.symbol, holders_count: 1_000 });
    }
    return response({}, 404);
  });
}

describe("Robinhood Chain community-token adapter", () => {
  it("uses only exact registered addresses and chooses the most liquid pool", async () => {
    const result = await fetchRobinhoodChainCommunity(
      makeContext({ env: loadEnv({}), fetchImpl: fetchFixture() as typeof fetch }),
      new Date("2026-08-30T00:00:00.000Z"),
    );
    expect(result.status).toBe("valid");
    expect(result.tokens).toHaveLength(3);
    const cashcat = result.tokens.find((token) => token.registry_symbol === "CASHCAT");
    expect(cashcat?.primary_pair_address).toBe("0xpair-cash-primary");
    expect(cashcat?.liquidity_usd).toBe(300_000);
    expect(cashcat?.market_cap_usd).toBe(50_000_000);
    expect(cashcat?.pair_count).toBe(2);
    expect(cashcat?.eligible_for_breadth).toBe(true);
    expect(result.tokens.some((token) => token.address.endsWith("0001"))).toBe(false);
  });

  it("excludes a registry-symbol mismatch from breadth", async () => {
    const base = fetchFixture();
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const stonk = ROBINHOOD_COMMUNITY_TOKEN_UNIVERSE.find((token) => token.symbol === "STONKBROKER")!;
      if (url.toLowerCase().endsWith(stonk.address.toLowerCase())) {
        return response({ symbol: "FAKE", holders_count: 10_000 });
      }
      return base(input);
    });
    const result = await fetchRobinhoodChainCommunity(
      makeContext({ env: loadEnv({}), fetchImpl: fetchImpl as typeof fetch }),
      new Date("2026-08-30T00:00:00.000Z"),
    );
    const stonk = result.tokens.find((token) => token.registry_symbol === "STONKBROKER");
    expect(stonk?.data_status).toBe("registry_mismatch");
    expect(stonk?.eligible_for_breadth).toBe(false);
  });

  it("keeps explorer failure partial and excludes the unverified token from breadth", async () => {
    const base = fetchFixture();
    const cashcat = ROBINHOOD_COMMUNITY_TOKEN_UNIVERSE.find((token) => token.symbol === "CASHCAT")!;
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.toLowerCase().endsWith(cashcat.address.toLowerCase())) return response({}, 503);
      return base(input);
    });
    const result = await fetchRobinhoodChainCommunity(
      makeContext({ env: loadEnv({}), fetchImpl: fetchImpl as typeof fetch }),
      new Date("2026-08-30T00:00:00.000Z"),
    );
    const row = result.tokens.find((token) => token.registry_symbol === "CASHCAT");
    expect(row?.holder_count).toBeNull();
    expect(row?.primary_pair_address).not.toBeNull();
    expect(row?.data_status).toBe("partial");
    expect(row?.eligible_for_breadth).toBe(false);
    expect(result.status).toBe("partial");
  });

  it("fails closed when DexScreener is unavailable", async () => {
    const result = await fetchRobinhoodChainCommunity(
      makeContext({
        env: loadEnv({}),
        fetchImpl: vi.fn(async () => response({}, 503)) as typeof fetch,
      }),
      new Date("2026-08-30T00:00:00.000Z"),
    );
    expect(result.status).toBe("unavailable");
    expect(result.tokens.every((token) => token.market_cap_usd === null)).toBe(true);
    expect(result.tokens.every((token) => token.eligible_for_breadth === false)).toBe(true);
  });

  it("returns marked stale data after the cache TTL when the market refresh fails", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-08-30T00:00:00.000Z"));
      const liveFetch = fetchFixture();
      let refreshFails = false;
      const fetchImpl = vi.fn(async (input: string | URL | Request) => (
        refreshFails ? response({}, 503) : liveFetch(input)
      ));
      const ctx = makeContext({ env: loadEnv({}), fetchImpl: fetchImpl as typeof fetch });

      const fresh = await fetchRobinhoodChainCommunity(ctx, new Date());
      expect(fresh.status).toBe("valid");

      refreshFails = true;
      vi.advanceTimersByTime(5 * 60_000 + 1);
      const stale = await fetchRobinhoodChainCommunity(ctx, new Date());

      expect(stale.status).toBe("partial");
      expect(stale.stale).toBe(true);
      expect(stale.tokens.filter((token) => token.eligible_for_breadth)).toHaveLength(3);
      expect(stale.staleData).toContain("robinhood-community:stale_cache");
    } finally {
      vi.useRealTimers();
    }
  });
});
