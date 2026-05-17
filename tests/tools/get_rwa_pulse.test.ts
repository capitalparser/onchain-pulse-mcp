import { describe, it, expect } from "vitest";
import { getRwaPulse } from "../../src/tools/get_rwa_pulse.js";

describe("get_rwa_pulse", () => {
  it("formats RWA TVL summary", async () => {
    const r = await getRwaPulse({
      window: "7d",
      adapterResult: {
        data: { rwa_tvl_usd: 1_800_000_000 },
        sources: ["defillama"],
        asOf: "2026-05-08T07:00:00Z",
        stale: false,
      },
      lang: "en",
      byokActive: [],
      staleData: [],
    });

    expect(r.summary).toMatch(/RWA TVL/);
    expect(r.summary).toMatch(/\$1\.8B/);
    expect(r.inputs.rwa_tvl_usd).toBe(1_800_000_000);
  });

  it("returns unavailable when tvl is missing", async () => {
    const r = await getRwaPulse({
      window: "7d",
      adapterResult: {
        data: {},
        sources: [],
        asOf: "2026-05-08T07:00:00Z",
        stale: false,
      },
      lang: "en",
      byokActive: [],
      staleData: [],
    });

    expect(r.reading).toBe("unknown");
    expect(r.score).toBeNull();
    expect(r.confidence).toBe(0);
    expect(r.summary).toMatch(/unavailable/i);
    expect(r.inputs).toEqual({});
  });

  it("passes stale_data and as_of through from caller", async () => {
    const r = await getRwaPulse({
      window: "7d",
      adapterResult: {
        data: { rwa_tvl_usd: 1_800_000_000 },
        sources: ["defillama"],
        asOf: "2026-05-08T00:00:00Z",
        stale: true,
      },
      lang: "en",
      byokActive: [],
      staleData: ["defillama:http_503", "macro_rwa:stale_fallback"],
    });

    expect(r.reading).toBe("unknown");
    expect(r.stale_data).toEqual(expect.arrayContaining(["defillama:http_503", "macro_rwa:stale_fallback"]));
    expect(r.as_of).toBe("2026-05-08T00:00:00Z");
  });

  it("formats Korean locale with the same RWA TVL numeric style", async () => {
    const r = await getRwaPulse({
      window: "30d",
      adapterResult: {
        data: { rwa_tvl_usd: 2_500_000_000 },
        sources: ["defillama"],
        asOf: "x",
        stale: false,
      },
      lang: "ko",
      byokActive: [],
      staleData: [],
    });

    expect(r.summary).toBe("RWA TVL $2.5B (30d)");
  });
});
