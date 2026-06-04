import type { AdapterResult } from "../types.js";
import type { ForensicsSnapshot, Gap } from "../types.js";

interface Args {
  chain: string;
  tokenAddress: string;
  poolResult: AdapterResult;
  rpcResult: AdapterResult;
  byokActive: string[];
  paidSourcesActive: string[];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function toGaps(poolResult: AdapterResult, rpcResult: AdapterResult): Gap[] {
  const gaps: Gap[] = [{ code: "source_access_gap", detail: "Wallet-flow paid source unavailable in Phase 1." }];

  for (const stale of poolResult.stale_data ?? []) {
    if (stale.includes("thin_liquidity")) {
      gaps.push({ code: "thin_liquidity", detail: "Best discovered pool is below the Phase 1 liquidity threshold." });
    }
    if (stale.includes("no_matching_pool") || stale.includes("empty_response")) {
      gaps.push({ code: "source_access_gap", detail: `Pool discovery incomplete: ${stale}.` });
    }
  }

  if ((rpcResult.stale_data ?? []).length > 0) {
    gaps.push({ code: "rpc_gap", detail: (rpcResult.stale_data ?? []).join(", ") });
  }

  return gaps;
}

export function getTokenForensics(args: Args): ForensicsSnapshot {
  const poolAddress = asString(args.poolResult.data.pool_address);
  const symbol = asString(args.poolResult.data.base_token_symbol);
  const liquidityUsd = asNumber(args.poolResult.data.liquidity_usd);
  const volume24hUsd = asNumber(args.poolResult.data.volume_24h_usd);
  const priceUsd = asNumber(args.poolResult.data.price_usd);
  const gaps = toGaps(args.poolResult, args.rpcResult);
  const hasPool = Boolean(poolAddress);
  const flowReading = hasPool ? "thin-data" : "unknown";
  const confidence = hasPool ? 0.35 : 0;

  const summary = hasPool
    ? `${symbol ?? args.tokenAddress} on ${args.chain} has thin data: pool discovered, wallet-flow source unavailable.`
    : `${args.tokenAddress} on ${args.chain} forensics unavailable: no matching pool discovered.`;

  return {
    summary,
    flow_reading: flowReading,
    as_of: args.poolResult.asOf || args.rpcResult.asOf || new Date().toISOString(),
    token: {
      chain: args.chain,
      address: args.tokenAddress,
      symbol,
      pool_address: poolAddress,
    },
    windows: hasPool
      ? {
          "24h": {
            net_usd: undefined,
          },
        }
      : {},
    top_sellers: [],
    top_accumulators: [],
    cex_deposit_risk: { level: "unknown", signals: [] },
    pool_context: hasPool
      ? {
          liquidity_usd: liquidityUsd,
          volume_24h_usd: volume24hUsd,
          price_usd: priceUsd,
        }
      : undefined,
    sources: unique([...args.poolResult.sources, ...args.rpcResult.sources]),
    stale_data: [...(args.poolResult.stale_data ?? []), ...(args.rpcResult.stale_data ?? [])],
    confidence,
    capabilities: {
      byok_active: args.byokActive,
      paid_sources_active: args.paidSourcesActive,
    },
    gaps,
    unlock_context: undefined,
    sentiment_context: undefined,
  };
}
