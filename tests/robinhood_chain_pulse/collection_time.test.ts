import { describe, expect, it, vi } from "vitest";
import type { RobinhoodCommunityResult } from "../../src/adapters/robinhood_chain_community.js";
import type { RobinhoodDefiLlamaResult } from "../../src/adapters/robinhood_chain_defillama.js";
import type { RobinhoodMorphoResult } from "../../src/adapters/robinhood_chain_morpho.js";
import { loadEnv } from "../../src/env.js";
import type { MetricObservationStore } from "../../src/intelligence_core/store.js";
import { MetricObservationSchema, type MetricObservation } from "../../src/intelligence_core/types.js";
import {
  runRobinhoodChainCollectionOnce,
  type RobinhoodChainCollectorOptions,
} from "../../src/robinhood_chain_pulse/history.js";

const START = "2026-09-04T00:00:00.000Z";
const INGESTED = "2026-09-04T00:01:00.000Z";
const COMPLETED = "2026-09-04T00:05:00.000Z";

// Controlled source evidence; the real domain, mapper, and schema stay in the path.
function sources(now: () => Date): RobinhoodChainCollectorOptions {
  const quality = {
    status: "valid" as const, stale: false, staleData: [], gaps: [],
    confidence: 0.9, asOf: START, sources: [], sourceStatus: [],
  };
  const fundamentals: RobinhoodDefiLlamaResult = { ...quality, metrics: {
    tvl_usd: 100, tvl_change_1d_pct: 2, stablecoin_supply_usd: 500,
    stablecoin_change_7d_pct: 3, dex_volume_24h_usd: 50, dex_volume_7d_usd: 250,
    dex_change_7d_pct: 12, app_fees_24h_usd: 0, app_fees_7d_usd: 20,
    app_fees_change_7d_pct: 5, dex_protocol_count: 2, fee_protocol_count: 1,
  } };
  const credit: RobinhoodMorphoResult = { ...quality, metrics: {
    listed_market_count: 1, active_market_count: 1, supply_usd: 100,
    borrow_usd: 50, liquidity_usd: 50, collateral_usd: 200, utilisation: 0.5,
    high_utilisation_market_count: 0, supply_change_7d_pct: 4,
    borrow_change_7d_pct: 6, utilisation_change_7d: 0.02,
    history_market_count: 1, history_covered_market_count: 1,
    unique_borrowers_change_7d_pct: null, loan_asset_symbols: ["USDG"],
    collateral_asset_symbols: ["WETH"], stock_token_collateral_market_count: null,
  } };
  const community: RobinhoodCommunityResult = { ...quality, status: "partial", tokens: [] };
  return {
    now,
    fetchImpl: vi.fn(async () => { throw new Error("unexpected_network_call"); }) as typeof fetch,
    fetchFundamentals: async () => fundamentals,
    fetchCredit: async () => credit,
    fetchCommunity: async () => community,
  };
}

function clock(...times: string[]) {
  let index = 0;
  return vi.fn(() => new Date(times[Math.min(index++, times.length - 1)]!));
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((accept) => { resolve = accept; });
  return { promise, resolve };
}

function memoryStore(write: (rows: readonly MetricObservation[]) => Promise<void>, bulk: boolean) {
  const rows: MetricObservation[] = [];
  const persist = async (batch: readonly MetricObservation[]) => {
    batch.forEach((row) => MetricObservationSchema.parse(row));
    await write(batch);
    rows.push(...batch);
  };
  const store: MetricObservationStore = {
    readAll: async () => [...rows],
    query: async () => { throw new Error("unexpected_query"); },
    append: (row) => persist([row]),
    ...(bulk ? { appendMany: persist } : {}),
  };
  return { store, rows };
}

function collect(store: MetricObservationStore, now: () => Date) {
  return runRobinhoodChainCollectionOnce({ env: loadEnv({}), store, options: sources(now) });
}

