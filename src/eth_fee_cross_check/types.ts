import { z } from "zod";

export const ETH_FEE_CROSS_CHECK_MAX_BLOCKS = 64;

export const GetEthFeeCrossCheckInputSchema = z
  .object({
    start_block: z.number().int().nonnegative().safe(),
    end_block: z.number().int().nonnegative().safe(),
    include_blocks: z.boolean().default(false),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.end_block < input.start_block) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["end_block"],
        message: "end_block must be greater than or equal to start_block.",
      });
    }
    if (input.end_block - input.start_block + 1 > ETH_FEE_CROSS_CHECK_MAX_BLOCKS) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["end_block"],
        message: `Requested range must contain at most ${ETH_FEE_CROSS_CHECK_MAX_BLOCKS} blocks.`,
      });
    }
  });
export type GetEthFeeCrossCheckInput = z.infer<typeof GetEthFeeCrossCheckInputSchema>;

const UnsignedDecimalSchema = z.string().regex(/^(?:0|[1-9]\d*)$/);
const ExactEthDecimalSchema = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/);

function exactEthDecimalToWei(eth: string): bigint {
  const [whole, fraction = ""] = eth.split(".");
  return BigInt(whole!) * 1_000_000_000_000_000_000n + BigInt(fraction.padEnd(18, "0"));
}

export const ExactEthAmountSchema = z
  .object({
    wei: UnsignedDecimalSchema,
    eth: ExactEthDecimalSchema,
  })
  .strict()
  .superRefine((amount, context) => {
    if (!UnsignedDecimalSchema.safeParse(amount.wei).success || !ExactEthDecimalSchema.safeParse(amount.eth).success) {
      return;
    }
    if (BigInt(amount.wei) !== exactEthDecimalToWei(amount.eth)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["eth"],
        message: "eth must be the exact decimal representation of wei.",
      });
    }
  });
export type ExactEthAmount = z.infer<typeof ExactEthAmountSchema>;

export const EthFeeCrossCheckGapCodeSchema = z.enum([
  "rpc_not_configured",
  "rpc_access_gap",
  "rpc_finality_gap",
  "rpc_schema_drift",
  "rpc_evidence_mismatch",
  "source_stale",
]);
export type EthFeeCrossCheckGapCode = z.infer<typeof EthFeeCrossCheckGapCodeSchema>;

export const EthFeeCrossCheckGapSchema = z
  .object({
    code: EthFeeCrossCheckGapCodeSchema,
    detail: z.string().min(1),
  })
  .strict();
export type EthFeeCrossCheckGap = z.infer<typeof EthFeeCrossCheckGapSchema>;

export const EthFeeCrossCheckSourceStatusSchema = z
  .object({
    source: z.string().min(1),
    role: z.string().min(1),
    as_of: z.string().min(1).nullable(),
    stale: z.boolean(),
  })
  .strict();
export type EthFeeCrossCheckSourceStatus = z.infer<typeof EthFeeCrossCheckSourceStatusSchema>;

export const EthFeeCrossCheckMetricsSchema = z
  .object({
    execution_fee: ExactEthAmountSchema.nullable(),
    base_fee_burn: ExactEthAmountSchema.nullable(),
    priority_fee: ExactEthAmountSchema.nullable(),
    blob_fee_burn: ExactEthAmountSchema.nullable(),
    gross_fee: ExactEthAmountSchema.nullable(),
    total_burn: ExactEthAmountSchema.nullable(),
  })
  .strict();
export type EthFeeCrossCheckMetrics = z.infer<typeof EthFeeCrossCheckMetricsSchema>;

const VerifiedEthFeeCrossCheckMetricsSchema = EthFeeCrossCheckMetricsSchema.refine(
  (metrics) => Object.values(metrics).every((metric) => metric !== null),
  "Verified snapshots require every fee metric.",
);

const UnavailableEthFeeCrossCheckMetricsSchema = EthFeeCrossCheckMetricsSchema.refine(
  (metrics) => Object.values(metrics).every((metric) => metric === null),
  "Unavailable snapshots must not contain partial metrics.",
);

export const EthFeeCrossCheckBlockSchema = z
  .object({
    block_number: z.number().int().nonnegative().safe(),
    block_hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
    transaction_count: z.number().int().nonnegative().safe(),
    metrics: VerifiedEthFeeCrossCheckMetricsSchema,
  })
  .strict();
export type EthFeeCrossCheckBlock = z.infer<typeof EthFeeCrossCheckBlockSchema>;

const RequestedRangeSchema = z
  .object({
    start_block: z.number().int().nonnegative().safe(),
    end_block: z.number().int().nonnegative().safe(),
    max_blocks: z.literal(ETH_FEE_CROSS_CHECK_MAX_BLOCKS),
  })
  .strict();

const VerifiedRangeSchema = z
  .object({
    start_block: z.number().int().nonnegative().safe(),
    end_block: z.number().int().nonnegative().safe(),
    finalized_block: z.number().int().nonnegative().safe(),
    block_count: z.number().int().positive().safe(),
    transaction_count: z.number().int().nonnegative().safe(),
  })
  .strict();

const IdentitiesSchema = z
  .object({
    execution_equals_base_plus_priority: z.literal(true),
    gross_equals_execution_plus_blob: z.literal(true),
    total_burn_equals_base_plus_blob: z.literal(true),
  })
  .strict();

const SnapshotBaseSchema = z
  .object({
    status: z.enum(["verified", "unavailable"]),
    summary: z.string().min(1),
    methodology: z.literal("eth-execution-fee-cross-check-v1"),
    requested_range: RequestedRangeSchema,
    verified_range: VerifiedRangeSchema.nullable(),
    metrics: EthFeeCrossCheckMetricsSchema,
    identities: IdentitiesSchema.nullable(),
    blocks: z.array(EthFeeCrossCheckBlockSchema).optional(),
    sources: z.array(z.string().min(1)),
    source_status: z.array(EthFeeCrossCheckSourceStatusSchema),
    gaps: z.array(EthFeeCrossCheckGapSchema),
    capabilities: z.object({ ethereum_rpc_active: z.boolean() }).strict(),
  })
  .strict();

export const EthFeeCrossCheckSnapshotSchema = SnapshotBaseSchema.superRefine((snapshot, context) => {
  const verified = snapshot.status === "verified";
  const hasAllMetrics = Object.values(snapshot.metrics).every((metric) => metric !== null);
  const hasNoMetrics = Object.values(snapshot.metrics).every((metric) => metric === null);

  if (verified && (snapshot.verified_range === null || snapshot.identities === null || !hasAllMetrics)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Verified snapshots require complete evidence and metrics." });
  }
  if (!verified && (snapshot.verified_range !== null || snapshot.identities !== null || !hasNoMetrics || snapshot.blocks !== undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Unavailable snapshots must not contain verified evidence." });
  }
});
export type EthFeeCrossCheckSnapshot = z.infer<typeof EthFeeCrossCheckSnapshotSchema>;
