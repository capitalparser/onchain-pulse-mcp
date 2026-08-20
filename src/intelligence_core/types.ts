import { z } from "zod";

export const IsoTimestampSchema = z.string().datetime({ offset: true });
export type IsoTimestamp = z.infer<typeof IsoTimestampSchema>;

export const SourceTypeSchema = z.enum([
  "chain_rpc",
  "indexer",
  "cex",
  "derivatives",
  "etf",
  "macro",
  "news",
  "social",
  "github",
  "rwa",
  "manual",
  "derived",
]);
export type SourceType = z.infer<typeof SourceTypeSchema>;

const ProvenanceObjectSchema = z.object({
  source: z.string().min(1).max(160),
  source_type: SourceTypeSchema,
  source_at: IsoTimestampSchema,
  observed_at: IsoTimestampSchema,
  ingested_at: IsoTimestampSchema,
  methodology_version: z.string().min(1).max(120),
}).strict();

function addTimeOrderIssues(
  value: { source_at: string; observed_at: string; ingested_at: string },
  ctx: z.RefinementCtx,
): void {
  const sourceAt = Date.parse(value.source_at);
  const observedAt = Date.parse(value.observed_at);
  const ingestedAt = Date.parse(value.ingested_at);
  if (sourceAt > observedAt) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["observed_at"], message: "observed_at must be at or after source_at" });
  }
  if (observedAt > ingestedAt) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["ingested_at"], message: "ingested_at must be at or after observed_at" });
  }
}

export const ProvenanceSchema = ProvenanceObjectSchema.superRefine(addTimeOrderIssues);
export type Provenance = z.infer<typeof ProvenanceSchema>;

export const RawEvidenceSchema = ProvenanceObjectSchema.extend({
  id: z.string().min(1).max(200),
  subject_refs: z.array(z.string().min(1).max(200)).max(64).default([]),
  evidence_ref: z.string().min(1).max(500),
  evidence_hash: z.string().min(1).max(256).optional(),
  stale: z.boolean(),
  confidence: z.number().finite().min(0).max(1),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).strict().superRefine(addTimeOrderIssues);
export type RawEvidence = z.infer<typeof RawEvidenceSchema>;

export const EntityTypeSchema = z.enum([
  "wallet",
  "exchange",
  "custodian",
  "protocol",
  "token_issuer",
  "market_maker",
  "fund",
  "company",
  "dao",
  "bridge",
  "oracle",
  "unknown_cluster",
]);
export type EntityType = z.infer<typeof EntityTypeSchema>;

export const EntityIdentifierSchema = z.object({
  namespace: z.string().min(1).max(80),
  value: z.string().min(1).max(240),
}).strict();

export const EntityLabelSchema = z.object({
  label: z.string().min(1).max(160),
  category: z.string().min(1).max(120).optional(),
  source: z.string().min(1).max(160),
  confidence: z.number().finite().min(0).max(1),
  observed_at: IsoTimestampSchema,
}).strict();

export const EntitySchema = z.object({
  id: z.string().min(1).max(200),
  type: EntityTypeSchema,
  display_name: z.string().min(1).max(200).optional(),
  identifiers: z.array(EntityIdentifierSchema).max(64).default([]),
  labels: z.array(EntityLabelSchema).max(64).default([]),
  confidence: z.number().finite().min(0).max(1),
  methodology_version: z.string().min(1).max(120),
}).strict();
export type Entity = z.infer<typeof EntitySchema>;

export const RelationshipTypeSchema = z.enum([
  "owns_wallet",
  "controls",
  "custodies_for",
  "market_makes_for",
  "issued_by",
  "interacts_with",
  "bridges_to",
  "supplies_to",
  "borrows_from",
  "associated_with",
]);
export type RelationshipType = z.infer<typeof RelationshipTypeSchema>;

export const EntityRelationshipSchema = z.object({
  id: z.string().min(1).max(200),
  from_entity_id: z.string().min(1).max(200),
  to_entity_id: z.string().min(1).max(200),
  type: RelationshipTypeSchema,
  observed_at: IsoTimestampSchema,
  source_refs: z.array(z.string().min(1).max(200)).min(1).max(32),
  confidence: z.number().finite().min(0).max(1),
  methodology_version: z.string().min(1).max(120),
}).strict();
export type EntityRelationship = z.infer<typeof EntityRelationshipSchema>;

export const EconomicEventTypeSchema = z.enum([
  "transfer",
  "swap",
  "stake",
  "unstake",
  "lend",
  "borrow",
  "repay",
  "liquidate",
  "lp_add",
  "lp_remove",
  "bridge",
  "mint",
  "burn",
  "reward_claim",
  "vest",
  "unlock",
  "treasury_transfer",
  "cex_deposit",
  "cex_withdrawal",
  "collateral_add",
  "collateral_remove",
  "governance_action",
  "unknown",
]);
export type EconomicEventType = z.infer<typeof EconomicEventTypeSchema>;

export const EconomicDimensionSchema = z.enum([
  "capital_flow",
  "liquidity",
  "leverage",
  "supply",
  "demand",
  "yield",
  "collateral",
  "ownership",
  "settlement",
  "risk_transfer",
]);
export type EconomicDimension = z.infer<typeof EconomicDimensionSchema>;

export const EventAssetAmountSchema = z.object({
  asset_ref: z.string().min(1).max(200),
  amount: z.string().min(1).max(120),
  unit: z.string().min(1).max(40),
}).strict();

export const EconomicEventSchema = z.object({
  id: z.string().min(1).max(200),
  type: EconomicEventTypeSchema,
  chain: z.string().min(1).max(80).optional(),
  block_number: z.string().min(1).max(80).optional(),
  transaction_ref: z.string().min(1).max(240).optional(),
  protocol_ref: z.string().min(1).max(200).optional(),
  actor_entity_ids: z.array(z.string().min(1).max(200)).max(64).default([]),
  assets: z.array(EventAssetAmountSchema).max(64).default([]),
  dimensions: z.array(EconomicDimensionSchema).min(1).max(10),
  raw_evidence_ids: z.array(z.string().min(1).max(200)).min(1).max(64),
  source_at: IsoTimestampSchema,
  observed_at: IsoTimestampSchema,
  ingested_at: IsoTimestampSchema,
  confidence: z.number().finite().min(0).max(1),
  methodology_version: z.string().min(1).max(120),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).strict().superRefine(addTimeOrderIssues);
export type EconomicEvent = z.infer<typeof EconomicEventSchema>;

export const MetricObservationSchema = z.object({
  id: z.string().min(1).max(200),
  metric_key: z.string().min(1).max(200),
  subject_ref: z.string().min(1).max(200).optional(),
  entity_ref: z.string().min(1).max(200).optional(),
  asset_ref: z.string().min(1).max(200).optional(),
  value: z.number().finite(),
  unit: z.string().min(1).max(80),
  source_at: IsoTimestampSchema,
  observed_at: IsoTimestampSchema,
  ingested_at: IsoTimestampSchema,
  confidence: z.number().finite().min(0).max(1),
  source_refs: z.array(z.string().min(1).max(200)).min(1).max(64),
  methodology_version: z.string().min(1).max(120),
  dimensions: z.record(z.string(), z.string().max(200)).default({}),
}).strict().superRefine(addTimeOrderIssues);
export type MetricObservation = z.infer<typeof MetricObservationSchema>;
