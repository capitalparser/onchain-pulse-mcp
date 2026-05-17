import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { getMarketPulse } from "../../src/tools/get_market_pulse.js";
import { loadPulseConfig } from "../../src/pulse/config.js";

const cfg = loadPulseConfig();
const golden = JSON.parse(
  readFileSync(resolve("tests/pulse/fixtures/golden_input.json"), "utf-8"),
) as { values: Record<string, number>; history: Record<string, number[]> };

describe("get_market_pulse", () => {
  it("returns a fully-shaped ToolResponse", async () => {
    const r = await getMarketPulse({
      cfg,
      values: golden.values,
      history: golden.history,
      sources: ["deribit", "defillama"],
      byokActive: [],
      lang: "en",
      asOf: "2026-05-08T00:00:00Z",
      staleData: [],
    });

    expect(r.summary).toMatch(/risk-on|neutral|risk-off/);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score!).toBeLessThanOrEqual(100);
    expect(r.confidence).toBe(1);
    expect(r.capabilities.byok_active).toEqual([]);
  });

  it("returns reading=unknown and confidence=0 when no inputs", async () => {
    const r = await getMarketPulse({
      cfg,
      values: {},
      history: golden.history,
      sources: [],
      byokActive: [],
      lang: "en",
      asOf: "2026-05-08T00:00:00Z",
      staleData: ["all sources down"],
    });

    expect(r.reading).toBe("unknown");
    expect(r.score).toBeNull();
    expect(r.confidence).toBe(0);
    expect(r.summary).toMatch(/unavailable/i);
  });

  it("preserves stale_data and as_of from caller", async () => {
    const r = await getMarketPulse({
      cfg,
      values: golden.values,
      history: golden.history,
      sources: ["deribit"],
      byokActive: [],
      lang: "en",
      asOf: "2026-05-08T07:00:00Z",
      staleData: ["coinglass: rate-limited"],
    });

    expect(r.as_of).toBe("2026-05-08T07:00:00Z");
    expect(r.stale_data).toEqual(["coinglass: rate-limited"]);
  });
});
