import type { Adapter, AdapterContext } from "./base.js";
import { withCache } from "./base.js";
import type { EnvConfig } from "../env.js";
import type { AdapterResult } from "../types.js";

const TTL_MS = 5 * 60_000;
const CACHE_MAX = 8;

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

export const cexFlow: Adapter = {
  name: "cex_flow",
  ttlMs: TTL_MS,

  capabilities(env: EnvConfig) {
    const sources = ["coingecko"];
    if (env.byok.glassnode) sources.push("glassnode");
    return { byok_active: env.byok.glassnode ? ["glassnode"] : [], sources };
  },

  async fetch(_input, ctx: AdapterContext): Promise<AdapterResult> {
    const cache = ctx.cacheFor<AdapterResult>({ name: "cex_flow", ttlMs: TTL_MS, max: CACHE_MAX });
    return withCache(cache, "cex_flow", async () => {
      const staleData: string[] = [];
      const data: Record<string, unknown> = {};
      const sources: string[] = [];

      type Exchange = { id: string; trade_volume_24h_btc: number };
      const ex = await fetchJson<Exchange[]>(
        ctx.fetch,
        "https://api.coingecko.com/api/v3/exchanges?per_page=10",
        "coingecko",
      );
      if (ex.data) {
        data.cex_volume_24h_btc = ex.data.reduce((s, e) => s + (e.trade_volume_24h_btc ?? 0), 0);
        sources.push("coingecko");
      } else if (ex.stale) {
        staleData.push(ex.stale);
      }

      const glassnodeKey = ctx.env.byok.glassnode;
      if (glassnodeKey) {
        const url = `https://api.glassnode.com/v1/metrics/transactions/transfers_volume_to_exchanges_sum?a=BTC&api_key=${encodeURIComponent(glassnodeKey)}`;
        const gn = await fetchJson<unknown>(ctx.fetch, url, "glassnode");
        if (gn.data !== undefined) {
          if (Array.isArray(gn.data)) {
            const series = gn.data as Array<{ t?: number; v?: number }>;
            if (series.length === 0) {
              staleData.push("glassnode:empty_series");
            } else {
              const last = series[series.length - 1]!;
              if (typeof last.v === "number") {
                data.exchange_inflow_btc_24h = last.v;
                sources.push("glassnode");
              } else {
                staleData.push("glassnode:schema_drift");
              }
            }
          } else {
            staleData.push("glassnode:schema_drift");
          }
        } else if (gn.stale) {
          staleData.push(gn.stale);
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
