import { afterEach, describe, expect, it, vi } from "vitest";
import { makeContext } from "../../src/adapters/base.js";
import { fetchGrowThePieEcosystemCapture } from "../../src/adapters/eth_ecosystem_growthepie.js";
import { loadEnv } from "../../src/env.js";
import { shiftUtcDay } from "../../src/eth_value_capture/metrics.js";

const CUTOFF = "2026-07-31";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function masterBody(): Record<string, unknown> {
  return {
    chains: {
      ethereum: {
        chain_type: "l1",
        deployment: "PROD",
        da_layer: null,
        launch_date: "2015-07-30",
        supported_metrics: ["fees", "stables_mcap"],
      },
      arbitrum: {
        chain_type: "rollup",
        deployment: "PROD",
        da_layer: "Ethereum (blobs)",
        launch_date: "2021-08-31",
        supported_metrics: ["fees", "rent_paid", "stables_mcap"],
      },
      base: {
        chain_type: "rollup",
        deployment: "PROD",
        da_layer: "Ethereum (blobs)",
        launch_date: "2023-08-09",
        supported_metrics: ["fees", "rent_paid", "stables_mcap"],
      },
      arbitrum_nova: {
        chain_type: "others",
        deployment: "PROD",
        da_layer: "External (DAC)",
        launch_date: "2022-08-09",
        supported_metrics: ["fees", "rent_paid", "stables_mcap"],
      },
      staging_rollup: {
        chain_type: "rollup",
        deployment: "DEV",
        da_layer: "Ethereum (blobs)",
        launch_date: "2024-01-01",
        supported_metrics: ["fees", "rent_paid", "stables_mcap"],
      },
    },
  };
}

function dailyRows(
  metricKey: string,
  origin: string,
  startDay: string,
  days: number,
  value: number,
): Array<Record<string, unknown>> {
  return Array.from({ length: days }, (_, index) => ({
    metric_key: metricKey,
    origin_key: origin,
    date: shiftUtcDay(startDay, index),
    value,
  }));
}

function completeFees(): Array<Record<string, unknown>> {
  return [
    ...dailyRows("fees_paid_usd", "base", "2026-06-01", 30, 5),
    ...dailyRows("fees_paid_usd", "arbitrum", "2026-06-01", 30, 10),
    ...dailyRows("fees_paid_usd", "base", "2026-07-01", 30, 10),
    ...dailyRows("fees_paid_usd", "arbitrum", "2026-07-01", 30, 20),
    ...dailyRows("fees_paid_usd", "arbitrum_nova", "2026-06-01", 60, 1_000),
  ];
}

function completeRent(): Array<Record<string, unknown>> {
  return [
    ...dailyRows("rent_paid_usd", "base", "2026-06-01", 30, 1),
    ...dailyRows("rent_paid_usd", "arbitrum", "2026-06-01", 30, 2),
    ...dailyRows("rent_paid_usd", "base", "2026-07-01", 30, 2),
    ...dailyRows("rent_paid_usd", "arbitrum", "2026-07-01", 30, 4),
    ...dailyRows("rent_paid_usd", "arbitrum_nova", "2026-06-01", 60, 900),
  ];
}

function completeStables(): Array<Record<string, unknown>> {
  return [
    { metric_key: "stables_mcap", origin_key: "ethereum", date: "2026-06-30", value: 900 },
    { metric_key: "stables_mcap", origin_key: "ethereum", date: "2026-07-30", value: 1_000 },
    { metric_key: "stables_mcap", origin_key: "base", date: "2026-06-30", value: 150 },
    { metric_key: "stables_mcap", origin_key: "base", date: "2026-07-30", value: 200 },
    { metric_key: "stables_mcap", origin_key: "arbitrum", date: "2026-06-30", value: 250 },
    { metric_key: "stables_mcap", origin_key: "arbitrum", date: "2026-07-30", value: 300 },
    { metric_key: "stables_mcap", origin_key: "arbitrum_nova", date: "2026-06-30", value: 999_000 },
    { metric_key: "stables_mcap", origin_key: "arbitrum_nova", date: "2026-07-30", value: 999_000 },
  ];
}

