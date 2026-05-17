import type { AdapterResult, Lang, ToolResponse } from "../types.js";

export interface GetKrPremiumArgs {
  asset: "BTC" | "ETH" | "all";
  adapterResult: AdapterResult;
  lang: Lang;
  byokActive: string[];
  staleData: string[];
}

export async function getKrPremium(args: GetKrPremiumArgs): Promise<ToolResponse> {
  const inputs: Record<string, unknown> = {};
  const parts: string[] = [];

  for (const asset of ["BTC", "ETH"] as const) {
    if (args.asset !== "all" && args.asset !== asset) continue;

    const key = `kr_premium_${asset.toLowerCase()}`;
    const value = args.adapterResult.data[key];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;

    inputs[key] = value;
    const sign = value >= 0 ? "+" : "";
    parts.push(`${asset} kimchi ${sign}${(value * 100).toFixed(1)}%`);
  }

  return {
    summary: parts.length > 0 ? parts.join(" / ") : args.lang === "ko" ? "김프 데이터 사용 불가" : "kimchi data unavailable",
    score: null,
    reading: "unknown",
    as_of: args.adapterResult.asOf,
    inputs,
    sources: args.adapterResult.sources,
    stale_data: args.staleData,
    confidence: parts.length > 0 ? 1 : 0,
    capabilities: { byok_active: args.byokActive },
  };
}
