import { z } from "zod";
import { CommunityVerificationStatusSchema } from "./registry.js";

const NullableNonnegative = z.number().finite().nonnegative().nullable();
const NullableFinite = z.number().finite().nullable();
const Confidence = z.number().finite().min(0).max(1);

export const RobinhoodChainPhaseSchema = z.enum([
  "capital_formation",
  "credit_activation",
  "leader_concentration",
  "leader_beta_diffusion",
  "fragile_blowoff",
  "mixed",
  "data_warning",
  "unavailable",
]);
export type RobinhoodChainPhase = z.infer<typeof RobinhoodChainPhaseSchema>;

export const RobinhoodCapitalBaseStatusSchema = z.enum([
  "expanding",
  "stable",
  "contracting",
  "mixed",
  "unknown",
]);
export const RobinhoodCreditActivationStatusSchema = z.enum([
  "active",
  "forming",
  "inactive",
  "unknown",
]);
export const RobinhoodBreadthStatusSchema = z.enum([
  "leader_beta_diffusion",
  "leader_only",
  "broad_risk_on",
  "mixed",
  "thin_data",
  "unknown",
]);
export const RobinhoodFragilityStatusSchema = z.enum([
  "low",
  "moderate",
  "high",
  "unknown",
]);
export const RobinhoodEthCaptureStatusSchema = z.enum([
  "protocol_link_present_unquantified",
  "limited",
  "unknown",
]);

export const RobinhoodPulseGapSchema = z.object({
  code: z.string().min(1).max(160),
  detail: z.string().min(1).max(1_000),
}).strict();
export type RobinhoodPulseGap = z.infer<typeof RobinhoodPulseGapSchema>;

export const RobinhoodSourceStatusSchema = z.object({
  source: z.string().min(1).max(200),
  role: z.string().min(1).max(300),
  status: z.enum(["ok", "stale", "unavailable", "schema_drift"]),
  as_of: z.string().datetime({ offset: true }).nullable(),
}).strict();
export type RobinhoodSourceStatus = z.infer<typeof RobinhoodSourceStatusSchema>;

export const RobinhoodChainFundamentalsSchema = z.object({
  tvl_usd: NullableNonnegative,
  tvl_change_1d_pct: NullableFinite,
  stablecoin_supply_usd: NullableNonnegative,
  stablecoin_change_7d_pct: NullableFinite,
  dex_volume_24h_usd: NullableNonnegative,
  dex_volume_7d_usd: NullableNonnegative,
  dex_change_7d_pct: NullableFinite,
  app_fees_24h_usd: NullableNonnegative,
  app_fees_7d_usd: NullableNonnegative,
  app_fees_change_7d_pct: NullableFinite,
  dex_protocol_count: z.number().int().nonnegative().nullable(),
  fee_protocol_count: z.number().int().nonnegative().nullable(),
}).strict();
export type RobinhoodChainFundamentals = z.infer<typeof RobinhoodChainFundamentalsSchema>;

export const RobinhoodCreditMetricsSchema = z.object({
  listed_market_count: z.number().int().nonnegative().nullable(),
  active_market_count: z.number().int().nonnegative().nullable(),
  supply_usd: NullableNonnegative,
  borrow_usd: NullableNonnegative,
  liquidity_usd: NullableNonnegative,
  collateral_usd: NullableNonnegative,
  utilisation: z.number().finite().min(0).max(1).nullable(),
  high_utilisation_market_count: z.number().int().nonnegative().nullable(),
  supply_change_7d_pct: NullableFinite,
  borrow_change_7d_pct: NullableFinite,
  utilisation_change_7d: z.number().finite().min(-1).max(1).nullable(),
  history_market_count: z.number().int().nonnegative().nullable(),
  history_covered_market_count: z.number().int().nonnegative().nullable(),
  unique_borrowers_change_7d_pct: z.null(),
  loan_asset_symbols: z.array(z.string().min(1).max(64)).max(1_000),
  collateral_asset_symbols: z.array(z.string().min(1).max(64)).max(1_000),
  stock_token_collateral_market_count: z.null(),
}).strict();
export type RobinhoodCreditMetrics = z.infer<typeof RobinhoodCreditMetricsSchema>;

