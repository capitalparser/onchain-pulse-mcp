import { describe, expect, it } from "vitest";
import type { RobinhoodCommunityResult } from "../../src/adapters/robinhood_chain_community.js";
import type { RobinhoodDefiLlamaResult } from "../../src/adapters/robinhood_chain_defillama.js";
import type { RobinhoodMorphoResult } from "../../src/adapters/robinhood_chain_morpho.js";
import { buildRobinhoodChainPulse } from "../../src/robinhood_chain_pulse/metrics.js";
import type { RobinhoodCommunityTokenMarket } from "../../src/robinhood_chain_pulse/types.js";

function fundamentals(overrides: Partial<RobinhoodDefiLlamaResult["metrics"]> = {}): RobinhoodDefiLlamaResult {
  return {
    status: "valid",
    metrics: {
      tvl_usd: 700_000_000,
      tvl_change_1d_pct: 2,
      stablecoin_supply_usd: 750_000_000,
      stablecoin_change_7d_pct: 4,
      dex_volume_24h_usd: 900_000_000,
      dex_volume_7d_usd: 4_000_000_000,
      dex_change_7d_pct: 15,
      app_fees_24h_usd: 5_000_000,
      app_fees_7d_usd: 25_000_000,
      app_fees_change_7d_pct: 10,
      dex_protocol_count: 2,
      fee_protocol_count: 3,
      ...overrides,
    },
    sources: ["defillama:chains"],
    sourceStatus: [],
    stale: false,
    staleData: [],
    gaps: [],
    confidence: 1,
    asOf: "2026-08-30T00:00:00.000Z",
  };
}

function credit(overrides: Partial<RobinhoodMorphoResult["metrics"]> = {}): RobinhoodMorphoResult {
  return {
    status: "valid",
    metrics: {
      listed_market_count: 3,
      active_market_count: 3,
      supply_usd: 100_000_000,
      borrow_usd: 70_000_000,
      liquidity_usd: 30_000_000,
      collateral_usd: 150_000_000,
      utilisation: 0.7,
      high_utilisation_market_count: 0,
      loan_asset_symbols: ["USDG"],
      collateral_asset_symbols: ["WETH"],
      stock_token_collateral_market_count: null,
      ...overrides,
    },
    sources: ["morpho-api:markets:4663"],
    sourceStatus: [],
    stale: false,
    staleData: [],
    gaps: [],
    confidence: 0.9,
    asOf: "2026-08-30T00:00:00.000Z",
  };
}

function token(symbol: string, marketCap: number, liquidity: number, volume: number, change: number): RobinhoodCommunityTokenMarket {
  return {
    registry_symbol: symbol,
    reported_symbol: symbol,
    address: symbol === "CASHCAT"
      ? "0x020bfC650A365f8BB26819deAAbF3E21291018b4"
      : symbol === "STONKBROKER"
        ? "0xe934e36a439c94017b64a3fece66af12099abf50"
        : "0xc72F232a6869e6CF34dC06129AfFD07F8a2a246A",
    official_affiliation: false,
    verification_status: symbol === "MANCER" ? "research_candidate" : "project_primary",
    data_status: "complete",
    primary_pair_address: `pair:${symbol}`,
    primary_dex_id: "uniswap",
    price_usd: 1,
    price_change_24h_pct: change,
    market_cap_usd: marketCap,
    fdv_usd: marketCap,
    liquidity_usd: liquidity,
    volume_24h_usd: volume,
    buys_24h: 100,
    sells_24h: 90,
    holder_count: 1_000,
    pair_count: 1,
    market_cap_to_liquidity: marketCap / liquidity,
    volume_to_liquidity: volume / liquidity,
    eligible_for_breadth: true,
    gaps: [],
  };
}

function community(tokens: RobinhoodCommunityTokenMarket[]): RobinhoodCommunityResult {
  return {
    status: "valid",
    tokens,
    sources: ["dexscreener:robinhood:registered-tokens"],
    sourceStatus: [],
    stale: false,
    staleData: [],
    gaps: [],
    confidence: 1,
    asOf: "2026-08-30T00:00:00.000Z",
  };
}