describe("Robinhood collection completion time", () => {
  it.each([true, false])("samples completion only after awaited persistence (bulk=%s)", async (bulk) => {
    const entered = deferred();
    const release = deferred();
    const now = clock(START, INGESTED, COMPLETED);
    const { store, rows } = memoryStore(async () => {
      entered.resolve();
      await release.promise;
    }, bulk);
    let settled = false;
    const pending = collect(store, now).then((result) => { settled = true; return result; });
    await entered.promise;
    expect(now).toHaveBeenCalledTimes(2);
    expect(settled).toBe(false);
    release.resolve();
    const result = await pending;
    expect(result.started_at).toBe(START);
    expect(result.snapshot_as_of).toBe(START);
    expect(result.completed_at).toBe(COMPLETED);
    expect(now).toHaveBeenCalledTimes(3);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.ingested_at === INGESTED)).toBe(true);
    expect(rows.every((row) => row.observed_at === START)).toBe(true);
    expect(result.emitted_observation_count).toBe(rows.length);
  });

  it.each([true, false])("does not publish completion after a write failure (bulk=%s)", async (bulk) => {
    const now = clock(START, INGESTED, COMPLETED);
    const { store, rows } = memoryStore(async () => { throw new Error("storage_failed"); }, bulk);
    await expect(collect(store, now)).rejects.toThrow("storage_failed");
    expect(now).toHaveBeenCalledTimes(2);
    expect(rows).toEqual([]);
  });

  it("does not report completion if a later append fails after a persisted prefix", async () => {
    const now = clock(START, INGESTED, COMPLETED);
    let writes = 0;
    const { store, rows } = memoryStore(async () => {
      if (++writes === 2) throw new Error("later_append_failed");
    }, false);
    await expect(collect(store, now)).rejects.toThrow("later_append_failed");
    expect(now).toHaveBeenCalledTimes(2);
    expect(rows).toHaveLength(1); // No rollback is promised by an append-only custom store.
  });

  it("does not report completion when the existing-history read fails", async () => {
    const now = clock(START, INGESTED, COMPLETED);
    const write = vi.fn(async () => {});
    const { store } = memoryStore(write, true);
    store.readAll = async () => { throw new Error("history_read_failed"); };
    await expect(collect(store, now)).rejects.toThrow("history_read_failed");
    expect(now).toHaveBeenCalledTimes(2);
    expect(write).not.toHaveBeenCalled();
  });

  it("preserves original ingestion and IDs on an idempotent retry while recording a new completion", async () => {
    const { store, rows } = memoryStore(async () => {}, true);
    const first = await collect(store, clock(START, INGESTED, COMPLETED));
    const saved = JSON.stringify(rows);
    const later = "2026-09-04T00:10:00.000Z";
    const retried = await collect(store, clock(START, COMPLETED, later));
    expect(retried.completed_at).toBe(later);
    expect(retried.emitted_observation_count).toBe(0);
    expect(retried.skipped_duplicate_ids).toEqual(first.emitted_observation_ids);
    expect(JSON.stringify(rows)).toBe(saved);
  });

  it.each(["invalid", "2026-09-03T23:59:59Z"])("rejects invalid/backwards ingestion before writing: %s", async (time) => {
    const write = vi.fn(async () => {});
    const { store, rows } = memoryStore(write, true);
    await expect(collect(store, clock(START, time))).rejects.toThrow("robinhood_collection_clock_invalid");
    expect(write).not.toHaveBeenCalled();
    expect(rows).toEqual([]);
  });

  it("rejects an invalid initial clock before fetching", async () => {
    const { store } = memoryStore(async () => {}, true);
    const options = sources(clock("invalid"));
    const fetchFundamentals = vi.fn(options.fetchFundamentals!);
    await expect(runRobinhoodChainCollectionOnce({
      env: loadEnv({}), store, options: { ...options, fetchFundamentals },
    })).rejects.toThrow("robinhood_collection_clock_invalid");
    expect(fetchFundamentals).not.toHaveBeenCalled();
  });

  it.each(["invalid", START])("rejects an invalid/backwards completion without claiming rollback: %s", async (time) => {
    const { store, rows } = memoryStore(async () => {}, true);
    await expect(collect(store, clock(START, INGESTED, time))).rejects.toThrow("robinhood_collection_clock_invalid");
    expect(rows.length).toBeGreaterThan(0); // A receipt failure does not undo completed I/O.
    expect(rows.every((row) => row.ingested_at === INGESTED)).toBe(true);
  });

  it("copies samples from an injected clock that reuses a mutable Date", async () => {
    const date = new Date(START);
    const times = [START, INGESTED, COMPLETED];
    let index = 0;
    const now = () => { date.setTime(Date.parse(times[index++]!)); return date; };
    const { store, rows } = memoryStore(async () => {}, true);
    const result = await collect(store, now);
    expect(result.started_at).toBe(START);
    expect(result.completed_at).toBe(COMPLETED);
    expect(rows.every((row) => row.observed_at === START && row.ingested_at === INGESTED)).toBe(true);
  });
});