function fetchFor(bodies: {
  master?: unknown;
  fees?: unknown;
  rent?: unknown;
  stables?: unknown;
} = {}): ReturnType<typeof vi.fn> {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/master.json")) return jsonResponse(bodies.master ?? masterBody());
    if (url.endsWith("/fees.json")) return jsonResponse(bodies.fees ?? completeFees());
    if (url.endsWith("/rent_paid.json")) return jsonResponse(bodies.rent ?? completeRent());
    if (url.endsWith("/stables_mcap.json")) return jsonResponse(bodies.stables ?? completeStables());
    throw new Error(`unexpected request: ${url}`);
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("fetchGrowThePieEcosystemCapture", () => {
  it("aligns Ethereum-DA rollup fees, rent, settlement share, and stablecoin supply", async () => {
    const fetchImpl = fetchFor();
    const result = await fetchGrowThePieEcosystemCapture(
      { cutoffDay: CUTOFF, windowDays: 30 },
      makeContext({ env: loadEnv({}), fetchImpl: fetchImpl as typeof fetch }),
    );

    expect(result.status).toBe("valid");
    expect(result.metrics.l2UserFeesUsd).toEqual({ current: 900, previous: 450 });
    expect(result.metrics.l2RentPaidUsd).toEqual({ current: 180, previous: 90 });
    expect(result.metrics.l2SettlementCostShare).toEqual({ current: 0.2, previous: 0.2 });
    expect(result.metrics.ethereumL1StablecoinSupplyUsd).toEqual({ current: 1_000, previous: 900 });
    expect(result.metrics.ethereumL2StablecoinSupplyUsd).toEqual({ current: 500, previous: 400 });
    expect(result.metrics.ethereumEcosystemStablecoinSupplyUsd).toEqual({ current: 1_500, previous: 1_300 });
    expect(result.includedL2Origins).toEqual(["arbitrum", "base"]);
    expect(result.excludedExternalDaOrigins).toContain("arbitrum_nova");
    expect(result.gaps).toEqual([]);
    expect(result.confidence).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("does not include external-DA activity in Ethereum settlement capture", async () => {
    const result = await fetchGrowThePieEcosystemCapture(
      { cutoffDay: CUTOFF, windowDays: 30 },
      makeContext({ env: loadEnv({}), fetchImpl: fetchFor() as typeof fetch }),
    );

    expect(result.metrics.l2UserFeesUsd.current).toBe(900);
    expect(result.metrics.l2RentPaidUsd.current).toBe(180);
    expect(result.metrics.ethereumL2StablecoinSupplyUsd.current).toBe(500);
    expect(result.excludedExternalDaOrigins).toEqual(["arbitrum_nova"]);
  });

  it("returns a partial result rather than filling a missing origin-day with zero", async () => {
    const missingFees = completeFees().filter(
      (row) => !(row.origin_key === "base" && row.date === "2026-07-15"),
    );
    const result = await fetchGrowThePieEcosystemCapture(
      { cutoffDay: CUTOFF, windowDays: 30 },
      makeContext({ env: loadEnv({}), fetchImpl: fetchFor({ fees: missingFees }) as typeof fetch }),
    );

    expect(result.status).toBe("partial");
    expect(result.metrics.l2UserFeesUsd.current).toBeNull();
    expect(result.metrics.l2SettlementCostShare.current).toBeNull();
    expect(result.gaps.map((gap) => gap.code)).toEqual(expect.arrayContaining([
      "fees_coverage_gap",
      "period_mismatch",
      "partial_result",
    ]));
  });

  it("fails closed on master or metric schema drift", async () => {
    const result = await fetchGrowThePieEcosystemCapture(
      { cutoffDay: CUTOFF, windowDays: 30 },
      makeContext({
        env: loadEnv({}),
        fetchImpl: fetchFor({ master: { chains: { base: { deployment: "PROD" } } } }) as typeof fetch,
      }),
    );

    expect(result.status).toBe("unavailable");
    expect(result.metrics.l2UserFeesUsd.current).toBeNull();
    expect(result.gaps.map((gap) => gap.code)).toEqual(["growthepie_schema_drift"]);
  });

  it("maps a source failure to an unavailable result", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/master.json")) return jsonResponse(masterBody());
      return jsonResponse([], 503);
    });
    const result = await fetchGrowThePieEcosystemCapture(
      { cutoffDay: CUTOFF, windowDays: 30 },
      makeContext({ env: loadEnv({}), fetchImpl: fetchImpl as typeof fetch }),
    );

    expect(result.status).toBe("unavailable");
    expect(result.gaps.map((gap) => gap.code)).toEqual(["source_access_gap"]);
  });

  it("uses a stale cached result when refresh fails and reduces confidence", async () => {
    vi.useFakeTimers({ now: new Date("2026-07-31T12:00:00Z") });
    const healthy = fetchFor();
    let fail = false;
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      if (fail) throw new Error("offline");
      return healthy(input);
    });
    const ctx = makeContext({ env: loadEnv({}), fetchImpl: fetchImpl as typeof fetch });

    const fresh = await fetchGrowThePieEcosystemCapture(
      { cutoffDay: CUTOFF, windowDays: 30 },
      ctx,
    );
    fail = true;
    await vi.advanceTimersByTimeAsync(30 * 60_000 + 1);
    const stale = await fetchGrowThePieEcosystemCapture(
      { cutoffDay: CUTOFF, windowDays: 30 },
      ctx,
    );

    expect(fresh.status).toBe("valid");
    expect(stale.status).toBe("partial");
    expect(stale.stale).toBe(true);
    expect(stale.metrics).toEqual(fresh.metrics);
    expect(stale.confidence).toBe(0.75);
    expect(stale.gaps.map((gap) => gap.code)).toContain("source_stale");
    expect(stale.sourceStatus.every((source) => source.stale)).toBe(true);
  });
});
