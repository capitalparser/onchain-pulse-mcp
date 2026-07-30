import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadPulseConfig, parsePulseConfig } from "../../src/pulse/config.js";

describe("PulseConfig", () => {
  it("parses a valid YAML config", () => {
    const raw = readFileSync(resolve("config/pulse.yaml"), "utf-8");
    const cfg = parsePulseConfig(raw);
    expect(cfg.weights.etf_7d_net_flow_btc_eth).toBe(0.25);
    expect(cfg.directions.btc_dominance_7d_delta).toBe("negative");
    expect(cfg.funding_reverse_z_threshold).toBe(2.0);
    expect(cfg.reading_buckets.risk_on).toEqual([70, 100]);
  });

  it("rejects when weights do not sum to 1.0 within tolerance", () => {
    const bad = `
weights:
  a: 0.5
  b: 0.6
directions:
  a: positive
  b: positive
funding_reverse_z_threshold: 2.0
reading_buckets:
  risk_off: [0, 30]
  neutral: [30, 70]
  risk_on: [70, 100]
`;
    expect(() => parsePulseConfig(bad)).toThrow(/weights must sum/);
  });

  it("loadPulseConfig reads default path", () => {
    const cfg = loadPulseConfig();
    expect(Object.keys(cfg.weights)).toContain("etf_7d_net_flow_btc_eth");
  });

  it("loadPulseConfig expands history path and parses history settings", () => {
    const cfg = loadPulseConfig();
    expect(cfg.history?.path).not.toMatch(/^~/);
    expect(cfg.history?.path).toContain(".cache/onchain-pulse-mcp/history.json");
    expect(cfg.history?.window_days).toBe(30);
    expect(cfg.history?.dedup_hours).toBe(24);
    expect(cfg.history?.min_samples_for_zscore).toBe(5);
  });

  it("rejects when reading_buckets have a gap (uncovered score range)", () => {
    const bad = `
weights: { a: 1.0 }
directions: { a: positive }
funding_reverse_z_threshold: 2.0
reading_buckets:
  risk_off: [0, 25]
  neutral: [30, 70]
  risk_on: [70, 100]
`;
    expect(() => parsePulseConfig(bad)).toThrow(/reading_buckets.*gap|continuous|cover/i);
  });

  it("rejects when reading_buckets overlap", () => {
    const bad = `
weights: { a: 1.0 }
directions: { a: positive }
funding_reverse_z_threshold: 2.0
reading_buckets:
  risk_off: [0, 35]
  neutral: [30, 70]
  risk_on: [70, 100]
`;
    expect(() => parsePulseConfig(bad)).toThrow(/reading_buckets.*overlap/i);
  });

  it("rejects when reading_buckets do not cover [0, 100]", () => {
    const bad = `
weights: { a: 1.0 }
directions: { a: positive }
funding_reverse_z_threshold: 2.0
reading_buckets:
  risk_off: [0, 30]
  neutral: [30, 70]
  risk_on: [70, 95]
`;
    expect(() => parsePulseConfig(bad)).toThrow(/reading_buckets.*0.*100|cover/i);
  });

  it("rejects when a reading_bucket interval is inverted (start > end)", () => {
    const bad = `
weights: { a: 1.0 }
directions: { a: positive }
funding_reverse_z_threshold: 2.0
reading_buckets:
  risk_off: [30, 0]
  neutral: [30, 70]
  risk_on: [70, 100]
`;
    expect(() => parsePulseConfig(bad)).toThrow(/reading_buckets.*invert|start.*end/i);
  });
});
