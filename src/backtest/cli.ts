import { runCompassBacktestFile } from "./runner.js";
import type { CompassBacktestReport } from "./types.js";

export async function runCompassBacktestCli(args: string[]): Promise<CompassBacktestReport> {
  if (args.length !== 1) throw new Error("compass-backtest requires exactly one explicit local input path");
  return runCompassBacktestFile(args[0]!);
}
