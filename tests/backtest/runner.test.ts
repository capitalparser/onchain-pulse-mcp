import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCompassBacktestFile } from "../../src/backtest/runner.js";

let directory: string | undefined;

afterEach(() => {
  if (directory) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

describe("Compass backtest file runner", () => {
  it("reads only an explicit bounded regular local input file", async () => {
    directory = mkdtempSync(join(tmpdir(), "opm-compass-backtest-"));
    const inputPath = join(directory, "input.jsonl");
    writeFileSync(inputPath, JSON.stringify({
      observed_at: "2026-01-01T00:00:00.000Z",
      judgment: "neutral",
      confidence: 0.5,
      outcomes: { "7d": null, "30d": null, "90d": null },
    }) + "\n");

    const result = await runCompassBacktestFile(inputPath);
    expect(result.observation_count).toBe(1);
    await expect(runCompassBacktestFile("")).rejects.toThrow(/explicit local input/i);
    await expect(runCompassBacktestFile(directory)).rejects.toThrow(/regular file/i);
  });
});
