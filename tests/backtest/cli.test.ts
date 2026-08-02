import { describe, expect, it } from "vitest";
import { runCompassBacktestCli } from "../../src/backtest/cli.js";

describe("Compass backtest CLI", () => {
  it("requires exactly one explicit input path before reading anything", async () => {
    await expect(runCompassBacktestCli([])).rejects.toThrow(/exactly one explicit local input/i);
    await expect(runCompassBacktestCli(["one", "two"])).rejects.toThrow(/exactly one explicit local input/i);
  });

  it("exposes the backtest as an explicit non-default command", async () => {
    const packagePath = fileURLToPath(new URL("../../package.json", import.meta.url));
    const pkg = JSON.parse(await readFile(packagePath, "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts["compass-backtest"]).toBe("tsx src/index.ts compass-backtest");
    expect(pkg.scripts.dev).toBe("tsx src/index.ts");
  });
});
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
