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

export const FlowReadingSchema = z.enum(["accumulation", "distribution", "mixed", "thin-data", "unknown"]);
export type FlowReading = z.infer<typeof FlowReadingSchema>;

export const GapCodeSchema = z.enum([
  "source_access_gap",
  "thin_liquidity",
  "label_gap",
  "rpc_gap",
  "unlock_data_gap",
  "sentiment_gap",
  "cost_cap_gap",
]);
export type GapCode = z.infer<typeof GapCodeSchema>;

export const GapSchema = z.object({
  code: GapCodeSchema,
  detail: z.string(),
});
export type Gap = z.infer<typeof GapSchema>;

export const WalletFlowSchema = z.object({
  address: z.string(),
  label: z.string().optional(),
  bought_usd: z.number().optional(),
  sold_usd: z.number().optional(),
  net_usd: z.number().optional(),
  avg_entry_price_usd: z.number().optional(),
  avg_exit_price_usd: z.number().optional(),
  remaining_token_balance: z.number().optional(),
  sources: z.array(z.string()),
});
export type WalletFlow = z.infer<typeof WalletFlowSchema>;

export const FlowWindowSchema = z.object({
  bought_usd: z.number().optional(),
  sold_usd: z.number().optional(),
  net_usd: z.number().optional(),
  top_seller_share: z.number().min(0).max(1).optional(),
  top_5_seller_share: z.number().min(0).max(1).optional(),
});
export type FlowWindow = z.infer<typeof FlowWindowSchema>;

export const CexDepositRiskSchema = z.object({
  level: z.enum(["low", "medium", "high", "unknown"]),
  signals: z.array(z.string()),
});
export type CexDepositRisk = z.infer<typeof CexDepositRiskSchema>;

export const PoolContextSchema = z.object({
  liquidity_usd: z.number().optional(),
  volume_24h_usd: z.number().optional(),
  price_usd: z.number().optional(),
});
export type PoolContext = z.infer<typeof PoolContextSchema>;

export const PaidSourceQuoteSchema = z.object({
  source: z.string(),
  mode: z.enum(["disabled", "byok", "x402"]),
  estimated_cost_usd: z.number().min(0).optional(),
  max_cost_usd: z.number().min(0).optional(),
  endpoint: z.string().optional(),
});
export type PaidSourceQuote = z.infer<typeof PaidSourceQuoteSchema>;

export const ForensicsSnapshotSchema = z.object({
  summary: z.string(),
  flow_reading: FlowReadingSchema,
  as_of: z.string(),
  token: z.object({
    chain: z.string(),
    address: z.string(),
    symbol: z.string().optional(),
    pool_address: z.string().optional(),
  }),
  windows: z.record(z.string(), FlowWindowSchema),
  top_sellers: z.array(WalletFlowSchema),
  top_accumulators: z.array(WalletFlowSchema),
  cex_deposit_risk: CexDepositRiskSchema,
  pool_context: PoolContextSchema.optional(),
  unlock_context: z.record(z.string(), z.unknown()).optional(),
  sentiment_context: z.record(z.string(), z.unknown()).optional(),
  sources: z.array(z.string()),
  stale_data: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  capabilities: z.object({
    byok_active: z.array(z.string()),
    paid_sources_active: z.array(z.string()),
    paid_sources_quoted: z.array(PaidSourceQuoteSchema).optional(),
  }),
  gaps: z.array(GapSchema),
});
export type ForensicsSnapshot = z.infer<typeof ForensicsSnapshotSchema>;
