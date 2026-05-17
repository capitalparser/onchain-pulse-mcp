import { makeFileHistoryStore } from "../pulse/history.js";

export interface HistoricalDatapoint {
  asOf: Date;
  value: number;
}

export interface HistoricalFetcher {
  etfHistory?(days: number): Promise<HistoricalDatapoint[]>;
  stablecoinHistory?(days: number): Promise<HistoricalDatapoint[]>;
  rwaTvlHistory?(days: number): Promise<HistoricalDatapoint[]>;
  fundingHistory?(days: number): Promise<HistoricalDatapoint[]>;
  btcDominanceHistory?(days: number): Promise<HistoricalDatapoint[]>;
  optionsPutCallHistory?(days: number): Promise<HistoricalDatapoint[]>;
  upbitNetflowHistory?(days: number): Promise<HistoricalDatapoint[]>;
}

export interface WarmupOpts {
  historyPath: string;
  days: number;
  keys?: string[];
  fetcher: HistoricalFetcher;
}

export interface WarmupResult {
  written: Record<string, number>;
  failures: Array<{ key: string; reason: string }>;
  skipped: string[];
}

const JOBS: Array<{
  key: string;
  method: keyof HistoricalFetcher;
}> = [
  { key: "etf_7d_net_flow_btc_eth", method: "etfHistory" },
  { key: "stablecoin_7d_supply_delta", method: "stablecoinHistory" },
  { key: "rwa_tvl_7d_delta", method: "rwaTvlHistory" },
  { key: "funding_avg_btc_eth", method: "fundingHistory" },
  { key: "btc_dominance_7d_delta", method: "btcDominanceHistory" },
  { key: "options_put_call_ratio", method: "optionsPutCallHistory" },
  { key: "upbit_netflow_7d_kr", method: "upbitNetflowHistory" },
];

export async function runWarmup(opts: WarmupOpts): Promise<WarmupResult> {
  const store = makeFileHistoryStore({ path: opts.historyPath, windowDays: opts.days, dedupHours: 24 });
  const result: WarmupResult = { written: {}, failures: [], skipped: [] };
  const want = (key: string) => !opts.keys || opts.keys.includes(key);

  for (const job of JOBS) {
    if (!want(job.key)) continue;

    const fetchHistory = opts.fetcher[job.method];
    if (!fetchHistory) {
      result.skipped.push(job.key);
      continue;
    }

    try {
      const datapoints = await fetchHistory(opts.days);
      let count = 0;
      for (const dp of datapoints) {
        if (!Number.isFinite(dp.value)) continue;
        store.appendDatapoint(job.key, dp.value, dp.asOf);
        count += 1;
      }
      result.written[job.key] = count;
    } catch (err) {
      result.failures.push({ key: job.key, reason: (err as Error).message });
    }
  }

  await store.save();
  return result;
}
