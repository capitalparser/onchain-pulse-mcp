import { afterEach, describe, expect, it, vi } from "vitest";
import { makeContext } from "../../src/adapters/base.js";
import { loadEnv } from "../../src/env.js";
import { shiftUtcDay } from "../../src/eth_value_capture/metrics.js";
import {
  fetchGrowThePieRent,
  type GrowThePieRentInput,
} from "../../src/adapters/eth_value_growthepie.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function responseWithJson(body: unknown): Response {
  return { ok: true, json: async () => body } as Response;
}

function dailyRows(startDay: string, days: number, origin: string, value: number) {
  return Array.from({ length: days }, (_, index) => ({
    metric_key: "rent_paid_eth",
    origin_key: origin,
    date: shiftUtcDay(startDay, index),
    value,
  }));
}

function rentInput(windowDays: 7 | 30 | 90, includeRollups = true): GrowThePieRentInput {
  return { cutoffDay: "2026-07-31", windowDays, includeRollups };
}

function completeRows(): Array<Record<string, unknown>> {
  return dailyRows("2026-07-17", 14, "arbitrum", 1);
}

async function expectSchemaDrift(body: unknown): Promise<void> {
  const fetchImpl = vi.fn().mockResolvedValue(responseWithJson(body));
  const result = await fetchGrowThePieRent(
    rentInput(7),
    makeContext({ env: loadEnv({}), fetchImpl }),
  );

  expect(result.status).toBe("unavailable");
  expect(result.current.l2Rent).toBeNull();
  expect(result.previous.l2Rent).toBeNull();
  expect(result.gaps.map((gap) => gap.code)).toContain("growthepie_schema_drift");
}

afterEach(() => {
  vi.useRealTimers();
});

