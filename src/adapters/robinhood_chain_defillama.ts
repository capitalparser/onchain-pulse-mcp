import { withCache, type AdapterContext } from "./base.js";
import type {
  RobinhoodChainFundamentals,
  RobinhoodPulseGap,
  RobinhoodSourceStatus,
} from "../robinhood_chain_pulse/types.js";
import { RobinhoodChainFundamentalsSchema } from "../robinhood_chain_pulse/types.js";

export const ROBINHOOD_DEFILLAMA_URLS = {
  chains: "https://api.llama.fi/v2/chains",
  stablecoinChains: "https://stablecoins.llama.fi/stablecoinchains",
  stablecoinHistory: "https://stablecoins.llama.fi/stablecoincharts/Robinhood%20Chain",
  dexOverview:
    "https://api.llama.fi/overview/dexs/Robinhood%20Chain?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=dailyVolume",
  feeOverview:
    "https://api.llama.fi/overview/fees/Robinhood%20Chain?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=dailyFees",
} as const;

const DAY_SECONDS = 86_400;
const MAX_STABLECOIN_HISTORY_ROWS = 10_000;

const CACHE_SPEC = {
  name: "robinhood_chain_defillama",
  ttlMs: 15 * 60_000,
  max: 8,
};

export interface RobinhoodDefiLlamaResult {
  status: "valid" | "partial" | "unavailable";
  metrics: RobinhoodChainFundamentals;
  sources: string[];
  sourceStatus: RobinhoodSourceStatus[];
  stale: boolean;
  staleData: string[];
  gaps: RobinhoodPulseGap[];
  confidence: number;
  asOf: string;
}

class RobinhoodDefiLlamaRefreshError extends Error {
  constructor(readonly fallback: RobinhoodDefiLlamaResult) {
    super("Robinhood Chain DefiLlama refresh failed");
  }
}

class SourceAccessError extends Error {}
class SchemaDriftError extends Error {}

