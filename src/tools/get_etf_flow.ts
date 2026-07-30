import { z } from "zod";
import type { AdapterResult, Lang, ToolResponse } from "../types.js";

/**
 * F19: v0.1 accepts only `window: "7d"` because the macro/RWA adapter only
 * exposes `etf_7d_net_usd`. v0.2 can widen this once 1d/30d fields exist.
 */
export const GetEtfFlowArgsSchema = z.object({
  window: z.literal("7d").default("7d"),
});

export interface GetEtfFlowArgs {
  window: "7d";
  adapterResult: AdapterResult;
  lang: Lang;
  byokActive: string[];
  staleData: string[];
}

export async function getEtfFlow(args: GetEtfFlowArgs): Promise<ToolResponse> {
  const value = args.adapterResult.data.etf_7d_net_usd;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return {
      summary: args.lang === "ko" ? "ETF 데이터 사용 불가" : "ETF data unavailable",
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

  const summary =
    args.lang === "ko"
      ? `ETF ${signedDollars(value)} ${args.window} 누적`
      : `ETF ${signedDollars(value)} ${args.window} cumulative`;

  return {
    summary,
    score: null,
    reading: "unknown",
    as_of: args.adapterResult.asOf,
    inputs: { etf_7d_net_usd: value },
    sources: args.adapterResult.sources,
    stale_data: args.staleData,
    confidence: 1,
    capabilities: { byok_active: args.byokActive },
  };
}

function signedDollars(value: number): string {
  const sign = value >= 0 ? "+" : "-";
  const millions = Math.abs(value) / 1_000_000;
  return `${sign}$${Math.trunc(millions)}M`;
}
