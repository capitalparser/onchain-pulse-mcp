import { z } from "zod";
import type { AdapterResult, Lang, ToolResponse } from "../types.js";

/** F20: v0.1 exposes only the 7d stablecoin delta. */
export const GetStablecoinPulseArgsSchema = z.object({
  window: z.literal("7d").default("7d"),
});

export interface GetStablecoinPulseArgs {
  window: "7d";
  adapterResult: AdapterResult;
  lang: Lang;
  byokActive: string[];
  staleData: string[];
}

export async function getStablecoinPulse(args: GetStablecoinPulseArgs): Promise<ToolResponse> {
  const delta = args.adapterResult.data.stablecoin_7d_delta_pct;
  const supplyNow = args.adapterResult.data.stablecoin_supply_now_usd;
  if (typeof delta !== "number" || !Number.isFinite(delta)) {
    return unavailable(args);
  }

  const pct = Math.abs(delta * 100).toFixed(1);
  const sign = delta >= 0 ? "+" : "-";
  const summary =
    args.lang === "ko"
      ? `stablecoin 공급 ${sign}${pct}% (${args.window})`
      : `stablecoin supply ${sign}${pct}% (${args.window})`;

  return {
    summary,
    score: null,
    reading: "unknown",
    as_of: args.adapterResult.asOf,
    inputs: {
      stablecoin_7d_delta_pct: delta,
      ...(typeof supplyNow === "number" && Number.isFinite(supplyNow) ? { stablecoin_supply_now_usd: supplyNow } : {}),
    },
    sources: args.adapterResult.sources,
    stale_data: args.staleData,
    confidence: 1,
    capabilities: { byok_active: args.byokActive },
  };
}

function unavailable(args: GetStablecoinPulseArgs): ToolResponse {
  return {
    summary: args.lang === "ko" ? "stablecoin 데이터 사용 불가" : "stablecoin data unavailable",
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
