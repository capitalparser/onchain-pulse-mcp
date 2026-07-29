import type { AdapterContext } from "./base.js";
import { withCache } from "./base.js";
import { shiftUtcDay } from "../eth_value_capture/metrics.js";
import type { EthValueGap } from "../eth_value_capture/types.js";

const COIN_METRICS_URL =
  "https://community-api.coinmetrics.io/v4/timeseries/asset-metrics";
const CACHE_SPEC = {
  name: "eth_supply_coinmetrics",
  ttlMs: 30 * 60_000,
  max: 16,
};
const MIDNIGHT_TIMESTAMP =
  /^(\d{4}-\d{2}-\d{2})T00:00:00(?:\.0+)?Z$/;
const DECIMAL = /^-?\d+(?:\.\d+)?$/;

export interface EthSupplyPoint {
  boundary: string;
  supplyEth: number;
}

export interface CoinMetricsSupplyResult {
  status: "valid" | "stale" | "unavailable";
  points: EthSupplyPoint[];
  latestBoundary: string | null;
  asOf: string | null;
  stale: boolean;
  gaps: EthValueGap[];
}

export interface EthSupplyHistoryInput {
  windowDays: 7 | 30 | 90;
  now: Date;
}

function unavailableResult(): CoinMetricsSupplyResult {
  return {
    status: "unavailable",
    points: [],
    latestBoundary: null,
    asOf: null,
    stale: false,
    gaps: [
      {
        code: "source_access_gap",
        detail: "Coin Metrics ETH supply response was unavailable or invalid.",
      },
    ],
  };
}

function markCacheStale(result: CoinMetricsSupplyResult): CoinMetricsSupplyResult {
  const gaps = result.gaps.some((gap) => gap.code === "source_stale")
    ? result.gaps
    : [
        ...result.gaps,
        {
          code: "source_stale" as const,
          detail: "Coin Metrics ETH supply refresh failed; cached data was used.",
        },
      ];

  return {
    ...result,
    status: "stale",
    stale: true,
    gaps,
  };
}

function dayNumber(day: string): number {
  return Date.parse(`${day}T00:00:00Z`) / (24 * 60 * 60 * 1000);
}

function parseResponse(body: unknown, cutoffDay: string): CoinMetricsSupplyResult {
  if (typeof body !== "object" || body === null || !("data" in body)) {
    throw new Error("invalid_coinmetrics_response");
  }
  const data = (body as { data?: unknown }).data;
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("invalid_coinmetrics_response");
  }

  const points: EthSupplyPoint[] = [];
  let previousBoundary: string | null = null;

  for (const item of data) {
    if (typeof item !== "object" || item === null) {
      throw new Error("invalid_coinmetrics_response");
    }
    const raw = item as Record<string, unknown>;
    const match = typeof raw.time === "string"
      ? MIDNIGHT_TIMESTAMP.exec(raw.time)
      : null;
    if (
      raw.asset !== "eth" ||
      match === null ||
      typeof raw.SplyCur !== "string" ||
      !DECIMAL.test(raw.SplyCur)
    ) {
      throw new Error("invalid_coinmetrics_response");
    }

    const boundary = match[1];
    if (
      boundary === undefined ||
      boundary > cutoffDay ||
      (previousBoundary !== null && boundary <= previousBoundary)
    ) {
      throw new Error("invalid_coinmetrics_response");
    }
    const supplyEth = Number(raw.SplyCur);
    if (!Number.isFinite(supplyEth)) {
      throw new Error("invalid_coinmetrics_response");
    }

    points.push({ boundary, supplyEth });
    previousBoundary = boundary;
  }

  const latestBoundary = points[points.length - 1]?.boundary ?? null;
  if (latestBoundary === null) {
    throw new Error("invalid_coinmetrics_response");
  }
  const lagDays = dayNumber(cutoffDay) - dayNumber(latestBoundary);
  const stale = lagDays > 2;

  return {
    status: stale ? "stale" : "valid",
    points,
    latestBoundary,
    asOf: `${latestBoundary}T00:00:00Z`,
    stale,
    gaps: stale
      ? [
          {
            code: "source_stale",
            detail:
              "Coin Metrics latest ETH supply boundary is more than two UTC days behind.",
          },
        ]
      : [],
  };
}

function buildUrl(input: EthSupplyHistoryInput): URL {
  const cutoffDay = input.now.toISOString().slice(0, 10);
  const url = new URL(COIN_METRICS_URL);
  url.searchParams.set("assets", "eth");
  url.searchParams.set("metrics", "SplyCur");
  url.searchParams.set("frequency", "1d");
  url.searchParams.set(
    "start_time",
    shiftUtcDay(cutoffDay, -(2 * input.windowDays + 4)),
  );
  url.searchParams.set("end_time", cutoffDay);
  url.searchParams.set("page_size", "200");
  url.searchParams.set("paging_from", "start");
  return url;
}

export async function fetchEthSupplyHistory(
  input: EthSupplyHistoryInput,
  ctx: AdapterContext,
): Promise<CoinMetricsSupplyResult> {
  const cutoffDay = input.now.toISOString().slice(0, 10);
  const cache = ctx.cacheFor<CoinMetricsSupplyResult>(CACHE_SPEC);

  try {
    const result = await withCache(
      cache,
      `${input.windowDays}:${cutoffDay}`,
      async () => {
        const response = await ctx.fetch(buildUrl(input));
        if (!response.ok) throw new Error("coinmetrics_http_failure");
        return parseResponse(await response.json(), cutoffDay);
      },
    );
    return result.stale && result.status === "valid"
      ? markCacheStale(result)
      : result;
  } catch {
    return unavailableResult();
  }
}

export function computeSupplyDelta(
  points: EthSupplyPoint[],
  startBoundary: string,
  endBoundary: string,
): number | null {
  const start = points.find((point) => point.boundary === startBoundary);
  const end = points.find((point) => point.boundary === endBoundary);
  if (start === undefined || end === undefined) return null;
  const delta = end.supplyEth - start.supplyEth;
  return Number.isFinite(delta) ? delta : null;
}
