import type { AdapterResult, Lang, ToolResponse } from "../types.js";

export interface GetRwaPulseArgs {
  window: "1d" | "7d" | "30d";
  adapterResult: AdapterResult;
  lang: Lang;
  byokActive: string[];
  staleData: string[];
}

export async function getRwaPulse(args: GetRwaPulseArgs): Promise<ToolResponse> {
  const tvl = args.adapterResult.data.rwa_tvl_usd;
  if (typeof tvl !== "number" || !Number.isFinite(tvl)) {
    return {
      summary: args.lang === "ko" ? "RWA 데이터 사용 불가" : "RWA data unavailable",
      score: null,
      reading: "unknown",
      as_of: args.adapterResult.asOf,
      inputs: {},
      sources: args.adapterResult.sources,
      stale_data: args.staleData,
      confidence: 0,
      capabilities: { byok_active: args.byokActive },
    };
  }

  return {
    summary: `RWA TVL $${(tvl / 1_000_000_000).toFixed(1)}B (${args.window})`,
    score: null,
    reading: "unknown",
    as_of: args.adapterResult.asOf,
    inputs: { rwa_tvl_usd: tvl },
    sources: args.adapterResult.sources,
    stale_data: args.staleData,
    confidence: 1,
    capabilities: { byok_active: args.byokActive },
  };
}
