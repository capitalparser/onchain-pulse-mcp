import { parseFarsideTable } from "../adapters/macro_rwa.js";
import type { HistoricalDatapoint, HistoricalFetcher } from "./warmup.js";

export class WarmupSourceError extends Error {
  constructor(
    readonly source: string,
    reason: string,
  ) {
    super(`${source}: ${reason}`);
  }
}

export const realFetcher: HistoricalFetcher = {
  async etfHistory(days) {
    const btc = await farsideHistory("https://farside.co.uk/btc-etf-flow-all-data/");
    return btc.slice(0, days);
  },
  async stablecoinHistory() {
    return [];
  },
  async rwaTvlHistory() {
    return [];
  },
  async fundingHistory() {
    return [];
  },
  async btcDominanceHistory() {
    const res = await fetch("https://api.coingecko.com/api/v3/global");
    if (!res.ok) throw new WarmupSourceError("btc_dominance", `http_${res.status}`);
    const json = (await res.json()) as { data?: { market_cap_percentage?: { btc?: number } } };
    const value = json.data?.market_cap_percentage?.btc;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new WarmupSourceError("btc_dominance", "schema_drift");
    }
    return [{ asOf: new Date(), value }];
  },
  async optionsPutCallHistory() {
    return [];
  },
  async upbitNetflowHistory() {
    return [];
  },
};

async function farsideHistory(url: string): Promise<HistoricalDatapoint[]> {
  const res = await fetch(url);
  if (!res.ok) throw new WarmupSourceError("etf", `http_${res.status}`);
  const rows = parseFarsideTable(await res.text());
  if (rows.length === 0) throw new WarmupSourceError("etf", "parse_failed");
  return rows.map((row) => ({ asOf: parseFarsideDate(row.date), value: row.flowUsd }));
}

function parseFarsideDate(value: string): Date {
  const t = Date.parse(`${value} UTC`);
  if (Number.isNaN(t)) throw new WarmupSourceError("etf", `bad_date:${value}`);
  return new Date(t);
}
