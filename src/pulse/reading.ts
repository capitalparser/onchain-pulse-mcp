import type { Reading, Lang } from "../types.js";
import type { PulseConfig } from "./config.js";

export function toReading(score: number | null, cfg: PulseConfig): Reading {
  if (score === null) return "unknown";
  const { risk_off, neutral, risk_on } = cfg.reading_buckets;
  if (score < risk_off[1]) return "risk-off";
  if (score < neutral[1]) return "neutral";
  if (score <= risk_on[1]) return "risk-on";
  return "unknown";
}

export interface SummaryInput {
  score: number | null;
  reading: Reading;
  inputs: Record<string, unknown>;
}

export function formatSummary(s: SummaryInput, lang: Lang): string {
  if (s.reading === "unknown" || s.score === null) {
    return lang === "ko" ? "데이터 사용 불가 (data unavailable)" : "data unavailable";
  }

  const etf = num(s.inputs.etf_7d_net_usd);
  const stable = num(s.inputs.stablecoin_7d_delta_pct);
  const parts: string[] = [];
  if (etf !== undefined) parts.push(`ETF ${signedDollars(etf)} 7d`);
  if (stable !== undefined) parts.push(`stablecoin ${signedPct(stable)}`);

  const readingText = lang === "ko" ? koReading(s.reading) : s.reading;
  parts.push(`reading: ${readingText} (${s.score}/100)`);
  return parts.join(", ");
}

function num(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

function signedDollars(v: number): string {
  const sign = v >= 0 ? "+" : "-";
  const m = Math.abs(v) / 1_000_000;
  return `${sign}$${m.toFixed(0)}M`;
}

function signedPct(v: number): string {
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

function koReading(reading: Exclude<Reading, "unknown">): string {
  return {
    "risk-off": "리스크-오프",
    neutral: "중립",
    "risk-on": "리스크-온",
  }[reading];
}
