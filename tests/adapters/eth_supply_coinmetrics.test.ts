import { afterEach, describe, expect, it, vi } from "vitest";
import { makeContext } from "../../src/adapters/base.js";
import {
  computeSupplyDelta,
  fetchEthSupplyHistory,
} from "../../src/adapters/eth_supply_coinmetrics.js";

const env = { byok: {}, lang: "en" as const, historyPath: "/tmp/history.json" };
const now = new Date("2026-07-29T12:00:00Z");

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function row(day: string, supply = "120000000.25") {
  return {
    asset: "eth",
    time: `${day}T00:00:00.000000000Z`,
    SplyCur: supply,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("fetchEthSupplyHistory", () => {
  it("normalizes ordered decimal strings at exact UTC boundaries", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: [
          row("2026-07-26"),
          row("2026-07-27", "120000001.75"),
        ],
      }),
    );

    const result = await fetchEthSupplyHistory(
      { windowDays: 7, now },
      makeContext({ env, fetchImpl: fetchImpl as typeof fetch }),
    );

    expect(result).toMatchObject({
      status: "valid",
      latestBoundary: "2026-07-27",
      asOf: "2026-07-27T00:00:00Z",
      stale: false,
      gaps: [],
    });
    expect(result.points).toEqual([
      { boundary: "2026-07-26", supplyEth: 120000000.25 },
      { boundary: "2026-07-27", supplyEth: 120000001.75 },
    ]);
  });

  it("requests two windows plus four days of boundary buffer", async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request) =>
      jsonResponse({ data: [row("2026-07-29")] }),
    );

    await fetchEthSupplyHistory(
      { windowDays: 30, now },
      makeContext({ env, fetchImpl: fetchImpl as typeof fetch }),
    );

    const requested = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(requested.origin + requested.pathname).toBe(
      "https://community-api.coinmetrics.io/v4/timeseries/asset-metrics",
    );
    expect(Object.fromEntries(requested.searchParams)).toEqual({
      assets: "eth",
      metrics: "SplyCur",
      frequency: "1d",
      start_time: "2026-05-26",
      end_time: "2026-07-29",
      page_size: "200",
      paging_from: "start",
    });
  });

  it("treats a two-day reporting lag as valid", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [row("2026-07-27")] }));
    const result = await fetchEthSupplyHistory(
      { windowDays: 7, now },
      makeContext({ env, fetchImpl: fetchImpl as typeof fetch }),
    );
    expect(result.status).toBe("valid");
    expect(result.stale).toBe(false);
  });

  it("marks a reporting lag over two days stale", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [row("2026-07-26")] }));
    const result = await fetchEthSupplyHistory(
      { windowDays: 7, now },
      makeContext({ env, fetchImpl: fetchImpl as typeof fetch }),
    );
    expect(result.status).toBe("stale");
    expect(result.stale).toBe(true);
    expect(result.gaps).toEqual([
      {
        code: "source_stale",
        detail: "Coin Metrics latest ETH supply boundary is more than two UTC days behind.",
      },
    ]);
  });

  it.each([
    {
      name: "duplicate boundary",
      data: [row("2026-07-27"), row("2026-07-27")],
    },
    {
      name: "non-midnight timestamp",
      data: [{ ...row("2026-07-27"), time: "2026-07-27T12:00:00Z" }],
    },
    {
      name: "reversed order",
      data: [row("2026-07-28"), row("2026-07-27")],
    },
    {
      name: "invalid decimal",
      data: [row("2026-07-27", "NaN")],
    },
    {
      name: "wrong asset",
      data: [{ ...row("2026-07-27"), asset: "btc" }],
    },
  ])("rejects malformed $name rows without leaking bodies", async ({ data }) => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data }));
    const result = await fetchEthSupplyHistory(
      { windowDays: 7, now },
      makeContext({ env, fetchImpl: fetchImpl as typeof fetch }),
    );

    expect(result.status).toBe("unavailable");
    expect(result.points).toEqual([]);
    expect(result.gaps).toEqual([
      {
        code: "source_access_gap",
        detail: "Coin Metrics ETH supply response was unavailable or invalid.",
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("NaN");
  });

  it("returns a sanitized unavailable result for an HTTP failure", async () => {
    const fetchImpl = vi.fn(async () => new Response("secret upstream body", { status: 503 }));
    const result = await fetchEthSupplyHistory(
      { windowDays: 7, now },
      makeContext({ env, fetchImpl: fetchImpl as typeof fetch }),
    );

    expect(result.status).toBe("unavailable");
    expect(JSON.stringify(result)).not.toContain("secret upstream body");
  });

  it("deduplicates identical requests in the adapter context", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [row("2026-07-29")] }));
    const ctx = makeContext({ env, fetchImpl: fetchImpl as typeof fetch });

    const [first, second] = await Promise.all([
      fetchEthSupplyHistory({ windowDays: 7, now }, ctx),
      fetchEthSupplyHistory({ windowDays: 7, now }, ctx),
    ]);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it("returns a marked stale cache value when refresh fails", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T12:00:00Z"));
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [row("2026-07-29")] }))
      .mockRejectedValueOnce(new Error("network secret"));
    const ctx = makeContext({ env, fetchImpl: fetchImpl as typeof fetch });

    const first = await fetchEthSupplyHistory({ windowDays: 7, now }, ctx);
    vi.advanceTimersByTime(31 * 60_000);
    const fallback = await fetchEthSupplyHistory({ windowDays: 7, now }, ctx);

    expect(first.status).toBe("valid");
    expect(fallback).toMatchObject({
      status: "stale",
      asOf: "2026-07-29T00:00:00Z",
      stale: true,
    });
    expect(fallback.gaps.map((gap) => gap.code)).toContain("source_stale");
    expect(JSON.stringify(fallback)).not.toContain("network secret");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("computeSupplyDelta", () => {
  it("computes a signed delta only from exact boundary points", () => {
    const points = [
      { boundary: "2026-06-01", supplyEth: 120 },
      { boundary: "2026-06-08", supplyEth: 118 },
    ];

    expect(computeSupplyDelta(points, "2026-06-01", "2026-06-08")).toBe(-2);
    expect(computeSupplyDelta(points, "2026-06-02", "2026-06-08")).toBeNull();
  });
});
