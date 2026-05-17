import { z } from "zod";

export const ReadingSchema = z.enum(["risk-off", "neutral", "risk-on", "unknown"]);
export type Reading = z.infer<typeof ReadingSchema>;

export const LangSchema = z.enum(["en", "ko"]);
export type Lang = z.infer<typeof LangSchema>;

export const CapabilitiesSchema = z.object({
  byok_active: z.array(z.string()),
  sources: z.array(z.string()).optional(),
});
export type Capabilities = z.infer<typeof CapabilitiesSchema>;

export const AdapterResultSchema = z.object({
  data: z.record(z.string(), z.unknown()),
  sources: z.array(z.string()),
  asOf: z.string(),
  stale: z.boolean(),
  stale_data: z.array(z.string()).optional(),
});
export type AdapterResult = z.infer<typeof AdapterResultSchema>;

export const ToolResponseSchema = z.object({
  summary: z.string(),
  score: z.number().min(0).max(100).nullable(),
  reading: ReadingSchema,
  as_of: z.string(),
  inputs: z.record(z.string(), z.unknown()),
  sources: z.array(z.string()),
  stale_data: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  capabilities: CapabilitiesSchema,
});
export type ToolResponse = z.infer<typeof ToolResponseSchema>;
