import type { Adapter, AdapterContext } from "./base.js";
import { withCache } from "./base.js";
import type { EnvConfig } from "../env.js";
import type { AdapterResult } from "../types.js";

const TTL_MS = 60_000;
const CACHE_MAX = 32;
const THIN_LIQUIDITY_USD = 25_000;

interface Input {
  chain: string;
  tokenAddress: string;
}

interface DexScreenerPair {
  chainId?: string;
  pairAddress?: string;
  dexId?: string;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  priceUsd?: string;
  priceChange?: { h24?: number };
  baseToken?: { address?: string; symbol?: string };
  quoteToken?: { address?: string; symbol?: string };
}

interface DexScreenerResponse {
  pairs?: DexScreenerPair[];
}

interface FetchOutcome<T> {
  data?: T;
  stale?: string;
}

async function fetchJson<T>(fetchImpl: typeof fetch, url: string, label: string): Promise<FetchOutcome<T>> {
  try {
    const r = await fetchImpl(url);
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) return { stale: `${label}:auth_rejected` };
      if (r.status === 429) return { stale: `${label}:rate_limited` };
      return { stale: `${label}:http_${r.status}` };
    }
    return { data: (await r.json()) as T };
  } catch {
    return { stale: `${label}:network_error` };
  }
}

function numeric(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function selectBestPair(pairs: DexScreenerPair[], chain: string): DexScreenerPair | undefined {
  const matching = pairs.filter((p) => !p.chainId || p.chainId.toLowerCase() === chain.toLowerCase());
  return matching.sort((a, b) => {
    const liqDelta = (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0);
    if (liqDelta !== 0) return liqDelta;
    return (b.volume?.h24 ?? 0) - (a.volume?.h24 ?? 0);
  })[0];
}

export const dexPool: Adapter<Input> = {
  name: "dex_pool",
  ttlMs: TTL_MS,

  capabilities(_env: EnvConfig) {
    return { byok_active: [], sources: ["dexscreener"] };
  },

  async fetch(input: Input, ctx: AdapterContext): Promise<AdapterResult> {
    const cache = ctx.cacheFor<AdapterResult>({ name: "dex_pool", ttlMs: TTL_MS, max: CACHE_MAX });
    const key = `${input.chain}:${input.tokenAddress.toLowerCase()}`;

    return withCache(cache, key, async () => {
      const staleData: string[] = [];
      const url = `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(input.tokenAddress)}`;
      const fetched = await fetchJson<DexScreenerResponse>(ctx.fetch, url, "dexscreener");

      if (!fetched.data) {
        return {
          data: {},
          sources: [],
          asOf: new Date().toISOString(),
          stale: false,
          stale_data: fetched.stale ? [fetched.stale] : ["dexscreener:empty_response"],
        };
      }

      const best = selectBestPair(fetched.data.pairs ?? [], input.chain);
      if (!best) {
        return {
          data: {},
          sources: [],
          asOf: new Date().toISOString(),
          stale: false,
          stale_data: ["dexscreener:no_matching_pool"],
        };
      }

      const liquidityUsd = numeric(best.liquidity?.usd);
      if ((liquidityUsd ?? 0) < THIN_LIQUIDITY_USD) staleData.push("dexscreener:thin_liquidity");

      return {
        data: {
          pool_address: best.pairAddress,
          dex: best.dexId,
          liquidity_usd: liquidityUsd,
          volume_24h_usd: numeric(best.volume?.h24),
          price_usd: numeric(best.priceUsd),
          price_change_24h_pct: numeric(best.priceChange?.h24),
          base_token_address: best.baseToken?.address,
          base_token_symbol: best.baseToken?.symbol,
          quote_token_address: best.quoteToken?.address,
          quote_token_symbol: best.quoteToken?.symbol,
        },
        sources: ["dexscreener"],
        asOf: new Date().toISOString(),
        stale: false,
        stale_data: staleData,
      };
    });
  },
};

