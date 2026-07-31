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

type CompleteEthFeeCrossCheckMetrics = {
  [Metric in keyof EthFeeCrossCheckMetrics]: ExactEthAmount;
};

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
    block_hash: z.string().regex(/^0x[0-9a-f]{64}$/),
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

function addSnapshotIssue(context: z.RefinementCtx, message: string, path: Array<string | number> = []): void {
  context.addIssue({ code: z.ZodIssueCode.custom, message, path });
}

function hasCompleteMetrics(metrics: EthFeeCrossCheckMetrics): metrics is CompleteEthFeeCrossCheckMetrics {
  return Object.values(metrics).every((metric) => metric !== null);
}

function hasNoMetrics(metrics: EthFeeCrossCheckMetrics): boolean {
  return Object.values(metrics).every((metric) => metric === null);
}

function wei(amount: ExactEthAmount): bigint {
  return BigInt(amount.wei);
}

function metricsSatisfyIdentities(metrics: EthFeeCrossCheckMetrics): boolean {
  if (!hasCompleteMetrics(metrics)) return false;
  return (
    wei(metrics.execution_fee) === wei(metrics.base_fee_burn) + wei(metrics.priority_fee)
    && wei(metrics.gross_fee) === wei(metrics.execution_fee) + wei(metrics.blob_fee_burn)
    && wei(metrics.total_burn) === wei(metrics.base_fee_burn) + wei(metrics.blob_fee_burn)
  );
}

function metricsEqual(left: CompleteEthFeeCrossCheckMetrics, right: CompleteEthFeeCrossCheckMetrics): boolean {
  return (
    wei(left.execution_fee) === wei(right.execution_fee)
    && wei(left.base_fee_burn) === wei(right.base_fee_burn)
    && wei(left.priority_fee) === wei(right.priority_fee)
    && wei(left.blob_fee_burn) === wei(right.blob_fee_burn)
    && wei(left.gross_fee) === wei(right.gross_fee)
    && wei(left.total_burn) === wei(right.total_burn)
  );
}

function sumBlockMetrics(blocks: EthFeeCrossCheckBlock[]): CompleteEthFeeCrossCheckMetrics {
  const sum = (name: keyof CompleteEthFeeCrossCheckMetrics): ExactEthAmount => {
    const total = blocks.reduce((value, block) => {
      if (!hasCompleteMetrics(block.metrics)) throw new Error("Block metrics must be complete.");
      return value + wei(block.metrics[name]);
    }, 0n);
    const whole = total / 1_000_000_000_000_000_000n;
    const fraction = (total % 1_000_000_000_000_000_000n).toString().padStart(18, "0").replace(/0+$/, "");
    return { wei: total.toString(), eth: fraction === "" ? whole.toString() : `${whole}.${fraction}` };
  };
  return {
    execution_fee: sum("execution_fee"),
    base_fee_burn: sum("base_fee_burn"),
    priority_fee: sum("priority_fee"),
    blob_fee_burn: sum("blob_fee_burn"),
    gross_fee: sum("gross_fee"),
    total_burn: sum("total_burn"),
  };
}

export const EthFeeCrossCheckSnapshotSchema = SnapshotBaseSchema.superRefine((snapshot, context) => {
  const requestedBlockCount = snapshot.requested_range.end_block - snapshot.requested_range.start_block + 1;
  if (snapshot.requested_range.end_block < snapshot.requested_range.start_block || requestedBlockCount > ETH_FEE_CROSS_CHECK_MAX_BLOCKS) {
    addSnapshotIssue(context, "Requested range must be ordered and contain at most 64 blocks.", ["requested_range"]);
  }

  if (snapshot.status === "unavailable") {
    if (snapshot.verified_range !== null || snapshot.identities !== null || !hasNoMetrics(snapshot.metrics) || snapshot.blocks !== undefined) {
      addSnapshotIssue(context, "Unavailable snapshots must not contain verified evidence.");
    }
    if (snapshot.gaps.length === 0 || snapshot.sources.length !== 0 || snapshot.source_status.length !== 0) {
      addSnapshotIssue(context, "Unavailable snapshots require a gap and no source provenance.");
    }
    return;
  }

  if (snapshot.verified_range === null || snapshot.identities === null || !hasCompleteMetrics(snapshot.metrics)) {
    addSnapshotIssue(context, "Verified snapshots require complete evidence and metrics.");
    return;
  }
  const verifiedRange = snapshot.verified_range;
  const metrics = snapshot.metrics;
  if (
    verifiedRange.start_block !== snapshot.requested_range.start_block
    || verifiedRange.end_block !== snapshot.requested_range.end_block
    || verifiedRange.finalized_block < verifiedRange.end_block
    || verifiedRange.block_count !== requestedBlockCount
  ) {
    addSnapshotIssue(context, "Verified range must exactly reconcile with the finalized requested range.", ["verified_range"]);
  }
  if (!metricsSatisfyIdentities(metrics)) {
    addSnapshotIssue(context, "Exact aggregate fee identities must hold.", ["metrics"]);
  }

  if (snapshot.blocks !== undefined) {
    const blocks = snapshot.blocks;
    if (blocks.length !== verifiedRange.block_count) {
      addSnapshotIssue(context, "Block rows must cover every verified block exactly once.", ["blocks"]);
    }
    const hashes = new Set<string>();
    let transactionCount = 0;
    for (let index = 0; index < blocks.length; index += 1) {
      const block = blocks[index]!;
      if (block.block_number !== verifiedRange.start_block + index || hashes.has(block.block_hash)) {
        addSnapshotIssue(context, "Block rows must be ordered, consecutive, and hash-unique.", ["blocks", index]);
      }
      hashes.add(block.block_hash);
      transactionCount += block.transaction_count;
      if (!metricsSatisfyIdentities(block.metrics)) {
        addSnapshotIssue(context, "Every block row must satisfy exact fee identities.", ["blocks", index, "metrics"]);
      }
    }
    if (transactionCount !== verifiedRange.transaction_count) {
      addSnapshotIssue(context, "Block-row transaction counts must equal the verified range.", ["blocks"]);
    }
    if (blocks.length > 0 && !metricsEqual(sumBlockMetrics(blocks), metrics)) {
      addSnapshotIssue(context, "Block-row metrics must equal aggregate metrics.", ["blocks"]);
    }
  }
});
export type EthFeeCrossCheckSnapshot = z.infer<typeof EthFeeCrossCheckSnapshotSchema>;
