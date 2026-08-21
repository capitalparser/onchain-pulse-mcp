import { z } from "zod";
import { EntitySchema, EntityTypeSchema, IsoTimestampSchema, type Entity } from "./types.js";

export const EntityResolutionClaimSchema = z.object({
  entity_id: z.string().min(1).max(200),
  entity_type: EntityTypeSchema,
  display_name: z.string().min(1).max(200).optional(),
  identifier_namespace: z.string().min(1).max(80),
  identifier_value: z.string().min(1).max(240),
  label: z.string().min(1).max(160).optional(),
  category: z.string().min(1).max(120).optional(),
  source_ref: z.string().min(1).max(200),
  confidence: z.number().finite().min(0).max(1),
  observed_at: IsoTimestampSchema,
  valid_from: IsoTimestampSchema.optional(),
  valid_to: IsoTimestampSchema.optional(),
  methodology_version: z.string().min(1).max(120),
  reviewed: z.boolean().default(false),
}).strict().superRefine((value, ctx) => {
  if (value.valid_from && value.valid_to && Date.parse(value.valid_from) > Date.parse(value.valid_to)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["valid_to"], message: "valid_to must be at or after valid_from" });
  }
});
export type EntityResolutionClaim = z.infer<typeof EntityResolutionClaimSchema>;

export type EntityResolutionResult =
  | { status: "resolved"; entity: Entity; source_refs: string[] }
  | { status: "ambiguous"; candidate_entity_ids: string[]; source_refs: string[] }
  | { status: "unresolved"; source_refs: string[] };

export function normalizeEntityIdentifier(namespace: string, value: string): { namespace: string; value: string } {
  const normalizedNamespace = namespace.trim().toLowerCase();
  let normalizedValue = value.trim();
  const isEvmAddressNamespace = normalizedNamespace.includes("evm")
    || normalizedNamespace.includes("ethereum")
    || normalizedNamespace.endsWith(":address");
  if (isEvmAddressNamespace && /^0x[0-9a-fA-F]{40}$/.test(normalizedValue)) {
    normalizedValue = normalizedValue.toLowerCase();
  }
  return { namespace: normalizedNamespace, value: normalizedValue };
}

function isClaimActiveAt(claim: EntityResolutionClaim, cutoffAt: string): boolean {
  const cutoff = Date.parse(cutoffAt);
  if (Date.parse(claim.observed_at) > cutoff) return false;
  if (claim.valid_from && Date.parse(claim.valid_from) > cutoff) return false;
  if (claim.valid_to && Date.parse(claim.valid_to) < cutoff) return false;
  return true;
}

export function resolveEntityClaims(args: {
  claims: readonly EntityResolutionClaim[];
  cutoffAt: string;
  minConfidence?: number;
  methodologyVersion?: string;
}): EntityResolutionResult {
  IsoTimestampSchema.parse(args.cutoffAt);
  const minConfidence = args.minConfidence ?? 0.6;
  const parsedClaims = args.claims.map((claim) => EntityResolutionClaimSchema.parse(claim));
  const active = parsedClaims
    .filter((claim) => claim.confidence >= minConfidence)
    .filter((claim) => isClaimActiveAt(claim, args.cutoffAt));

  const sourceRefs = [...new Set(active.map((claim) => claim.source_ref))].sort();
  if (active.length === 0) return { status: "unresolved", source_refs: sourceRefs };

  const groups = new Map<string, EntityResolutionClaim[]>();
  for (const claim of active) {
    const key = `${claim.entity_id}|${claim.entity_type}`;
    const group = groups.get(key) ?? [];
    group.push(claim);
    groups.set(key, group);
  }

  if (groups.size !== 1) {
    return {
      status: "ambiguous",
      candidate_entity_ids: [...new Set(active.map((claim) => claim.entity_id))].sort(),
      source_refs: sourceRefs,
    };
  }

  const agreedClaims = [...groups.values()][0];
  const first = agreedClaims[0];
  const identifiers = [...new Map(agreedClaims.map((claim) => {
    const normalized = normalizeEntityIdentifier(claim.identifier_namespace, claim.identifier_value);
    return [`${normalized.namespace}|${normalized.value}`, normalized] as const;
  })).values()];
  const labels = agreedClaims
    .filter((claim) => claim.label !== undefined)
    .map((claim) => ({
      label: claim.label as string,
      category: claim.category,
      source: claim.source_ref,
      confidence: claim.confidence,
      observed_at: claim.observed_at,
    }));
  const reviewedNames = agreedClaims.filter((claim) => claim.reviewed && claim.display_name).map((claim) => claim.display_name as string);
  const fallbackNames = agreedClaims.filter((claim) => claim.display_name).map((claim) => claim.display_name as string);
  const displayName = [...new Set(reviewedNames)].sort()[0] ?? [...new Set(fallbackNames)].sort()[0];
  const confidence = Math.max(...agreedClaims.map((claim) => claim.confidence));

  const entity = EntitySchema.parse({
    id: first.entity_id,
    type: first.entity_type,
    display_name: displayName,
    identifiers,
    labels,
    confidence,
    methodology_version: args.methodologyVersion ?? "entity-resolution-v1",
  });
  return { status: "resolved", entity, source_refs: sourceRefs };
}
