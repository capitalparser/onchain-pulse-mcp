import type { AdapterResult } from "../types.js";

/**
 * Spec section 6 score-input map: adapter `data` field to `computePulseScore`
 * input key. Additions here should be paired with the producing adapter.
 */
const MAP: Array<[adapterName: string, dataField: string, inputKey: string]> = [
  ["macro_rwa", "etf_7d_net_usd", "etf_7d_net_flow_btc_eth"],
  ["macro_rwa", "btc_dominance_7d_delta", "btc_dominance_7d_delta"],
  ["macro_rwa", "rwa_tvl_7d_delta", "rwa_tvl_7d_delta"],
  ["onchain_wallet", "stablecoin_7d_delta_pct", "stablecoin_7d_supply_delta"],
  ["kr_premium", "upbit_netflow_7d_kr", "upbit_netflow_7d_kr"],
  ["derivatives", "funding_avg_btc_eth", "funding_avg_btc_eth"],
  ["derivatives", "options_put_call_ratio", "options_put_call_ratio"],
];

export function toScoreInputs(perAdapter: Record<string, AdapterResult>): Record<string, number> {
  const out: Record<string, number> = {};

  for (const [adapterName, dataField, inputKey] of MAP) {
    const value = perAdapter[adapterName]?.data[dataField];
    if (typeof value === "number" && Number.isFinite(value)) {
      out[inputKey] = value;
    }
  }

  return out;
}
