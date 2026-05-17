import { describe, it, expect } from "vitest";
import { toScoreInputs } from "../../src/pipeline/score_inputs.js";
import type { AdapterResult } from "../../src/types.js";

function res(data: Record<string, unknown>): AdapterResult {
  return { data, sources: [], asOf: "t", stale: false };
}

describe("toScoreInputs", () => {
  it("maps every documented adapter field to its score-input key", () => {
    const v = toScoreInputs({
      macro_rwa: res({ etf_7d_net_usd: 340e6, btc_dominance_7d_delta: -0.005, rwa_tvl_7d_delta: 0.012 }),
      onchain_wallet: res({ stablecoin_7d_supply_delta: 0.014 }),
      kr_premium: res({ upbit_netflow_7d_kr: 80e6 }),
      derivatives: res({ funding_avg_btc_eth: 0.0002, options_put_call_ratio: 0.6 }),
      cex_flow: res({}),
    });
    expect(v).toEqual({
      etf_7d_net_flow_btc_eth: 340e6,
      stablecoin_7d_supply_delta: 0.014,
      upbit_netflow_7d_kr: 80e6,
      funding_avg_btc_eth: 0.0002,
      btc_dominance_7d_delta: -0.005,
      options_put_call_ratio: 0.6,
      rwa_tvl_7d_delta: 0.012,
    });
  });

  it("omits keys whose source adapter returned no data", () => {
    const v = toScoreInputs({
      macro_rwa: res({ btc_dominance_7d_delta: -0.005 }),
    });
    expect(v).toEqual({ btc_dominance_7d_delta: -0.005 });
  });

  it("ignores fields not in the score-input map (silent passthrough)", () => {
    const v = toScoreInputs({
      derivatives: res({ funding_avg_btc_eth: 0.0001, oi_btc_usd: 12.5e9 }),
    });
    expect(v).toEqual({ funding_avg_btc_eth: 0.0001 });
  });

  it("returns empty object when no adapter contributes any mapped key", () => {
    expect(toScoreInputs({ derivatives: res({ random_field: 42 }) })).toEqual({});
  });
});
