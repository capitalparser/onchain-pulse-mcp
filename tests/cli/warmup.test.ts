import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runWarmup } from "../../src/cli/warmup.js";
import { makeFileHistoryStore } from "../../src/pulse/history.js";

let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "opm-warmup-"));
  path = join(dir, "history.json");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("runWarmup", () => {
  it("seeds at least one datapoint per supported key with mocked adapter responses", async () => {
    const fakeFetcher = {
      etfHistory: vi.fn().mockResolvedValue([
        { asOf: new Date("2026-05-10T00:00:00Z"), value: 100_000_000 },
        { asOf: new Date("2026-05-11T00:00:00Z"), value: 120_000_000 },
      ]),
      stablecoinHistory: vi.fn().mockResolvedValue([{ asOf: new Date("2026-05-10T00:00:00Z"), value: 0.001 }]),
    };

    const result = await runWarmup({ historyPath: path, days: 30, fetcher: fakeFetcher });
    const store = makeFileHistoryStore({ path, windowDays: 30, dedupHours: 24 });
    const series = store.load();

    expect(result.written.etf_7d_net_flow_btc_eth).toBe(2);
    expect(series.etf_7d_net_flow_btc_eth?.length).toBeGreaterThanOrEqual(1);
    expect(series.stablecoin_7d_supply_delta?.length).toBeGreaterThanOrEqual(1);
  });

  it("respects key filter", async () => {
    const fakeFetcher = {
      etfHistory: vi.fn().mockResolvedValue([{ asOf: new Date("2026-05-10T00:00:00Z"), value: 1 }]),
      stablecoinHistory: vi.fn().mockResolvedValue([{ asOf: new Date("2026-05-10T00:00:00Z"), value: 1 }]),
    };

    await runWarmup({ historyPath: path, days: 30, keys: ["etf_7d_net_flow_btc_eth"], fetcher: fakeFetcher });

    expect(fakeFetcher.etfHistory).toHaveBeenCalled();
    expect(fakeFetcher.stablecoinHistory).not.toHaveBeenCalled();
  });

  it("isolates per-key failures and still saves successful datapoints", async () => {
    const fakeFetcher = {
      etfHistory: vi.fn().mockRejectedValue(new Error("farside down")),
      stablecoinHistory: vi.fn().mockResolvedValue([{ asOf: new Date("2026-05-10T00:00:00Z"), value: 0.001 }]),
    };

    const result = await runWarmup({ historyPath: path, days: 30, fetcher: fakeFetcher });
    const series = makeFileHistoryStore({ path, windowDays: 30, dedupHours: 24 }).load();

    expect(result.failures).toEqual([{ key: "etf_7d_net_flow_btc_eth", reason: "farside down" }]);
    expect(series.stablecoin_7d_supply_delta).toEqual([0.001]);
  });
});
