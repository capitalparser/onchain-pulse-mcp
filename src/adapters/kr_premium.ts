import type { Adapter, AdapterContext } from "./base.js";
import { withCache } from "./base.js";
import type { EnvConfig } from "../env.js";
import type { AdapterResult } from "../types.js";

const TTL_MS = 5 * 60_000;
const CACHE_MAX = 8;

async function safeJson<T>(fetchImpl: typeof fetch, url: string): Promise<T | undefined> {
  try {
    const r = await fetchImpl(url);
    if (!r.ok) return undefined;
    return (await r.json()) as T;
  } catch {
    return undefined;
  }
}

interface UpbitTicker {
  market: string;
  trade_price: number;
  acc_trade_volume_24h: number;
}

export const krPremium: Adapter = {
  name: "kr_premium",
  ttlMs: TTL_MS,

  capabilities(_env: EnvConfig) {
    return { byok_active: [], sources: ["upbit", "coingecko"] };
  },

  async fetch(_input, ctx: AdapterContext): Promise<AdapterResult> {
    const cache = ctx.cacheFor<AdapterResult>({ name: "kr_premium", ttlMs: TTL_MS, max: CACHE_MAX });
    return withCache(cache, "kr_premium", async () => {
      const data: Record<string, unknown> = {};
      const sources: string[] = [];
      const staleData: string[] = [];
      let stale = false;

      const upbit = await safeJson<UpbitTicker[]>(
        ctx.fetch,
        "https://api.upbit.com/v1/ticker?markets=KRW-BTC,KRW-ETH",
      );
      const usd = await safeJson<{
        bitcoin: { usd: number; usd_24h_vol?: number };
        ethereum: { usd: number; usd_24h_vol?: number };
      }>(
        ctx.fetch,
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_vol=true",
      );
      const krwRef = await safeJson<{ tether: { krw: number } }>(
        ctx.fetch,
        "https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=krw",
      );

      if (upbit && usd && krwRef) {
        const usdKrw = krwRef.tether.krw;
        const btc = upbit.find((t) => t.market === "KRW-BTC");
        const eth = upbit.find((t) => t.market === "KRW-ETH");
        if (btc) {
          data.kr_premium_btc = btc.trade_price / (usd.bitcoin.usd * usdKrw) - 1;
          data.upbit_volume_btc_24h = btc.acc_trade_volume_24h;
        }
        if (eth) {
          data.kr_premium_eth = eth.trade_price / (usd.ethereum.usd * usdKrw) - 1;
          data.upbit_volume_eth_24h = eth.acc_trade_volume_24h;
        }
        sources.push("upbit", "coingecko");
      } else {
        stale = true;
        if (!upbit) staleData.push("upbit:http_or_network_error");
        if (!usd || !krwRef) staleData.push("coingecko:http_or_network_error");
      }

      return {
        data,
        sources,
        asOf: new Date().toISOString(),
        stale,
        stale_data: staleData,
      };
    });
  },
};
