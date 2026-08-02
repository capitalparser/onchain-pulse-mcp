import { lstat, readFile } from "node:fs/promises";
import { parseCompassBacktestJsonl, evaluateCompassBacktest, MAX_COMPASS_BACKTEST_INPUT_BYTES } from "./evaluator.js";
import type { CompassBacktestReport } from "./types.js";

export async function runCompassBacktestFile(inputPath: string): Promise<CompassBacktestReport> {
  if (inputPath.trim().length === 0 || inputPath.startsWith("file:")) {
    throw new Error("Compass backtest requires an explicit local input file path");
  }
  const details = await lstat(inputPath);
  if (!details.isFile()) throw new Error("Compass backtest input must be a regular file");
  if (details.size > MAX_COMPASS_BACKTEST_INPUT_BYTES) {
    throw new Error(`Compass backtest input exceeds ${MAX_COMPASS_BACKTEST_INPUT_BYTES} bytes`);
  }
  const input = await readFile(inputPath, "utf8");
  return evaluateCompassBacktest(parseCompassBacktestJsonl(input));
}
