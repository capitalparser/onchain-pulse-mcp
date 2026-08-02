import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("Telegram daemon CLI", () => {
  it("exposes a dedicated daemon command without changing the MCP default command", async () => {
    const packagePath = fileURLToPath(new URL("../../package.json", import.meta.url));
    const pkg = JSON.parse(await readFile(packagePath, "utf8")) as { scripts: Record<string, string> };

    expect(pkg.scripts["telegram-daemon"]).toBe("tsx src/index.ts telegram-daemon");
    expect(pkg.scripts.dev).toBe("tsx src/index.ts");
  });
});
