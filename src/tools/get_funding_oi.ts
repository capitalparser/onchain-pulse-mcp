import type { AdapterResult, Lang, ToolResponse } from "../types.js";

export interface GetFundingOiArgs {
  asset: "BTC" | "ETH";
  adapterResult: AdapterResult;
  lang: Lang;
  byokActive: string[];
  staleData: string[];
}

export async function getFundingOi(args: GetFundingOiArgs): Promise<ToolResponse> {
  if (args.asset !== "BTC" && args.asset !== "ETH") {
    throw new Error(`asset must be BTC or ETH, got: ${String(args.asset)}`);
  }

  const lower = args.asset.toLowerCase();
  const funding = args.adapterResult.data[`funding_${lower}`];
  const putCall = args.adapterResult.data[`put_call_${lower}`];
  const oi = args.adapterResult.data[`oi_${lower}_usd`];
  const inputs: Record<string, unknown> = {};

  if (typeof funding === "number" && Number.isFinite(funding)) inputs[`funding_${lower}`] = funding;
  if (typeof putCall === "number" && Number.isFinite(putCall)) inputs[`put_call_${lower}`] = putCall;
  if (typeof oi === "number" && Number.isFinite(oi)) inputs[`oi_${lower}_usd`] = oi;

  const fundingPct = typeof funding === "number" && Number.isFinite(funding) ? (funding * 100).toFixed(4) : "n/a";
  const putCallText = typeof putCall === "number" && Number.isFinite(putCall) ? putCall.toFixed(2) : "n/a";
  const oiText = typeof oi === "number" && Number.isFinite(oi) ? `$${(oi / 1_000_000_000).toFixed(1)}B` : "n/a";
  const summary =
    args.lang === "ko"
      ? `${args.asset} funding ${fundingPct}% / P/C ${putCallText} / OI ${oiText}`
      : `${args.asset} funding ${fundingPct}% / put-call ${putCallText} / OI ${oiText}`;

  return {
    summary,
    score: null,
    reading: "unknown",
    as_of: args.adapterResult.asOf,
    inputs,
    sources: args.adapterResult.sources,
    stale_data: args.staleData,
    confidence: Object.keys(inputs).length > 0 ? 1 : 0,
    capabilities: { byok_active: args.byokActive },
  };
}