describe("Robinhood Chain Pulse classification", () => {
  it("detects leader-to-beta diffusion without calling community tokens official", () => {
    const snapshot = buildRobinhoodChainPulse({
      lang: "en",
      fundamentals: fundamentals(),
      credit: credit({ supply_usd: 20_000_000, borrow_usd: 8_000_000, utilisation: 0.4 }),
      community: community([
        token("CASHCAT", 100_000_000, 10_000_000, 8_000_000, 15),
        token("STONKBROKER", 30_000_000, 5_000_000, 4_000_000, 8),
        token("MANCER", 10_000_000, 3_000_000, 2_000_000, 5),
      ]),
      now: new Date("2026-08-30T00:00:00.000Z"),
    });
    expect(snapshot.phase).toBe("leader_beta_diffusion");
    expect(snapshot.axes.speculative_breadth.status).toBe("leader_beta_diffusion");
    expect(snapshot.chain.official_chain_token).toBeNull();
    expect(snapshot.chain.community_tokens_are_unaffiliated).toBe(true);
  });

  it("upgrades diffusion to fragile blow-off when valuation and turnover overwhelm liquidity", () => {
    const snapshot = buildRobinhoodChainPulse({
      lang: "en",
      fundamentals: fundamentals(),
      credit: credit(),
      community: community([
        token("CASHCAT", 1_000_000_000, 5_000_000, 40_000_000, 30),
        token("STONKBROKER", 100_000_000, 1_000_000, 8_000_000, 12),
        token("MANCER", 50_000_000, 500_000, 4_000_000, 8),
      ]),
      now: new Date("2026-08-30T00:00:00.000Z"),
    });
    expect(snapshot.axes.fragility.status).toBe("high");
    expect(snapshot.phase).toBe("fragile_blowoff");
  });

  it("distinguishes a leader-only move from broad beta diffusion", () => {
    const snapshot = buildRobinhoodChainPulse({
      lang: "en",
      fundamentals: fundamentals(),
      credit: credit({ supply_usd: 1_000_000, borrow_usd: 100_000, utilisation: 0.1 }),
      community: community([
        token("CASHCAT", 100_000_000, 10_000_000, 4_000_000, 20),
        token("STONKBROKER", 30_000_000, 5_000_000, 1_000_000, -3),
        token("MANCER", 10_000_000, 3_000_000, 500_000, -5),
      ]),
      now: new Date("2026-08-30T00:00:00.000Z"),
    });
    expect(snapshot.axes.speculative_breadth.status).toBe("leader_only");
    expect(snapshot.phase).toBe("leader_concentration");
  });

  it("does not classify leader-beta diffusion when explorer gating leaves only two eligible tokens", () => {
    const unverified = {
      ...token("MANCER", 10_000_000, 3_000_000, 2_000_000, 9),
      data_status: "partial" as const,
      holder_count: null,
      eligible_for_breadth: false,
    };
    const snapshot = buildRobinhoodChainPulse({
      lang: "en",
      fundamentals: fundamentals(),
      credit: credit({ supply_usd: 20_000_000, borrow_usd: 8_000_000, utilisation: 0.4 }),
      community: community([
        token("CASHCAT", 100_000_000, 10_000_000, 8_000_000, 15),
        token("STONKBROKER", 30_000_000, 5_000_000, 4_000_000, 8),
        unverified,
      ]),
      now: new Date("2026-08-30T00:00:00.000Z"),
    });

    expect(snapshot.breadth.eligible_count).toBe(2);
    expect(snapshot.axes.speculative_breadth.status).not.toBe("leader_beta_diffusion");
    expect(snapshot.phase).not.toBe("leader_beta_diffusion");
  });

  it("does not call stablecoin capital formation credit activation without borrowing utilisation", () => {
    const snapshot = buildRobinhoodChainPulse({
      lang: "en",
      fundamentals: fundamentals(),
      credit: credit({
        listed_market_count: 0,
        active_market_count: 0,
        supply_usd: 0,
        borrow_usd: 0,
        liquidity_usd: 0,
        collateral_usd: 0,
        utilisation: 0,
      }),
      community: community([]),
      now: new Date("2026-08-30T00:00:00.000Z"),
    });
    expect(snapshot.axes.capital_base.status).toBe("expanding");
    expect(snapshot.axes.credit_activation.status).toBe("inactive");
    expect(snapshot.phase).toBe("capital_formation");
  });
});
