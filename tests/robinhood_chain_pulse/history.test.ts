import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RobinhoodCommunityResult } from "../../src/adapters/robinhood_chain_community.js";
import type { RobinhoodDefiLlamaResult } from "../../src/adapters/robinhood_chain_defillama.js";
import type { RobinhoodMorphoResult } from "../../src/adapters/robinhood_chain_morpho.js";
import type { EnvConfig } from "../../src/env.js";
import { getFeatureDefinition } from "../../src/intelligence_core/feature_registry.js";
import {
  assertCommerciallyRedistributable,
  assertInternalResearchAllowed,
} from "../../src/intelligence_core/source_license.js";
import type { MetricObservation } from "../../src/intelligence_core/types.js";
import {
  ROBINHOOD_CHAIN_COLLECTOR_VERSION,
  metricObservationsFromRobinhoodChain,
  runRobinhoodChainCollectCli,
} from "../../src/robinhood_chain_pulse/history.js";
import { getRobinhoodChainPulse } from "../../src/tools/get_robinhood_chain_pulse.js";
import type { RobinhoodCommunityTokenMarket } from "../../src/robinhood_chain_pulse/types.js";

const AS_OF = "2026-09-04T00:00:00.000Z";
const INGESTED_AT = new Date("2026-09-04T00:01:00.000Z");
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function sourceStatus(source: string, role: string) {
  return { source, role, status: "ok" as const, as_of: AS_OF };
}

function fundamentals(): RobinhoodDefiLlamaResult {
  return {
    status: "valid",
    metrics: {
      tvl_usd: 100,
      tvl_change_1d_pct: 2,
      stablecoin_supply_usd: 500,
      stablecoin_change_7d_pct: 3,
      dex_volume_24h_usd: 50,
      dex_volume_7d_usd: 250,
      dex_change_7d_pct: 12,
      app_fees_24h_usd: 0,
      app_fees_7d_usd: 20,
      app_fees_change_7d_pct: 5,
      dex_protocol_count: 2,
      fee_protocol_count: 1,
    },
    sources: [
      "defillama:chains",
      "defillama-stablecoins:chains",
      "defillama-stablecoins:history",
      "defillama:dexs:robinhood-chain",
      "defillama:fees:robinhood-chain",
    ],
    sourceStatus: [
      sourceStatus("defillama:chains", "TVL"),
      sourceStatus("defillama-stablecoins:chains", "stablecoin stock"),
      sourceStatus("defillama-stablecoins:history", "stablecoin history"),
      sourceStatus("defillama:dexs:robinhood-chain", "DEX"),
      sourceStatus("defillama:fees:robinhood-chain", "fees"),
    ],
    stale: false,
    staleData: [],
    gaps: [],
    confidence: 0.9,
    asOf: AS_OF,
  };
}

function credit(): RobinhoodMorphoResult {
  return {
    status: "valid",
    metrics: {
      listed_market_count: 2,
      active_market_count: 2,
      supply_usd: 60_000_000,
      borrow_usd: 42_000_000,
      liquidity_usd: 18_000_000,
      collateral_usd: 75_000_000,
      utilisation: 0.7,
      high_utilisation_market_count: 1,
      supply_change_7d_pct: 4,
      borrow_change_7d_pct: 6,
      utilisation_change_7d: 0.02,
      history_market_count: 2,
      history_covered_market_count: 1,
      unique_borrowers_change_7d_pct: null,
      loan_asset_symbols: ["USDG"],
      collateral_asset_symbols: ["WETH"],
      stock_token_collateral_market_count: null,
    },
    sources: ["morpho-api:markets:4663", "morpho-api:market-history:4663"],
    sourceStatus: [
      sourceStatus("morpho-api:markets:4663", "market levels"),
      sourceStatus("morpho-api:market-history:4663", "market history"),
    ],
    stale: false,
    staleData: [],
    gaps: [],
    confidence: 0.85,
    asOf: AS_OF,
  };
}

function communityToken(args: {
  symbol: string;
  address: string;
  change: number;
  marketCap: number;
}): RobinhoodCommunityTokenMarket {
  return {
    registry_symbol: args.symbol,
    reported_symbol: args.symbol,
    address: args.address,
    official_affiliation: false,
    verification_status: "project_primary_plus_explorer",
    data_status: "complete",
    primary_pair_address: "pair-" + args.symbol,
    primary_dex_id: "test-dex",
    price_usd: 1,
    price_change_24h_pct: args.change,
    market_cap_usd: args.marketCap,
    fdv_usd: args.marketCap,
    liquidity_usd: 100_000,
    volume_24h_usd: 50_000,
    buys_24h: 10,
    sells_24h: 5,
    holder_count: 100,
    pair_count: 1,
    market_cap_to_liquidity: args.marketCap / 100_000,
    volume_to_liquidity: 0.5,
    eligible_for_breadth: true,
    gaps: [],
  };
}

