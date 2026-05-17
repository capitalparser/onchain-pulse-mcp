import type { Adapter, AdapterContext } from "./base.js";
import { withCache } from "./base.js";
import type { EnvConfig } from "../env.js";
import type { AdapterResult } from "../types.js";

const DERIBIT = "https://www.deribit.com/api/v2/public";
const COINGLASS = "https://open-api-v3.coinglass.com/api";
const TTL_MS = 60_000;
const CACHE_MAX = 8;

async function getJson<T>(fetchImpl: typeof fetch, url: string, headers?: Record<string, string>): Promise<T> {
  const res = await fetchImpl(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return (await res.json()) as T;
}

async function fetchFunding(ctx: AdapterContext, symbol: string): Promise<number> {
  const now = Date.now();
  const start = now - 24 * 60 * 60 * 1000;
  const url = `${DERIBIT}/get_funding_rate_value?instrument_name=${symbol}&start_timestamp=${start}&end_timestamp=${now}`;
  const data = await getJson<{ result: number }>(ctx.fetch, url);
  return data.result;
}

async function fetchPutCall(ctx: AdapterContext, currency: string): Promise<number | undefined> {
  const url = `${DERIBIT}/get_book_summary_by_currency?currency=${currency}&kind=option`;
  const data = await getJson<{ result: Array<{ put_call_ratio?: number }> }>(ctx.fetch, url);
  return data.result.find((x) => typeof x.put_call_ratio === "number")?.put_call_ratio;
}

async function fetchCoinglassOI(ctx: AdapterContext, key: string, symbol: string): Promise<number | undefined> {
  const url = `${COINGLASS}/futures/funding/oi-weight-ohlc?symbol=${symbol}&interval=1d`;
  const data = await getJson<{ data: Array<{ c: number }> }>(ctx.fetch, url, { "CG-API-KEY": key });
  return data.data?.[0]?.c;
}

async function safe<T>(
  promise: Promise<T>,
  annotateOnAuth: string,
  annotateOnOther: string,
  staleData: string[],
): Promise<T | undefined> {
  try {
    return await promise;
  } catch (err) {
    const msg = (err as Error).message ?? "";
    staleData.push(/HTTP 401|HTTP 403/.test(msg) ? annotateOnAuth : annotateOnOther);
    return undefined;
  }
}

export const derivatives: Adapter = {
  name: "derivatives",
  ttlMs: TTL_MS,

  capabilities(env: EnvConfig) {
    const sources = ["deribit"];
    if (env.byok.coinglass) sources.push("coinglass");
    return { byok_active: env.byok.coinglass ? ["coinglass"] : [], sources };
  },

  async fetch(_input, ctx): Promise<AdapterResult> {
    const cache = ctx.cacheFor<AdapterResult>({ name: "derivatives", ttlMs: TTL_MS, max: CACHE_MAX });
    return withCache(cache, "derivatives", async () => {
      const staleData: string[] = [];
      const [fBtc, fEth, pcBtc, pcEth] = await Promise.all([
        safe(fetchFunding(ctx, "BTC-PERPETUAL"), "deribit:auth_rejected", "deribit:btc_funding_unavailable", staleData),
        safe(fetchFunding(ctx, "ETH-PERPETUAL"), "deribit:auth_rejected", "deribit:eth_funding_unavailable", staleData),
        safe(fetchPutCall(ctx, "BTC"), "deribit:auth_rejected", "deribit:btc_pc_unavailable", staleData),
        safe(fetchPutCall(ctx, "ETH"), "deribit:auth_rejected", "deribit:eth_pc_unavailable", staleData),
      ]);

      if (fBtc === undefined && fEth === undefined && pcBtc === undefined && pcEth === undefined) {
        throw new Error("derivatives: all Deribit endpoints failed");
      }

      const data: Record<string, unknown> = {};
      if (fBtc !== undefined) data.funding_btc = fBtc;
      if (fEth !== undefined) data.funding_eth = fEth;
      if (pcBtc !== undefined) data.put_call_btc = pcBtc;
      if (pcEth !== undefined) data.put_call_eth = pcEth;

      const sources = ["deribit"];
      const coinglassKey = ctx.env.byok.coinglass;
      if (coinglassKey) {
        const [oiBtc, oiEth] = await Promise.all([
          safe(
            fetchCoinglassOI(ctx, coinglassKey, "BTC"),
            "coinglass:auth_rejected",
            "coinglass:btc_oi_unavailable",
            staleData,
          ),
          safe(
            fetchCoinglassOI(ctx, coinglassKey, "ETH"),
            "coinglass:auth_rejected",
            "coinglass:eth_oi_unavailable",
            staleData,
          ),
        ]);
        if (oiBtc !== undefined) data.oi_btc_usd = oiBtc;
        if (oiEth !== undefined) data.oi_eth_usd = oiEth;
        if (oiBtc !== undefined || oiEth !== undefined) sources.push("coinglass");
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
