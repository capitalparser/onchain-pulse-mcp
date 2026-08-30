import { withCache, type AdapterContext } from "./base.js";
import {
  ROBINHOOD_CHAIN_REGISTRY,
  ROBINHOOD_COMMUNITY_TOKEN_UNIVERSE,
  normalizedAddress,
  type RobinhoodCommunityToken,
} from "../robinhood_chain_pulse/registry.js";
import type {
  RobinhoodCommunityTokenMarket,
  RobinhoodPulseGap,
  RobinhoodSourceStatus,
} from "../robinhood_chain_pulse/types.js";
import { RobinhoodCommunityTokenMarketSchema } from "../robinhood_chain_pulse/types.js";

export const ROBINHOOD_DEXSCREENER_URL =
  `https://api.dexscreener.com/tokens/v1/${ROBINHOOD_CHAIN_REGISTRY.chain_slug}/${ROBINHOOD_COMMUNITY_TOKEN_UNIVERSE.map((token) => token.address).join(",")}`;

const CACHE_SPEC = {
  name: "robinhood_chain_community",
  ttlMs: 5 * 60_000,
  max: 8,
};
const MIN_LIQUIDITY_USD = 25_000;
const MIN_MARKET_CAP_USD = 100_000;

interface ParsedPair {
  tokenAddress: string;
  reportedSymbol: string | null;
  pairAddress: string;
  dexId: string | null;
  priceUsd: number | null;
  priceChange24hPct: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  buys24h: number | null;
  sells24h: number | null;
}

interface ExplorerMetadata {
  status: "ok" | "unavailable" | "schema_drift";
  symbol: string | null;
  holders: number | null;
}

export interface RobinhoodCommunityResult {
  status: "valid" | "partial" | "unavailable";
  tokens: RobinhoodCommunityTokenMarket[];
  sources: string[];
  sourceStatus: RobinhoodSourceStatus[];
  stale: boolean;
  staleData: string[];
  gaps: RobinhoodPulseGap[];
  confidence: number;
  asOf: string;
}

class RobinhoodCommunityRefreshError extends Error {
  constructor(readonly fallback: RobinhoodCommunityResult) {
    super("Robinhood Chain community-token refresh failed");
  }
}

