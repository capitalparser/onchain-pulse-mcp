import { describe, it, expect } from "vitest";
import {
  getStablecoinPulse,
  GetStablecoinPulseArgsSchema,
} from "../../src/tools/get_stablecoin_pulse.js";

describe("get_stablecoin_pulse", () => {
  it("formats stablecoin delta and current supply", async () => {
    const r = await getStablecoinPulse({
      window: "7d",
      adapterResult: {
        data: { stablecoin_7d_delta_pct: 0.014, stablecoin_supply_now_usd: 153_100_000_000 },
        sources: ["defillama-stablecoins"],
        asOf: "2026-05-08T07:00:00Z",
        stale: false,
      },
      lang: "en",
      byokActive: [],
      staleData: [],
    });

    expect(r.summary).toMatch(/stablecoin/i);
    expect(r.summary).toMatch(/\+1\.4%/);
    expect(r.inputs.stablecoin_7d_delta_pct).toBeCloseTo(0.014, 5);
    expect(r.inputs.stablecoin_supply_now_usd).toBe(153_100_000_000);
  });

  it("returns unavailable summary when no delta", async () => {
    const r = await getStablecoinPulse({
      window: "7d",
      adapterResult: { data: {}, sources: [], asOf: "x", stale: true },
      lang: "en",
      byokActive: [],
      staleData: ["defillama: down"],
    });

    expect(r.summary).toMatch(/unavailable/i);
    expect(r.confidence).toBe(0);
  });

  it("F20 schema rejects non-7d windows in v0.1", () => {
    expect(() => GetStablecoinPulseArgsSchema.parse({ window: "1d" })).toThrow();
    expect(() => GetStablecoinPulseArgsSchema.parse({ window: "30d" })).toThrow();
    expect(GetStablecoinPulseArgsSchema.parse({}).window).toBe("7d");
  });
});
