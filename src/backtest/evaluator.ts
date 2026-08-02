import {
  CompassBacktestReportSchema,
  CompassBacktestRowSchema,
  type CompassBacktestHorizon,
  type CompassBacktestHorizonSummary,
  type CompassBacktestJudgmentSummary,
  type CompassBacktestReport,
  type CompassBacktestRow,
} from "./types.js";
import type { DemandCompassJudgment } from "../eth_demand_compass/types.js";

export const MAX_COMPASS_BACKTEST_INPUT_BYTES = 5 * 1024 * 1024;
export const MAX_COMPASS_BACKTEST_LINES = 10_000;
export const MAX_COMPASS_BACKTEST_LINE_BYTES = 32 * 1024;

const HORIZONS: CompassBacktestHorizon[] = ["7d", "30d", "90d"];
const JUDGMENTS: DemandCompassJudgment[] = ["structural", "flow-driven", "neutral", "data-warning"];

function rounded(value: number): number {
  return Number(value.toFixed(10));
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const center = Math.floor(sorted.length / 2);
  return rounded(sorted.length % 2 === 1 ? sorted[center]! : (sorted[center - 1]! + sorted[center]!) / 2);
}

function summarize(rows: CompassBacktestRow[], horizon: CompassBacktestHorizon): CompassBacktestJudgmentSummary {
  const outcomes = rows.map((row) => row.outcomes[horizon]).filter((outcome) => outcome !== null);
  const ethReturns = outcomes.flatMap((outcome) => typeof outcome.eth_return_pct === "number" ? [outcome.eth_return_pct] : []);
  const structuralRows = rows.filter((row) => row.judgment === "structural");
  const structuralOutcomes = structuralRows.flatMap((row) => {
    const outcome = row.outcomes[horizon];
    return outcome !== null && typeof outcome.value_capture_delta_pct === "number" ? [outcome] : [];
  });
  const confirmationCount = structuralOutcomes.filter((outcome) => typeof outcome.value_capture_delta_pct === "number" && outcome.value_capture_delta_pct > 0).length;
  const availableOutcomeCount = structuralOutcomes.length;
  const observationCount = rows.length;

  return {
    observation_count: observationCount,
    sample_count: outcomes.length,
    coverage: observationCount === 0 ? 0 : rounded(outcomes.length / observationCount),
    eth_return_pct: {
      sample_count: ethReturns.length,
      average: ethReturns.length === 0 ? null : rounded(ethReturns.reduce((total, value) => total + value, 0) / ethReturns.length),
      median: median(ethReturns),
    },
    structural_confirmation: {
      structural_signal_count: structuralRows.length,
      available_outcome_count: availableOutcomeCount,
      confirmation_count: confirmationCount,
      rate: availableOutcomeCount === 0 ? null : rounded(confirmationCount / availableOutcomeCount),
    },
  };
}

function summarizeHorizon(rows: CompassBacktestRow[], horizon: CompassBacktestHorizon): CompassBacktestHorizonSummary {
  const byJudgment = Object.fromEntries(JUDGMENTS.map((judgment) => [
    judgment,
    summarize(rows.filter((row) => row.judgment === judgment), horizon),
  ])) as CompassBacktestHorizonSummary["by_judgment"];
  return { ...summarize(rows, horizon), by_judgment: byJudgment };
}

export function evaluateCompassBacktest(rows: CompassBacktestRow[]): CompassBacktestReport {
  return CompassBacktestReportSchema.parse({
    methodology_version: "compass-backtest-v1",
    interpretation: "descriptive_validation_not_price_prediction",
    observation_count: rows.length,
    horizons: Object.fromEntries(HORIZONS.map((horizon) => [horizon, summarizeHorizon(rows, horizon)])),
  });
}

function inputError(line: number, detail: string): Error {
  return new Error(`Invalid Compass backtest JSONL line ${line}: ${detail}`);
}

export function parseCompassBacktestJsonl(input: string): CompassBacktestRow[] {
  if (Buffer.byteLength(input, "utf8") > MAX_COMPASS_BACKTEST_INPUT_BYTES) {
    throw new Error(`Compass backtest input exceeds ${MAX_COMPASS_BACKTEST_INPUT_BYTES} bytes`);
  }
  if (input.length === 0) return [];
  const lines = input.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  if (lines.length > MAX_COMPASS_BACKTEST_LINES) {
    throw new Error(`Compass backtest input exceeds ${MAX_COMPASS_BACKTEST_LINES} lines`);
  }

  const rows: CompassBacktestRow[] = [];
  const observed = new Set<number>();
  let previousObservedAt: number | null = null;
  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (line.trim().length === 0) throw inputError(lineNumber, "blank lines are not allowed");
    if (Buffer.byteLength(line, "utf8") > MAX_COMPASS_BACKTEST_LINE_BYTES) {
      throw inputError(lineNumber, `line exceeds ${MAX_COMPASS_BACKTEST_LINE_BYTES} bytes`);
    }
    let candidate: unknown;
    try {
      candidate = JSON.parse(line);
    } catch {
      throw inputError(lineNumber, "invalid JSON");
    }
    const parsed = CompassBacktestRowSchema.safeParse(candidate);
    if (!parsed.success) throw inputError(lineNumber, parsed.error.issues[0]?.message ?? "schema validation failed");
    const row = parsed.data;
    const observedAt = Date.parse(row.observed_at);
    if (observed.has(observedAt)) throw inputError(lineNumber, "duplicate observed_at");
    if (previousObservedAt !== null && observedAt < previousObservedAt) throw inputError(lineNumber, "observed_at must be strictly chronological");
    for (const horizon of HORIZONS) {
      const outcome = row.outcomes[horizon];
      if (outcome !== null && Date.parse(outcome.outcome_at) < observedAt) {
        throw inputError(lineNumber, `${horizon} outcome_at precedes observed_at`);
      }
    }
    observed.add(observedAt);
    previousObservedAt = observedAt;
    rows.push(row);
  });
  return rows;
}
