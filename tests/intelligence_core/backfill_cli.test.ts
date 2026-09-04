import { describe, expect, it } from "vitest";
import { parseIntelligenceBackfillCliArgs } from "../../src/intelligence_core/backfill_cli.js";

describe("parseIntelligenceBackfillCliArgs", () => {
  it("parses the bounded GrowThePie ecosystem backfill arguments", () => {
    expect(parseIntelligenceBackfillCliArgs([
      "--start", "2026-01-01",
      "--end", "2026-03-31",
      "--window", "30d",
      "--manifest-dir", "/tmp/manifests",
      "--run-id", "run-001",
    ])).toEqual({
      startCutoffDay: "2026-01-01",
      endCutoffDay: "2026-03-31",
      window: "30d",
      manifestDir: "/tmp/manifests",
      runId: "run-001",
    });
  });

  it("requires both range boundaries and rejects unknown or duplicate flags", () => {
    expect(() => parseIntelligenceBackfillCliArgs(["--start", "2026-01-01"]))
      .toThrow(/--end is required/);
    expect(() => parseIntelligenceBackfillCliArgs([
      "--start", "2026-01-01",
      "--start", "2026-01-02",
      "--end", "2026-01-03",
    ])).toThrow(/duplicate intelligence-backfill argument/);
    expect(() => parseIntelligenceBackfillCliArgs([
      "--start", "2026-01-01",
      "--end", "2026-01-03",
      "--source", "anything",
    ])).toThrow(/unknown intelligence-backfill argument/);
  });
});
