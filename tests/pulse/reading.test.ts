import { describe, it, expect } from "vitest";
import { loadPulseConfig } from "../../src/pulse/config.js";
import { formatSummary, toReading } from "../../src/pulse/reading.js";

const cfg = loadPulseConfig();

describe("toReading", () => {
  it("returns risk-off for low scores", () => {
    expect(toReading(15, cfg)).toBe("risk-off");
  });

  it("returns neutral mid-range", () => {
    expect(toReading(50, cfg)).toBe("neutral");
  });

  it("returns risk-on for high scores", () => {
    expect(toReading(85, cfg)).toBe("risk-on");
  });

  it("returns unknown when score is null", () => {
    expect(toReading(null, cfg)).toBe("unknown");
  });

  it("places boundaries: 30 -> neutral, 70 -> risk-on", () => {
    expect(toReading(30, cfg)).toBe("neutral");
    expect(toReading(70, cfg)).toBe("risk-on");
  });
});

describe("formatSummary", () => {
  it("English summary: exact format with both ETF and stablecoin inputs", () => {
    const s = formatSummary(
      {
        score: 78,
        reading: "risk-on",
        inputs: { etf_7d_net_usd: 340_000_000, stablecoin_7d_delta_pct: 1.4 },
      },
      "en",
    );
    expect(s).toBe("ETF +$340M 7d, stablecoin +1.4%, reading: risk-on (78/100)");
  });

  it("Korean summary: exact format with both ETF and stablecoin inputs", () => {
    const s = formatSummary(
      {
        score: 78,
        reading: "risk-on",
        inputs: { etf_7d_net_usd: 340_000_000, stablecoin_7d_delta_pct: 1.4 },
      },
      "ko",
    );
    expect(s).toBe("ETF +$340M 7d, stablecoin +1.4%, reading: 리스크-온 (78/100)");
  });

  it("English summary: ETF-only when stablecoin omitted (no trailing comma)", () => {
    const s = formatSummary(
      { score: 50, reading: "neutral", inputs: { etf_7d_net_usd: -120_000_000 } },
      "en",
    );
    expect(s).toBe("ETF -$120M 7d, reading: neutral (50/100)");
  });

  it("English summary: no inputs falls back to reading line only", () => {
    const s = formatSummary({ score: 25, reading: "risk-off", inputs: {} }, "en");
    expect(s).toBe("reading: risk-off (25/100)");
  });

  it("English summary: signed dollar formatting rounds to nearest million", () => {
    expect(
      formatSummary(
        { score: 60, reading: "neutral", inputs: { etf_7d_net_usd: 999_999 } },
        "en",
      ),
    ).toBe("ETF +$1M 7d, reading: neutral (60/100)");
    expect(
      formatSummary(
        { score: 60, reading: "neutral", inputs: { etf_7d_net_usd: 0 } },
        "en",
      ),
    ).toBe("ETF +$0M 7d, reading: neutral (60/100)");
  });

  it("Korean summary: same comma-joined ordering, only reading word translated", () => {
    const s = formatSummary(
      {
        score: 25,
        reading: "risk-off",
        inputs: { etf_7d_net_usd: -200_000_000, stablecoin_7d_delta_pct: -0.5 },
      },
      "ko",
    );
    expect(s).toBe("ETF -$200M 7d, stablecoin -0.5%, reading: 리스크-오프 (25/100)");
  });

  it("handles unknown reading: language-specific fixed string", () => {
    expect(formatSummary({ score: null, reading: "unknown", inputs: {} }, "en")).toBe("data unavailable");
    expect(formatSummary({ score: null, reading: "unknown", inputs: {} }, "ko")).toBe(
      "데이터 사용 불가 (data unavailable)",
    );
  });
});