function community(): RobinhoodCommunityResult {
  const tokens = [
    communityToken({
      symbol: "CASHCAT",
      address: "0x020bfC650A365f8BB26819deAAbF3E21291018b4",
      change: 10,
      marketCap: 2_000_000,
    }),
    communityToken({
      symbol: "STONKBROKER",
      address: "0xe934e36a439c94017b64a3fece66af12099abf50",
      change: 4,
      marketCap: 1_000_000,
    }),
  ];
  return {
    status: "valid",
    tokens,
    sources: [
      "dexscreener:robinhood:registered-tokens",
      ...tokens.map((token) => "robinhood-blockscout:token:" + token.address.toLowerCase()),
    ],
    sourceStatus: [
      sourceStatus("dexscreener:robinhood:registered-tokens", "market data"),
      ...tokens.map((token) =>
        sourceStatus(
          "robinhood-blockscout:token:" + token.address.toLowerCase(),
          "exact-address verification",
        )
      ),
    ],
    stale: false,
    staleData: [],
    gaps: [],
    confidence: 0.8,
    asOf: AS_OF,
  };
}

function input(overrides: {
  fundamentals?: RobinhoodDefiLlamaResult;
  credit?: RobinhoodMorphoResult;
  community?: RobinhoodCommunityResult;
} = {}) {
  const familyResults = {
    fundamentals: overrides.fundamentals ?? fundamentals(),
    credit: overrides.credit ?? credit(),
    community: overrides.community ?? community(),
  };
  return {
    ...familyResults,
    snapshot: getRobinhoodChainPulse({
      lang: "en",
      ...familyResults,
      now: new Date(AS_OF),
    }),
  };
}

function observations(
  value = input(),
  methodologyVersion?: string,
): MetricObservation[] {
  return metricObservationsFromRobinhoodChain(value, INGESTED_AT, methodologyVersion);
}

function metric(rows: MetricObservation[], key: string): MetricObservation | undefined {
  return rows.find((row) => row.metric_key === key);
}

function env(path: string): EnvConfig {
  return {
    byok: {},
    lang: "en",
    historyPath: join(path, "legacy-history.json"),
    intelligenceHistoryPath: join(path, "intelligence-history.jsonl"),
  };
}

function sequence(...timestamps: string[]): () => Date {
  let index = 0;
  return () => new Date(timestamps[Math.min(index++, timestamps.length - 1)]!);
}

describe("Robinhood Chain canonical history mapping", () => {
  it("uses metric-scoped sources and preserves null versus real zero", () => {
    const capital = fundamentals();
    capital.metrics.stablecoin_supply_usd = null;
    const rows = observations(input({ fundamentals: capital }));

    expect(metric(rows, "robinhood_chain.stablecoin_supply_usd")).toBeUndefined();
    expect(metric(rows, "robinhood_chain.app_fees_24h_usd")?.value).toBe(0);
    expect(metric(rows, "robinhood_chain.app_fees_24h_usd")?.source_refs)
      .toEqual(["defillama:fees:robinhood-chain"]);
    expect(metric(rows, "robinhood_chain.tvl_usd")?.source_refs)
      .toEqual(["defillama:chains"]);
    expect(metric(rows, "robinhood_chain.morpho_supply_change_7d_pct")?.source_refs)
      .toEqual(["morpho-api:market-history:4663"]);
    expect(metric(rows, "robinhood_chain.morpho_history_coverage_ratio")?.value).toBe(0.5);
    expect(rows.some((row) => row.metric_key.includes("unique_borrowers"))).toBe(false);

    const communityRefs = metric(rows, "robinhood_chain.community_positive_24h_share")?.source_refs ?? [];
    expect(communityRefs).toContain("dexscreener:robinhood:registered-tokens");
    expect(communityRefs).toContain(
      "robinhood-blockscout:token:0x020bfc650a365f8bb26819deaabf3e21291018b4",
    );
    expect(communityRefs).not.toContain("morpho-api:markets:4663");
  });

  it("creates revision-safe IDs for value or methodology changes", () => {
    const original = observations();
    const changedCapital = fundamentals();
    changedCapital.metrics.tvl_usd = 101;
    const changed = observations(input({ fundamentals: changedCapital }));
    const changedMethod = observations(input(), "robinhood-chain-history-v2");

    expect(metric(original, "robinhood_chain.tvl_usd")?.id)
      .not.toBe(metric(changed, "robinhood_chain.tvl_usd")?.id);
    expect(metric(original, "robinhood_chain.tvl_usd")?.id)
      .not.toBe(metric(changedMethod, "robinhood_chain.tvl_usd")?.id);
    expect(observations().map((row) => row.id)).toEqual(original.map((row) => row.id));
  });

  it("keeps gaps and staleness as quality metadata without changing semantic identity", () => {
    const fresh = observations();
    const stale = fundamentals();
    stale.status = "partial";
    stale.stale = true;
    stale.staleData = ["defillama:stale_cache"];
    stale.gaps = [{ code: "defillama:stale_cache", detail: "bounded stale fallback" }];
    const staleRows = observations(input({ fundamentals: stale }));

    const freshTvl = metric(fresh, "robinhood_chain.tvl_usd");
    const staleTvl = metric(staleRows, "robinhood_chain.tvl_usd");
    expect(staleTvl?.dimensions.source_stale).toBe("true");
    expect(staleTvl?.dimensions.source_gap_001).toBe("defillama:stale_cache");
    expect(staleTvl?.id).toBe(freshTvl?.id);
  });

  it("encodes every discrete state as one-hot and never persists ETH capture", () => {
    const rows = observations();
    const prefixes = [
      "robinhood_chain.status.capital_base.",
      "robinhood_chain.status.current_credit.",
      "robinhood_chain.status.speculative_breadth.",
      "robinhood_chain.status.fragility.",
      "robinhood_chain.status.overall_phase.",
    ];
    for (const prefix of prefixes) {
      const values = rows.filter((row) => row.metric_key.startsWith(prefix)).map((row) => row.value);
      expect(values.length).toBeGreaterThan(1);
      expect(values.every((value) => value === 0 || value === 1)).toBe(true);
      expect(values.reduce((sum, value) => sum + value, 0)).toBe(1);
    }
    expect(rows.some((row) => row.metric_key.includes("eth_capture"))).toBe(false);
  });

  it("registers all emitted features as forward-only and point-in-time safe", () => {
    for (const row of observations()) {
      const definition = getFeatureDefinition(row.metric_key);
      expect(definition?.backfill).toBe("forward_only");
      expect(definition?.point_in_time_safe).toBe(true);
    }
  });

  it("fails closed for unknown collection sources and commercial redistribution", () => {
    const row = observations()[0]!;
    expect(() => assertInternalResearchAllowed([{ ...row, source_refs: ["unknown-provider:test"] }]))
      .toThrow(/blocked by source licensing/);
    expect(() => assertCommerciallyRedistributable([row]))
      .toThrow(/commercial redistribution blocked/);
  });
});