function failRefresh(fallback: RobinhoodCommunityResult): never {
  throw new RobinhoodCommunityRefreshError(fallback);
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

function integer(value: unknown): number | null {
  const parsed = nonnegative(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function ratio(numerator: number | null, denominator: number | null): number | null {
  return numerator !== null && denominator !== null && denominator > 0
    ? numerator / denominator
    : null;
}

function parseDexPairs(body: unknown): ParsedPair[] {
  if (!Array.isArray(body)) throw new Error("schema_drift");
  const registered = new Set(
    ROBINHOOD_COMMUNITY_TOKEN_UNIVERSE.map((token) => normalizedAddress(token.address)),
  );
  const pairs: ParsedPair[] = [];
  for (const raw of body) {
    const pair = record(raw);
    const baseToken = pair === null ? null : record(pair.baseToken);
    if (pair === null || baseToken === null) continue;
    if (text(pair.chainId)?.toLowerCase() !== ROBINHOOD_CHAIN_REGISTRY.chain_slug) continue;
    const tokenAddress = text(baseToken.address);
    if (tokenAddress === null || !registered.has(normalizedAddress(tokenAddress))) continue;
    const pairAddress = text(pair.pairAddress);
    if (pairAddress === null) continue;
    const liquidity = record(pair.liquidity);
    const volume = record(pair.volume);
    const priceChange = record(pair.priceChange);
    const txns = record(pair.txns);
    const h24Txns = txns === null ? null : record(txns.h24);
    pairs.push({
      tokenAddress,
      reportedSymbol: text(baseToken.symbol),
      pairAddress,
      dexId: text(pair.dexId),
      priceUsd: nonnegative(pair.priceUsd),
      priceChange24hPct: priceChange === null ? null : finite(priceChange.h24),
      marketCapUsd: nonnegative(pair.marketCap),
      fdvUsd: nonnegative(pair.fdv),
      liquidityUsd: liquidity === null ? null : nonnegative(liquidity.usd),
      volume24hUsd: volume === null ? null : nonnegative(volume.h24),
      buys24h: h24Txns === null ? null : integer(h24Txns.buys),
      sells24h: h24Txns === null ? null : integer(h24Txns.sells),
    });
  }
  return pairs;
}

async function fetchExplorerMetadata(
  ctx: AdapterContext,
  token: RobinhoodCommunityToken,
): Promise<ExplorerMetadata> {
  const url = `${ROBINHOOD_CHAIN_REGISTRY.explorer_url}/api/v2/tokens/${token.address}`;
  let response: Response;
  try {
    response = await ctx.fetch(url);
  } catch {
    return { status: "unavailable", symbol: null, holders: null };
  }
  if (!response.ok) return { status: "unavailable", symbol: null, holders: null };
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { status: "schema_drift", symbol: null, holders: null };
  }
  const item = record(body);
  if (item === null) return { status: "schema_drift", symbol: null, holders: null };
  const symbol = text(item.symbol);
  const holders = integer(item.holders_count ?? item.holdersCount);
  if (symbol === null) return { status: "schema_drift", symbol: null, holders };
  return { status: "ok", symbol, holders };
}

function choosePrimary(pairs: ParsedPair[]): ParsedPair | null {
  if (pairs.length === 0) return null;
  return [...pairs].sort((left, right) => {
    const liquidityDiff = (right.liquidityUsd ?? -1) - (left.liquidityUsd ?? -1);
    if (liquidityDiff !== 0) return liquidityDiff;
    const volumeDiff = (right.volume24hUsd ?? -1) - (left.volume24hUsd ?? -1);
    if (volumeDiff !== 0) return volumeDiff;
    return left.pairAddress.localeCompare(right.pairAddress);
  })[0] ?? null;
}

function unavailableToken(token: RobinhoodCommunityToken, gaps: RobinhoodPulseGap[]): RobinhoodCommunityTokenMarket {
  return RobinhoodCommunityTokenMarketSchema.parse({
    registry_symbol: token.symbol,
    reported_symbol: null,
    address: token.address,
    official_affiliation: false,
    verification_status: token.verification_status,
    data_status: "unavailable",
    primary_pair_address: null,
    primary_dex_id: null,
    price_usd: null,
    price_change_24h_pct: null,
    market_cap_usd: null,
    fdv_usd: null,
    liquidity_usd: null,
    volume_24h_usd: null,
    buys_24h: null,
    sells_24h: null,
    holder_count: null,
    pair_count: 0,
    market_cap_to_liquidity: null,
    volume_to_liquidity: null,
    eligible_for_breadth: false,
    gaps,
  });
}

async function load(ctx: AdapterContext, now: Date): Promise<RobinhoodCommunityResult> {
  const asOf = now.toISOString();
  let dexBody: unknown;
  try {
    const response = await ctx.fetch(ROBINHOOD_DEXSCREENER_URL);
    if (!response.ok) throw new Error("source_access");
    dexBody = await response.json();
  } catch {
    const tokens = ROBINHOOD_COMMUNITY_TOKEN_UNIVERSE.map((token) => unavailableToken(token, [{
      code: "dexscreener:source_access_gap",
      detail: "Exact-address Robinhood Chain pool data was unavailable.",
    }]));
    return failRefresh({
      status: "unavailable",
      tokens,
      sources: [],
      sourceStatus: [{
        source: "dexscreener:robinhood:registered-tokens",
        role: "Exact-address Robinhood Chain community-token pool data",
        status: "unavailable",
        as_of: asOf,
      }],
      stale: false,
      staleData: [],
      gaps: [{ code: "dexscreener:source_access_gap", detail: "Community-token market data could not be loaded." }],
      confidence: 0,
      asOf,
    });
  }

  let pairs: ParsedPair[];
  try {
    pairs = parseDexPairs(dexBody);
  } catch {
    const tokens = ROBINHOOD_COMMUNITY_TOKEN_UNIVERSE.map((token) => unavailableToken(token, [{
      code: "dexscreener:schema_drift",
      detail: "DexScreener token rows did not satisfy the bounded exact-address contract.",
    }]));
    return failRefresh({
      status: "unavailable",
      tokens,
      sources: [],
      sourceStatus: [{
        source: "dexscreener:robinhood:registered-tokens",
        role: "Exact-address Robinhood Chain community-token pool data",
        status: "schema_drift",
        as_of: asOf,
      }],
      stale: false,
      staleData: [],
      gaps: [{ code: "dexscreener:schema_drift", detail: "Community-token market data schema drifted." }],
      confidence: 0,
      asOf,
    });
  }

  const metadataRows = await Promise.all(
    ROBINHOOD_COMMUNITY_TOKEN_UNIVERSE.map((token) => fetchExplorerMetadata(ctx, token)),
  );
  const tokens: RobinhoodCommunityTokenMarket[] = [];
  const gaps: RobinhoodPulseGap[] = [];
  let completeMetadata = 0;

  for (const [index, token] of ROBINHOOD_COMMUNITY_TOKEN_UNIVERSE.entries()) {
    const tokenPairs = pairs.filter(
      (pair) => normalizedAddress(pair.tokenAddress) === normalizedAddress(token.address),
    );
    const primary = choosePrimary(tokenPairs);
    const metadata = metadataRows[index] ?? { status: "unavailable" as const, symbol: null, holders: null };
    const tokenGaps: RobinhoodPulseGap[] = [];
    if (primary === null) {
      tokenGaps.push({ code: "dexscreener:token_market_gap", detail: `${token.symbol} has no exact-address Robinhood Chain base-token pool row.` });
    }
    if (metadata.status !== "ok") {
      tokenGaps.push({ code: "robinhood-blockscout:metadata_gap", detail: `${token.symbol} explorer metadata was unavailable or invalid.` });
    } else {
      completeMetadata += 1;
    }
    const reported = metadata.symbol ?? primary?.reportedSymbol ?? null;
    const registryMismatch = reported !== null && reported.toUpperCase() !== token.symbol.toUpperCase();
    if (registryMismatch) {
      tokenGaps.push({ code: "robinhood-blockscout:registry_mismatch", detail: `${token.symbol} exact address reported symbol ${reported}.` });
    }
    const eligible = primary !== null
      && metadata.status === "ok"
      && !registryMismatch
      && primary.liquidityUsd !== null
      && primary.liquidityUsd >= MIN_LIQUIDITY_USD
      && primary.marketCapUsd !== null
      && primary.marketCapUsd >= MIN_MARKET_CAP_USD
      && primary.priceChange24hPct !== null
      && primary.volume24hUsd !== null;
    if (primary !== null && !eligible) {
      tokenGaps.push({
        code: "community:breadth_eligibility_gap",
        detail: `${token.symbol} did not satisfy the minimum market-cap, liquidity, price-change, and volume evidence required for breadth calculations.`,
      });
    }
    tokens.push(RobinhoodCommunityTokenMarketSchema.parse({
      registry_symbol: token.symbol,
      reported_symbol: reported,
      address: token.address,
      official_affiliation: false,
      verification_status: token.verification_status,
      data_status: registryMismatch
        ? "registry_mismatch"
        : primary !== null && metadata.status === "ok"
          ? "complete"
          : primary !== null
            ? "partial"
            : "unavailable",
      primary_pair_address: primary?.pairAddress ?? null,
      primary_dex_id: primary?.dexId ?? null,
      price_usd: primary?.priceUsd ?? null,
      price_change_24h_pct: primary?.priceChange24hPct ?? null,
      market_cap_usd: primary?.marketCapUsd ?? null,
      fdv_usd: primary?.fdvUsd ?? null,
      liquidity_usd: primary?.liquidityUsd ?? null,
      volume_24h_usd: primary?.volume24hUsd ?? null,
      buys_24h: primary?.buys24h ?? null,
      sells_24h: primary?.sells24h ?? null,
      holder_count: metadata.holders,
      pair_count: tokenPairs.length,
      market_cap_to_liquidity: ratio(primary?.marketCapUsd ?? null, primary?.liquidityUsd ?? null),
      volume_to_liquidity: ratio(primary?.volume24hUsd ?? null, primary?.liquidityUsd ?? null),
      eligible_for_breadth: eligible,
      gaps: tokenGaps,
    }));
    gaps.push(...tokenGaps.map((gap) => ({ ...gap, detail: `${token.symbol}: ${gap.detail}` })));
  }

  const eligibleCount = tokens.filter((token) => token.eligible_for_breadth).length;
  const status: RobinhoodCommunityResult["status"] = eligibleCount >= 3 && completeMetadata === tokens.length
    ? "valid"
    : tokens.some((token) => token.primary_pair_address !== null)
      ? "partial"
      : "unavailable";
  if (eligibleCount < 3) {
    gaps.push({
      code: "community:thin_universe",
      detail: `Only ${eligibleCount} of ${tokens.length} registered community tokens passed breadth eligibility.`,
    });
  }

  const sourceStatus: RobinhoodSourceStatus[] = [{
    source: "dexscreener:robinhood:registered-tokens",
    role: "Exact-address token price, market cap, liquidity, volume, and transaction activity",
    status: "ok",
    as_of: asOf,
  }];
  for (const [index, token] of ROBINHOOD_COMMUNITY_TOKEN_UNIVERSE.entries()) {
    const metadata = metadataRows[index];
    sourceStatus.push({
      source: `robinhood-blockscout:token:${normalizedAddress(token.address)}`,
      role: `${token.symbol} exact-address explorer metadata and holder count`,
      status: metadata?.status ?? "unavailable",
      as_of: asOf,
    });
  }
  return {
    status,
    tokens,
    sources: [
      "dexscreener:robinhood:registered-tokens",
      ...ROBINHOOD_COMMUNITY_TOKEN_UNIVERSE.map(
        (token) => `robinhood-blockscout:token:${normalizedAddress(token.address)}`,
      ),
    ],
    sourceStatus,
    stale: false,
    staleData: [],
    gaps,
    confidence: Number(((eligibleCount / tokens.length) * 0.7 + (completeMetadata / tokens.length) * 0.3).toFixed(2)),
    asOf,
  };
}

function markStale(result: RobinhoodCommunityResult): RobinhoodCommunityResult {
  return {
    ...result,
    status: result.status === "valid" ? "partial" : result.status,
    stale: true,
    staleData: [...new Set([...result.staleData, "robinhood-community:stale_cache"])],
    sourceStatus: result.sourceStatus.map((source) => ({ ...source, status: "stale" })),
    gaps: [
      ...result.gaps,
      { code: "robinhood-community:stale_cache", detail: "Live refresh failed and cached community-token market data was used." },
    ],
    confidence: Number((result.confidence * 0.7).toFixed(2)),
  };
}

export async function fetchRobinhoodChainCommunity(
  ctx: AdapterContext,
  now: Date = new Date(),
): Promise<RobinhoodCommunityResult> {
  try {
    const result = await withCache(
      ctx.cacheFor<RobinhoodCommunityResult>(CACHE_SPEC),
      "registered-community-universe-v1",
      () => load(ctx, now),
    );
    return result.stale ? markStale(result) : result;
  } catch (error) {
    if (error instanceof RobinhoodCommunityRefreshError) return error.fallback;
    return {
      status: "unavailable",
      tokens: ROBINHOOD_COMMUNITY_TOKEN_UNIVERSE.map((token) => unavailableToken(token, [{
        code: "robinhood-community:source_access_gap",
        detail: "Community-token data could not be loaded.",
      }])),
      sources: [],
      sourceStatus: [],
      stale: false,
      staleData: [],
      gaps: [{ code: "robinhood-community:source_access_gap", detail: "Robinhood Chain community-token evidence was unavailable." }],
      confidence: 0,
      asOf: now.toISOString(),
    };
  }
}

export { MIN_LIQUIDITY_USD, MIN_MARKET_CAP_USD };