function emptyMetrics(): RobinhoodChainFundamentals {
  return RobinhoodChainFundamentalsSchema.parse({
    tvl_usd: null,
    tvl_change_1d_pct: null,
    stablecoin_supply_usd: null,
    stablecoin_change_7d_pct: null,
    dex_volume_24h_usd: null,
    dex_volume_7d_usd: null,
    dex_change_7d_pct: null,
    app_fees_24h_usd: null,
    app_fees_7d_usd: null,
    app_fees_change_7d_pct: null,
    dex_protocol_count: null,
    fee_protocol_count: null,
  });
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finite(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function nonnegative(value: unknown): number | null {
  const parsed = finite(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function nonnegativeInteger(value: unknown): number | null {
  const parsed = nonnegative(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
}

function usdValue(value: unknown): number | null {
  const direct = nonnegative(value);
  if (direct !== null) return direct;
  const object = record(value);
  if (object === null) return null;
  for (const key of ["peggedUSD", "usd", "total", "value"] as const) {
    const candidate = nonnegative(object[key]);
    if (candidate !== null) return candidate;
  }
  return null;
}

function normalizedName(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "") : "";
}

function isRobinhoodName(value: unknown): boolean {
  const normalized = normalizedName(value);
  return normalized === "robinhoodchain" || normalized === "robinhood";
}

async function fetchJson(fetchImpl: typeof fetch, url: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url);
  } catch {
    throw new SourceAccessError();
  }
  if (!response.ok) throw new SourceAccessError();
  try {
    return await response.json();
  } catch {
    throw new SchemaDriftError();
  }
}

function parseChain(body: unknown): {
  tvl: number;
  change1d: number | null;
} {
  if (!Array.isArray(body)) throw new SchemaDriftError();
  const candidate = body.find((row) => {
    const item = record(row);
    return item !== null && (
      isRobinhoodName(item.name)
      || isRobinhoodName(item.gecko_id)
      || isRobinhoodName(item.tokenSymbol)
    );
  });
  const item = record(candidate);
  if (item === null) throw new SchemaDriftError();
  const tvl = nonnegative(item.tvl);
  if (tvl === null) throw new SchemaDriftError();
  return {
    tvl,
    change1d: finite(item.change_1d ?? item.change1d),
  };
}

function parseStablecoinChain(body: unknown): {
  supply: number;
} {
  if (!Array.isArray(body)) throw new SchemaDriftError();
  const candidate = body.find((row) => {
    const item = record(row);
    return item !== null && (
      isRobinhoodName(item.name)
      || isRobinhoodName(item.gecko_id)
      || isRobinhoodName(item.chain)
    );
  });
  const item = record(candidate);
  if (item === null) throw new SchemaDriftError();
  const supply = usdValue(item.totalCirculatingUSD ?? item.totalCirculating);
  if (supply === null) throw new SchemaDriftError();
  return {
    supply,
  };
}

function parseStablecoinHistory(body: unknown, now: Date): {
  change7d: number | null;
  gap: "baseline_gap" | "baseline_zero" | null;
} {
  if (!Array.isArray(body) || body.length === 0 || body.length > MAX_STABLECOIN_HISTORY_ROWS) {
    throw new SchemaDriftError();
  }
  const observations = body.map((raw) => {
    const item = record(raw);
    const timestamp = item === null ? null : nonnegativeInteger(item.date);
    const supply = item === null ? null : usdValue(item.totalCirculatingUSD);
    if (timestamp === null || supply === null) throw new SchemaDriftError();
    return { timestamp, supply };
  });
  const currentCutoff = Math.floor(now.getTime() / 1_000);
  const baselineCutoff = currentCutoff - 7 * DAY_SECONDS;
  const latestAtOrBefore = (cutoff: number) => observations
    .filter((observation) => observation.timestamp <= cutoff)
    .sort((left, right) => right.timestamp - left.timestamp)[0] ?? null;
  const current = latestAtOrBefore(currentCutoff);
  const baseline = latestAtOrBefore(baselineCutoff);
  if (current === null || baseline === null) return { change7d: null, gap: "baseline_gap" };
  if (baseline.supply === 0) return { change7d: null, gap: "baseline_zero" };
  return {
    change7d: ((current.supply - baseline.supply) / baseline.supply) * 100,
    gap: null,
  };
}

function parseOverview(body: unknown): {
  total24h: number;
  total7d: number | null;
  change7d: number | null;
  protocolCount: number | null;
} {
  const item = record(body);
  if (item === null) throw new SchemaDriftError();
  const total24h = nonnegative(item.total24h ?? item.total24Hours);
  if (total24h === null) throw new SchemaDriftError();
  const protocols = Array.isArray(item.protocols) ? item.protocols : null;
  return {
    total24h,
    total7d: nonnegative(item.total7d ?? item.total7Days),
    change7d: finite(item.change_7d ?? item.change7d),
    protocolCount: protocols === null ? null : protocols.length,
  };
}

function statusRow(
  source: string,
  role: string,
  status: RobinhoodSourceStatus["status"],
  asOf: string,
): RobinhoodSourceStatus {
  return { source, role, status, as_of: asOf };
}

async function load(ctx: AdapterContext, now: Date): Promise<RobinhoodDefiLlamaResult> {
  const asOf = now.toISOString();
  const metrics = emptyMetrics();
  const gaps: RobinhoodPulseGap[] = [];
  const sources: string[] = [];
  const sourceStatus: RobinhoodSourceStatus[] = [];

  const tasks = await Promise.allSettled([
    fetchJson(ctx.fetch, ROBINHOOD_DEFILLAMA_URLS.chains),
    fetchJson(ctx.fetch, ROBINHOOD_DEFILLAMA_URLS.stablecoinChains),
    fetchJson(ctx.fetch, ROBINHOOD_DEFILLAMA_URLS.stablecoinHistory),
    fetchJson(ctx.fetch, ROBINHOOD_DEFILLAMA_URLS.dexOverview),
    fetchJson(ctx.fetch, ROBINHOOD_DEFILLAMA_URLS.feeOverview),
  ]);

  const sourceDefs = [
    { ref: "defillama:chains", role: "Robinhood Chain TVL and daily change" },
    { ref: "defillama-stablecoins:chains", role: "Robinhood Chain stablecoin supply" },
    { ref: "defillama-stablecoins:history", role: "Robinhood Chain stablecoin supply history" },
    { ref: "defillama:dexs:robinhood-chain", role: "Robinhood Chain DEX activity" },
    { ref: "defillama:fees:robinhood-chain", role: "Robinhood Chain application fees" },
  ] as const;

  const parseTask = <T>(
    index: number,
    parser: (value: unknown) => T,
    onValue: (value: T) => void,
  ): void => {
    const task = tasks[index];
    const source = sourceDefs[index]!;
    if (task?.status !== "fulfilled") {
      gaps.push({ code: `${source.ref}:source_access_gap`, detail: `${source.role} was unavailable.` });
      sourceStatus.push(statusRow(source.ref, source.role, "unavailable", asOf));
      return;
    }
    try {
      onValue(parser(task.value));
      sources.push(source.ref);
      sourceStatus.push(statusRow(source.ref, source.role, "ok", asOf));
    } catch {
      gaps.push({ code: `${source.ref}:schema_drift`, detail: `${source.role} did not satisfy the bounded schema.` });
      sourceStatus.push(statusRow(source.ref, source.role, "schema_drift", asOf));
    }
  };

  parseTask(0, parseChain, (value) => {
    metrics.tvl_usd = value.tvl;
    metrics.tvl_change_1d_pct = value.change1d;
  });
  parseTask(1, parseStablecoinChain, (value) => {
    metrics.stablecoin_supply_usd = value.supply;
  });
  parseTask(2, (body) => parseStablecoinHistory(body, now), (value) => {
    metrics.stablecoin_change_7d_pct = value.change7d;
    if (value.gap === "baseline_gap") {
      gaps.push({
        code: "defillama-stablecoins:history:baseline_gap",
        detail: "No stablecoin supply observation existed at or before both UTC cutoffs required for the 7-day change.",
      });
    } else if (value.gap === "baseline_zero") {
      gaps.push({
        code: "defillama-stablecoins:history:baseline_zero",
        detail: "The stablecoin supply observation at the 7-day UTC baseline was zero, so percentage change is undefined.",
      });
    }
  });
  parseTask(3, parseOverview, (value) => {
    metrics.dex_volume_24h_usd = value.total24h;
    metrics.dex_volume_7d_usd = value.total7d;
    metrics.dex_change_7d_pct = value.change7d;
    metrics.dex_protocol_count = value.protocolCount;
  });
  parseTask(4, parseOverview, (value) => {
    metrics.app_fees_24h_usd = value.total24h;
    metrics.app_fees_7d_usd = value.total7d;
    metrics.app_fees_change_7d_pct = value.change7d;
    metrics.fee_protocol_count = value.protocolCount;
  });

  const primary = [
    metrics.tvl_usd,
    metrics.stablecoin_supply_usd,
    metrics.dex_volume_24h_usd,
    metrics.app_fees_24h_usd,
  ];
  const available = primary.filter((value) => value !== null).length;
  const historyAvailable = metrics.stablecoin_change_7d_pct !== null;
  const status: RobinhoodDefiLlamaResult["status"] = available === primary.length && historyAvailable
    ? "valid"
    : available > 0
      ? "partial"
      : "unavailable";

  const result: RobinhoodDefiLlamaResult = {
    status,
    metrics: RobinhoodChainFundamentalsSchema.parse(metrics),
    sources: [...new Set(sources)].sort(),
    sourceStatus,
    stale: false,
    staleData: [],
    gaps,
    confidence: Number(((available + (historyAvailable ? 1 : 0)) / (primary.length + 1)).toFixed(2)),
    asOf,
  };
  if (status === "unavailable") throw new RobinhoodDefiLlamaRefreshError(result);
  return result;
}

function markStale(result: RobinhoodDefiLlamaResult): RobinhoodDefiLlamaResult {
  return {
    ...result,
    status: result.status === "valid" ? "partial" : result.status,
    stale: true,
    staleData: [...new Set([...result.staleData, "defillama:stale_cache"])],
    sourceStatus: result.sourceStatus.map((source) => ({
      ...source,
      status: source.status === "ok" ? "stale" : source.status,
    })),
    gaps: [
      ...result.gaps,
      { code: "defillama:stale_cache", detail: "Live refresh failed and cached Robinhood Chain fundamentals were used." },
    ],
    confidence: Number((result.confidence * 0.75).toFixed(2)),
  };
}

export async function fetchRobinhoodChainDefiLlama(
  ctx: AdapterContext,
  now: Date = new Date(),
): Promise<RobinhoodDefiLlamaResult> {
  try {
    const result = await withCache(
      ctx.cacheFor<RobinhoodDefiLlamaResult>(CACHE_SPEC),
      "robinhood-chain",
      () => load(ctx, now),
    );
    return result.stale ? markStale(result) : result;
  } catch (error) {
    if (error instanceof RobinhoodDefiLlamaRefreshError) return error.fallback;
    return {
      status: "unavailable",
      metrics: emptyMetrics(),
      sources: [],
      sourceStatus: [],
      stale: false,
      staleData: [],
      gaps: [{ code: "defillama:source_access_gap", detail: "Robinhood Chain fundamentals could not be loaded." }],
      confidence: 0,
      asOf: now.toISOString(),
    };
  }
}