export const RobinhoodCommunityTokenMarketSchema = z.object({
  registry_symbol: z.string().min(1).max(32),
  reported_symbol: z.string().min(1).max(64).nullable(),
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  official_affiliation: z.literal(false),
  verification_status: CommunityVerificationStatusSchema,
  data_status: z.enum(["complete", "partial", "unavailable", "registry_mismatch"]),
  primary_pair_address: z.string().min(1).max(160).nullable(),
  primary_dex_id: z.string().min(1).max(120).nullable(),
  price_usd: NullableNonnegative,
  price_change_24h_pct: NullableFinite,
  market_cap_usd: NullableNonnegative,
  fdv_usd: NullableNonnegative,
  liquidity_usd: NullableNonnegative,
  volume_24h_usd: NullableNonnegative,
  buys_24h: z.number().int().nonnegative().nullable(),
  sells_24h: z.number().int().nonnegative().nullable(),
  holder_count: z.number().int().nonnegative().nullable(),
  pair_count: z.number().int().nonnegative(),
  market_cap_to_liquidity: NullableNonnegative,
  volume_to_liquidity: NullableNonnegative,
  eligible_for_breadth: z.boolean(),
  gaps: z.array(RobinhoodPulseGapSchema).max(32),
}).strict();
export type RobinhoodCommunityTokenMarket = z.infer<typeof RobinhoodCommunityTokenMarketSchema>;

export const RobinhoodBreadthMetricsSchema = z.object({
  universe_size: z.number().int().nonnegative(),
  eligible_count: z.number().int().nonnegative(),
  positive_24h_count: z.number().int().nonnegative(),
  positive_24h_share: z.number().finite().min(0).max(1).nullable(),
  volume_active_count: z.number().int().nonnegative(),
  volume_active_share: z.number().finite().min(0).max(1).nullable(),
  liquidity_breadth_count: z.number().int().nonnegative(),
  liquidity_breadth_share: z.number().finite().min(0).max(1).nullable(),
  leader_symbol: z.string().min(1).max(32).nullable(),
  leader_return_24h_pct: NullableFinite,
  beta_median_return_24h_pct: NullableFinite,
  leader_market_cap_share: z.number().finite().min(0).max(1).nullable(),
  median_market_cap_to_liquidity: NullableNonnegative,
  median_volume_to_liquidity: NullableNonnegative,
}).strict();
export type RobinhoodBreadthMetrics = z.infer<typeof RobinhoodBreadthMetricsSchema>;

function axisSchema<T extends z.ZodTypeAny>(status: T) {
  return z.object({
    status,
    evidence: z.array(z.string().min(1).max(500)).max(20),
    confidence: Confidence,
  }).strict();
}

export const RobinhoodChainPulseSnapshotSchema = z.object({
  summary: z.string().min(1).max(1_500),
  as_of: z.string().datetime({ offset: true }),
  phase: RobinhoodChainPhaseSchema,
  chain: z.object({
    chain_id: z.literal(4663),
    native_gas_symbol: z.literal("ETH"),
    official_chain_token: z.null(),
    rollup_stack: z.literal("arbitrum"),
    settlement_layer: z.literal("ethereum"),
    data_availability: z.literal("ethereum_blobs"),
    community_tokens_are_unaffiliated: z.literal(true),
  }).strict(),
  fundamentals: RobinhoodChainFundamentalsSchema,
  credit: RobinhoodCreditMetricsSchema,
  community_tokens: z.array(RobinhoodCommunityTokenMarketSchema).max(50),
  breadth: RobinhoodBreadthMetricsSchema,
  axes: z.object({
    capital_base: axisSchema(RobinhoodCapitalBaseStatusSchema),
    credit_activation: axisSchema(RobinhoodCreditActivationStatusSchema),
    speculative_breadth: axisSchema(RobinhoodBreadthStatusSchema),
    fragility: axisSchema(RobinhoodFragilityStatusSchema),
    eth_capture: axisSchema(RobinhoodEthCaptureStatusSchema),
  }).strict(),
  sources: z.array(z.string().min(1).max(200)).max(100),
  source_status: z.array(RobinhoodSourceStatusSchema).max(100),
  stale_data: z.array(z.string().min(1).max(300)).max(100),
  gaps: z.array(RobinhoodPulseGapSchema).max(100),
  confidence: Confidence,
  interpretation_boundary: z.array(z.string().min(1).max(500)).min(1).max(20),
  methodology_version: z.literal("robinhood-chain-pulse-v1"),
}).strict();

export type RobinhoodChainPulseSnapshot = z.infer<typeof RobinhoodChainPulseSnapshotSchema>;
