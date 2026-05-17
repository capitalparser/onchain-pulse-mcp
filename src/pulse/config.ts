import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const DirectionSchema = z.enum(["positive", "negative", "positive_with_reverse"]);

export const PulseConfigSchema = z.object({
  weights: z.record(z.string(), z.number().min(0).max(1)),
  directions: z.record(z.string(), DirectionSchema),
  funding_reverse_z_threshold: z.number().positive(),
  reading_buckets: z.object({
    risk_off: z.tuple([z.number(), z.number()]),
    neutral: z.tuple([z.number(), z.number()]),
    risk_on: z.tuple([z.number(), z.number()]),
  }),
});
export type PulseConfig = z.infer<typeof PulseConfigSchema>;

export function parsePulseConfig(raw: string): PulseConfig {
  const obj = parseYaml(raw);
  const cfg = PulseConfigSchema.parse(obj);
  const sum = Object.values(cfg.weights).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > 0.001) {
    throw new Error(`weights must sum to 1.0 (got ${sum.toFixed(4)})`);
  }
  for (const key of Object.keys(cfg.weights)) {
    if (!cfg.directions[key]) {
      throw new Error(`directions missing entry for weight key: ${key}`);
    }
  }
  validateReadingBuckets(cfg.reading_buckets);
  return cfg;
}

function validateReadingBuckets(b: PulseConfig["reading_buckets"]): void {
  const ordered = [
    { name: "risk_off", range: b.risk_off },
    { name: "neutral", range: b.neutral },
    { name: "risk_on", range: b.risk_on },
  ];

  for (const { name, range } of ordered) {
    if (range[0] > range[1]) {
      throw new Error(`reading_buckets.${name} inverted: start ${range[0]} > end ${range[1]}`);
    }
  }

  if (ordered[0]!.range[0] !== 0 || ordered[2]!.range[1] !== 100) {
    throw new Error("reading_buckets must cover [0, 100] inclusively");
  }

  for (let i = 0; i < ordered.length - 1; i++) {
    const cur = ordered[i]!.range;
    const next = ordered[i + 1]!.range;
    if (cur[1] < next[0]) {
      throw new Error(
        `reading_buckets gap between ${ordered[i]!.name} (ends ${cur[1]}) and ${ordered[i + 1]!.name} (starts ${next[0]})`,
      );
    }
    if (cur[1] > next[0]) {
      throw new Error(`reading_buckets overlap between ${ordered[i]!.name} and ${ordered[i + 1]!.name}`);
    }
  }
}

export function loadPulseConfig(path = resolve("config/pulse.yaml")): PulseConfig {
  return parsePulseConfig(readFileSync(path, "utf-8"));
}
