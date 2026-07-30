import type { Adapter, AdapterContext } from "./base.js";
import { withCache } from "./base.js";
import type { EnvConfig } from "../env.js";
import type { AdapterResult } from "../types.js";

const TTL_MS = 10 * 60_000;
const CACHE_MAX = 8;

interface DefillamaPoint {
  date: number;
  totalCirculating: { peggedUSD: number };
}

interface FetchOutcome<T> {
  data?: T;
  stale?: string;
}

async function fetchJson<T>(
  fetchImpl: typeof fetch,
  url: string,
  label: string,
  headers?: Record<string, string>,
): Promise<FetchOutcome<T>> {
  try {
    const r = await fetchImpl(url, { headers });
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

export const onchainWallet: Adapter = {
  name: "onchain_wallet",
  ttlMs: TTL_MS,

  capabilities(env: EnvConfig) {
    const sources = ["defillama-stablecoins"];
    if (env.byok.nansen) sources.push("nansen");
    return { byok_active: env.byok.nansen ? ["nansen"] : [], sources };
  },

  async fetch(_input, ctx: AdapterContext): Promise<AdapterResult> {
    const cache = ctx.cacheFor<AdapterResult>({ name: "onchain_wallet", ttlMs: TTL_MS, max: CACHE_MAX });
    return withCache(cache, "onchain_wallet", async () => {
      const staleData: string[] = [];
      const data: Record<string, unknown> = {};
      const sources: string[] = [];

      const series = await fetchJson<DefillamaPoint[]>(
        ctx.fetch,
        "https://stablecoins.llama.fi/stablecoincharts/all",
        "defillama-stablecoins",
      );
      if (series.data && series.data.length >= 8) {
        const last = series.data[series.data.length - 1]!.totalCirculating.peggedUSD;
        const sevenAgo = series.data[series.data.length - 8]!.totalCirculating.peggedUSD;
        if (sevenAgo > 0) {
          data.stablecoin_7d_delta_pct = (last - sevenAgo) / sevenAgo;
          data.stablecoin_supply_now_usd = last;
        }
        sources.push("defillama-stablecoins");
      } else if (series.stale) {
        staleData.push(series.stale);
      } else {
        staleData.push("defillama-stablecoins:empty_series");
      }

      const nansenKey = ctx.env.byok.nansen;
      if (nansenKey) {
        const sm = await fetchJson<{ data: { net_usd_7d: number } }>(
          ctx.fetch,
          "https://api.nansen.ai/api/beta/smart-money/holdings?window=7d",
          "nansen",
          { apiKey: nansenKey },
        );
        if (sm.data) {
          data.smart_money_net_usd = sm.data.data.net_usd_7d;
          sources.push("nansen");
        } else if (sm.stale) {
          staleData.push(sm.stale);
        }
      }

      return {
        data,
        sources,
        asOf: new Date().toISOString(),
        stale: false,
        stale_data: staleData,
      };
    });
  },
};