describe("Robinhood Chain one-cycle collector", () => {
  it("fetches each family once, writes JSONL, and reports deterministic summary fields", async () => {
    const directory = await mkdtemp(join(tmpdir(), "opm-robinhood-history-"));
    temporaryDirectories.push(directory);
    const calls = { defillama: 0, morpho: 0, community: 0 };
    const options = {
      now: sequence(AS_OF, "2026-09-04T00:01:00.000Z"),
      fetchFundamentals: async () => { calls.defillama += 1; return fundamentals(); },
      fetchCredit: async () => { calls.morpho += 1; return credit(); },
      fetchCommunity: async () => { calls.community += 1; return community(); },
    };

    const first = await runRobinhoodChainCollectCli(env(directory), options);
    expect(calls).toEqual({ defillama: 1, morpho: 1, community: 1 });
    expect(first.mode).toBe("robinhood-chain-collect");
    expect(first.collector_version).toBe(ROBINHOOD_CHAIN_COLLECTOR_VERSION);
    expect(first.methodology_version).toBe("robinhood-chain-history-v1");
    expect(first.started_at).toBe(AS_OF);
    expect(first.completed_at).toBe("2026-09-04T00:01:00.000Z");
    expect(first.snapshot_as_of).toBe(AS_OF);
    expect(first.emitted_observation_count).toBe(50);
    expect(first.skipped_duplicate_count).toBe(0);
    expect(first.distribution_scope).toBe("internal_research_only");
    const lines = (await readFile(env(directory).intelligenceHistoryPath!, "utf8"))
      .trim().split("\n");
    expect(lines).toHaveLength(50);
    expect(JSON.parse(lines[0]!).ingested_at).toBe("2026-09-04T00:01:00.000Z");

    const second = await runRobinhoodChainCollectCli(env(directory), {
      ...options,
      now: sequence(AS_OF, "2026-09-04T00:02:00.000Z"),
    });
    expect(second.emitted_observation_count).toBe(0);
    expect(second.skipped_duplicate_count).toBe(50);
    expect((await readFile(env(directory).intelligenceHistoryPath!, "utf8")).trim().split("\n"))
      .toHaveLength(50);
  });

  it("retains family stale and gap summaries without detailed provider errors", async () => {
    const directory = await mkdtemp(join(tmpdir(), "opm-robinhood-stale-"));
    temporaryDirectories.push(directory);
    const staleCommunity = community();
    staleCommunity.status = "partial";
    staleCommunity.stale = true;
    staleCommunity.staleData = ["robinhood-community:stale_cache"];
    staleCommunity.gaps = [{
      code: "robinhood-community:stale_cache",
      detail: "sensitive upstream exception must not be persisted",
    }];
    const result = await runRobinhoodChainCollectCli(env(directory), {
      now: sequence(AS_OF, "2026-09-04T00:01:00.000Z"),
      fetchFundamentals: async () => fundamentals(),
      fetchCredit: async () => credit(),
      fetchCommunity: async () => staleCommunity,
    });

    expect(result.status).toBe("partial");
    expect(result.stale_families).toEqual(["community"]);
    expect(result.gaps).toContain("robinhood-community:stale_cache");
    const persisted = await readFile(env(directory).intelligenceHistoryPath!, "utf8");
    expect(persisted).not.toContain("sensitive upstream exception");
  });
});