describe("fetchGrowThePieRent", () => {
  it("aggregates complete 7-day rent periods and sorted rollups", async () => {
    const rows = [
      ...dailyRows("2026-07-17", 14, "arbitrum", 1),
      ...dailyRows("2026-07-17", 14, "base", 2),
      {
        metric_key: "rent_paid_usd",
        origin_key: "base",
        date: "2026-07-30",
        value: 999,
      },
      {
        metric_key: "rent_paid_eth",
        origin_key: "base",
        date: "2026-07-31",
        value: 1000,
      },
    ];
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(rows));
    const ctx = makeContext({ env: loadEnv({}), fetchImpl });

    const result = await fetchGrowThePieRent(rentInput(7), ctx);

    expect(result.status).toBe("valid");
    expect(result.current.l2Rent).toBe(21);
    expect(result.previous.l2Rent).toBe(21);
    expect(result.asOf).toBe("2026-07-30T00:00:00Z");
    expect(result.rollups).toEqual([
      {
        name: "arbitrum",
        current: { l2Rent: 7 },
        previous: { l2Rent: 7 },
      },
      {
        name: "base",
        current: { l2Rent: 14 },
        previous: { l2Rent: 14 },
      },
    ]);
  });

  it.each([
    { windowDays: 30 as const, expected: { current: 30, previous: 30 } },
    { windowDays: 90 as const, expected: { current: 90, previous: 90 } },
  ])("aggregates complete $windowDays-day periods", async ({ windowDays, expected }) => {
    const rows = dailyRows(
      shiftUtcDay("2026-07-31", -(2 * windowDays)),
      2 * windowDays,
      "arbitrum",
      1,
    );
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(rows));
    const ctx = makeContext({ env: loadEnv({}), fetchImpl });

    const result = await fetchGrowThePieRent(rentInput(windowDays), ctx);

    expect(result.current.l2Rent).toBe(expected.current);
    expect(result.previous.l2Rent).toBe(expected.previous);
  });

  it("omits rollups when they are not requested", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(dailyRows("2026-07-17", 14, "arbitrum", 1)),
    );
    const ctx = makeContext({ env: loadEnv({}), fetchImpl });

    const result = await fetchGrowThePieRent(rentInput(7, false), ctx);

    expect(result).not.toHaveProperty("rollups");
  });

  it("rejects a negative selected value", async () => {
    const rows = completeRows();
    rows[0] = { ...rows[0], value: -1 };
    await expectSchemaDrift(rows);
  });

  it.each([
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["numeric string", "1"],
  ])("rejects a selected %s value", async (_label, value) => {
    const rows = completeRows();
    rows[0] = { ...rows[0], value };
    await expectSchemaDrift(rows);
  });

  it.each([
    ["empty origin", { origin_key: "" }],
    ["noncanonical date", { date: "2026-7-17" }],
  ])("rejects a selected row with %s", async (_label, replacement) => {
    const rows = completeRows();
    rows[0] = { ...rows[0], ...replacement };
    await expectSchemaDrift(rows);
  });

  it("rejects duplicate selected origin-day rows", async () => {
    const rows = completeRows();
    rows.push({ ...rows[0] });
    await expectSchemaDrift(rows);
  });

  it("rejects a wholly missing day in the combined range", async () => {
    const rows = completeRows().filter((row) => row.date !== "2026-07-24");
    await expectSchemaDrift(rows);
  });

  it.each([
    ["previous", dailyRows("2026-07-24", 7, "arbitrum", 1)],
    ["current", dailyRows("2026-07-17", 7, "arbitrum", 1)],
  ])("rejects a response with no contributing %s period", async (_period, rows) => {
    await expectSchemaDrift(rows);
  });

  it.each([
    ["a malformed top-level body", { rows: completeRows() }],
    ["a malformed selected row", [...completeRows(), { metric_key: "rent_paid_eth" }]],
  ])("rejects %s", async (_label, body) => {
    await expectSchemaDrift(body);
  });

  it.each([
    ["a non-2xx response", vi.fn().mockResolvedValue(jsonResponse([], 503))],
    ["a thrown fetch", vi.fn().mockRejectedValue(new Error("offline"))],
  ])("maps %s without a cache entry to source access", async (_label, fetchImpl) => {
    const result = await fetchGrowThePieRent(
      rentInput(7),
      makeContext({ env: loadEnv({}), fetchImpl }),
    );

    expect(result.status).toBe("unavailable");
    expect(result.gaps.map((gap) => gap.code)).toEqual(["source_access_gap"]);
  });

  it("shares one network response between concurrent identical requests", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(completeRows()));
    const ctx = makeContext({ env: loadEnv({}), fetchImpl });

    const [first, second] = await Promise.all([
      fetchGrowThePieRent(rentInput(7), ctx),
      fetchGrowThePieRent(rentInput(7), ctx),
    ]);

    expect(second).toEqual(first);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("reuses a fresh cached rent result", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(completeRows()));
    const ctx = makeContext({ env: loadEnv({}), fetchImpl });

    const first = await fetchGrowThePieRent(rentInput(7), ctx);
    const second = await fetchGrowThePieRent(rentInput(7), ctx);

    expect(second).toEqual(first);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("marks the prior result stale when an expired refresh fails", async () => {
    vi.useFakeTimers({ now: new Date("2026-07-31T12:00:00Z") });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(completeRows()))
      .mockRejectedValueOnce(new Error("offline"));
    const ctx = makeContext({ env: loadEnv({}), fetchImpl });

    const fresh = await fetchGrowThePieRent(rentInput(7), ctx);
    await vi.advanceTimersByTimeAsync(30 * 60_000 + 1);
    const stale = await fetchGrowThePieRent(rentInput(7), ctx);

    expect(stale.status).toBe("stale");
    expect(stale.stale).toBe(true);
    expect(stale.current).toEqual(fresh.current);
    expect(stale.gaps.filter((gap) => gap.code === "source_stale")).toEqual([
      {
        code: "source_stale",
        detail: "GrowThePie refresh failed; cached L2 rent data was used.",
      },
    ]);
  });
});
