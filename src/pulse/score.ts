import { mean, sigmoid01, zScore } from "../stats.js";
import type { PulseConfig } from "./config.js";

export interface ScoreInput {
  values: Record<string, number>;
  history: Record<string, number[]>;
  cfg: PulseConfig;
}

export interface ScoreResult {
  score: number | null;
  confidence: number;
  contributions: Record<string, number>;
}

export function computePulseScore({ values, history, cfg }: ScoreInput): ScoreResult {
  const contributions: Record<string, number> = {};
  let weightedSum = 0;
  let activeWeightSum = 0;
  const minSamples = cfg.history?.min_samples_for_zscore ?? 5;

  for (const [key, weight] of Object.entries(cfg.weights)) {
    if (!(key in values)) continue;
    const x = values[key]!;
    const hist = history[key] ?? [];
    const z = hist.length >= minSamples ? zScore(x, hist) : 0;
    const dir = cfg.directions[key]!;

    let signed = z;
    if (dir === "negative") signed = -z;
    if (dir === "positive_with_reverse" && Math.abs(z) >= cfg.funding_reverse_z_threshold) {
      signed = -z;
    }

    contributions[key] = signed * weight;
    weightedSum += signed * weight;
    activeWeightSum += weight;
  }

  if (activeWeightSum === 0) {
    return { score: null, confidence: 0, contributions };
  }

  const normalised = weightedSum / activeWeightSum;
  return {
    score: Math.round(sigmoid01(normalised) * 100),
    confidence: round3(activeWeightSum),
    contributions,
  };
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

export { mean };
