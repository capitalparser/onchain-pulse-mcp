import { describe, it, expect } from "vitest";
import { getEtfFlow, GetEtfFlowArgsSchema } from "../../src/tools/get_etf_flow.js";
import type { AdapterResult } from "../../src/types.js";

describe("get_etf_flow", () => {
  it("returns ToolResponse with summary and inputs from adapter result", async () => {
    const adapterResult: AdapterResult = {
      data: { etf_7d_net_usd: 340_500_000 },
      sources: ["farside.co.uk"],
      asOf: "2026-05-08T07:00:00Z",
      stale: false,
    };

    const r = await getEtfFlow({
      window: "7d",
      adapterResult,
      lang: "en",
      byokActive: [],
      staleData: [],
    });

    expect(r.summary).toMatch(/ETF/);
    expect(r.summary).toMatch(/\$340/);
    expect(r.score).toBeNull();
    expect(r.reading).toBe("unknown");
    expect(r.inputs.etf_7d_net_usd).toBe(340_500_000);
  });

  it("returns reading=unknown and data unavailable when value missing", async () => {
    const r = await getEtfFlow({
      window: "7d",
      adapterResult: { data: {}, sources: [], asOf: "x", stale: true },
      lang: "en",
      byokActive: [],
      staleData: ["farside.co.uk: down"],
    });

    expect(r.reading).toBe("unknown");
    expect(r.score).toBeNull();
    expect(r.summary).toMatch(/unavailable/i);
    expect(r.stale_data).toEqual(["farside.co.uk: down"]);
  });

  it("F19 schema rejects non-7d windows in v0.1", () => {
    expect(() => GetEtfFlowArgsSchema.parse({ window: "1d" })).toThrow();
    expect(() => GetEtfFlowArgsSchema.parse({ window: "30d" })).toThrow();
    expect(GetEtfFlowArgsSchema.parse({ window: "7d" }).window).toBe("7d");
    expect(GetEtfFlowArgsSchema.parse({}).window).toBe("7d");
  });
});
