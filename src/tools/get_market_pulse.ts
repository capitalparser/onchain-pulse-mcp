import type { Lang, ToolResponse } from "../types.js";
import type { PulseConfig } from "../pulse/config.js";
import { formatSummary, toReading } from "../pulse/reading.js";
import { computePulseScore } from "../pulse/score.js";

export interface GetMarketPulseArgs {
  cfg: PulseConfig;
  values: Record<string, number>;
  history: Record<string, number[]>;
  sources: string[];
  byokActive: string[];
  lang: Lang;
  asOf: string;
  staleData: string[];
}

export async function getMarketPulse(args: GetMarketPulseArgs): Promise<ToolResponse> {
  const { score, confidence } = computePulseScore({
    values: args.values,
    history: args.history,
    cfg: args.cfg,
  });
  const reading = toReading(score, args.cfg);
  const summary = formatSummary({ score, reading, inputs: args.values }, args.lang);

  return {
    summary,
    score,
    reading,
    as_of: args.asOf,
    inputs: args.values,
    sources: args.sources,
    stale_data: args.staleData,
    confidence,
    capabilities: { byok_active: args.byokActive },
  };
}
