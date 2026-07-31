import { z } from "zod";

export const ETH_CONSENSUS_REWARDS_SLOTS_PER_EPOCH = 32;
export const ETH_CONSENSUS_REWARDS_MAX_EPOCHS = 1;

export const GetEthConsensusRewardsCrossCheckInputSchema = z.object({
  epoch: z.number().int().nonnegative().safe(),
  include_blocks: z.boolean().default(false),
}).strict();
export type GetEthConsensusRewardsCrossCheckInput = z.infer<typeof GetEthConsensusRewardsCrossCheckInputSchema>;

const SignedDecimalSchema = z.string().regex(/^(?:0|-?[1-9]\d*)$/);
const SignedEthDecimalSchema = z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d{1,9})?$/);
const GWEI_PER_ETH = 1_000_000_000n;

function signedEthToGwei(eth: string): bigint {
  const negative = eth.startsWith("-");
  const unsigned = negative ? eth.slice(1) : eth;
  const [whole, fraction = ""] = unsigned.split(".");
  const value = BigInt(whole!) * GWEI_PER_ETH + BigInt(fraction.padEnd(9, "0"));
  return negative ? -value : value;
}

export const ExactSignedGweiAmountSchema = z.object({
  gwei: SignedDecimalSchema,
  eth: SignedEthDecimalSchema,
}).strict().superRefine((amount, context) => {
  if (!SignedDecimalSchema.safeParse(amount.gwei).success || !SignedEthDecimalSchema.safeParse(amount.eth).success) return;
  if (amount.eth === "-0" || amount.eth.startsWith("-0.") && /^-0\.0+$/.test(amount.eth)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["eth"], message: "eth must not encode negative zero." });
    return;
  }
  if (BigInt(amount.gwei) !== signedEthToGwei(amount.eth)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["eth"], message: "eth must be the exact decimal representation of gwei." });
  }
});
export type ExactSignedGweiAmount = z.infer<typeof ExactSignedGweiAmountSchema>;

export const EthConsensusRewardsGapCodeSchema = z.enum([
  "beacon_not_configured",
  "beacon_access_gap",
  "beacon_finality_gap",
  "beacon_schema_drift",
  "beacon_evidence_mismatch",
  "source_stale",
  "consensus_issuance_incomplete",
  "net_issuance_requires_burn_alignment",
]);
export type EthConsensusRewardsGapCode = z.infer<typeof EthConsensusRewardsGapCodeSchema>;

export const EthConsensusRewardsGapSchema = z.object({
  code: EthConsensusRewardsGapCodeSchema,
  detail: z.string().min(1),
}).strict();
export type EthConsensusRewardsGap = z.infer<typeof EthConsensusRewardsGapSchema>;

export const EthConsensusRewardsSourceStatusSchema = z.object({
  source: z.string().min(1),
  role: z.string().min(1),
  as_of: z.string().min(1).nullable(),
  stale: z.boolean(),
}).strict();
export type EthConsensusRewardsSourceStatus = z.infer<typeof EthConsensusRewardsSourceStatusSchema>;

export const EthConsensusRewardsMetricsSchema = z.object({
  attestation_net_reward: ExactSignedGweiAmountSchema.nullable(),
  sync_committee_net_reward: ExactSignedGweiAmountSchema.nullable(),
  block_proposer_reward: ExactSignedGweiAmountSchema.nullable(),
  observed_consensus_reward: ExactSignedGweiAmountSchema.nullable(),
  consensus_issuance: z.null(),
  net_issuance: z.null(),
}).strict();
export type EthConsensusRewardsMetrics = z.infer<typeof EthConsensusRewardsMetricsSchema>;

const CompleteRewardMetricsSchema = EthConsensusRewardsMetricsSchema.refine(
  (metrics) => metrics.attestation_net_reward !== null
    && metrics.sync_committee_net_reward !== null
    && metrics.block_proposer_reward !== null
    && metrics.observed_consensus_reward !== null,
  "Verified snapshots require every observed reward metric.",
);

export const EthConsensusRewardBlockSchema = z.object({
  slot: z.number().int().nonnegative().safe(),
  block_root: z.string().regex(/^0x[0-9a-f]{64}$/),
  proposer_index: z.number().int().nonnegative().safe(),
  block_proposer_reward: ExactSignedGweiAmountSchema,
  sync_committee_net_reward: ExactSignedGweiAmountSchema,
}).strict();
export type EthConsensusRewardBlock = z.infer<typeof EthConsensusRewardBlockSchema>;

export const EthConsensusRewardsRequestedEpochSchema = z.object({
  epoch: z.number().int().nonnegative().safe(),
  slots_per_epoch: z.literal(ETH_CONSENSUS_REWARDS_SLOTS_PER_EPOCH),
  max_epochs: z.literal(ETH_CONSENSUS_REWARDS_MAX_EPOCHS),
}).strict();

export const EthConsensusRewardsVerifiedEpochSchema = z.object({
  epoch: z.number().int().nonnegative().safe(),
  start_slot: z.number().int().nonnegative().safe(),
  end_slot: z.number().int().nonnegative().safe(),
  finalized_epoch: z.number().int().nonnegative().safe(),
  proposed_block_count: z.number().int().nonnegative().safe(),
  missed_slot_count: z.number().int().nonnegative().safe(),
  attestation_validator_count: z.number().int().nonnegative().safe(),
  sync_reward_entry_count: z.number().int().nonnegative().safe(),
}).strict();

export const EthConsensusRewardsIdentitiesSchema = z.object({
  observed_equals_attestation_plus_sync_plus_proposer: z.literal(true),
  proposer_total_equals_reported_components: z.literal(true),
}).strict();

export const EthConsensusRewardsCoverageSchema = z.object({
  attestation_rewards_complete: z.boolean(),
  sync_committee_rewards_complete: z.boolean(),
  block_proposer_rewards_complete: z.boolean(),
  slashing_penalties_complete: z.literal(false),
  deposit_withdrawal_reconciliation_complete: z.literal(false),
  consensus_issuance_complete: z.literal(false),
  net_issuance_complete: z.literal(false),
}).strict();
export type EthConsensusRewardsCoverage = z.infer<typeof EthConsensusRewardsCoverageSchema>;

const SnapshotBaseSchema = z.object({
  status: z.enum(["verified", "unavailable"]),
  summary: z.string().min(1),
  methodology: z.literal("eth-consensus-rewards-cross-check-v1"),
  requested_epoch: EthConsensusRewardsRequestedEpochSchema,
  verified_epoch: EthConsensusRewardsVerifiedEpochSchema.nullable(),
  metrics: EthConsensusRewardsMetricsSchema,
  identities: EthConsensusRewardsIdentitiesSchema.nullable(),
  coverage: EthConsensusRewardsCoverageSchema,
  blocks: z.array(EthConsensusRewardBlockSchema).optional(),
  sources: z.array(z.string().min(1)),
  source_status: z.array(EthConsensusRewardsSourceStatusSchema),
  gaps: z.array(EthConsensusRewardsGapSchema),
  capabilities: z.object({ ethereum_beacon_api_active: z.boolean() }).strict(),
}).strict();

function snapshotIssue(context: z.RefinementCtx, message: string, path: Array<string | number> = []): void {
  context.addIssue({ code: z.ZodIssueCode.custom, message, path });
}

function calculateEpochSlots(epoch: number): { startSlot: number; endSlot: number } | null {
  if (!Number.isSafeInteger(epoch) || epoch < 0 || epoch > Math.floor((Number.MAX_SAFE_INTEGER - 31) / ETH_CONSENSUS_REWARDS_SLOTS_PER_EPOCH)) return null;
  const startSlot = epoch * ETH_CONSENSUS_REWARDS_SLOTS_PER_EPOCH;
  return { startSlot, endSlot: startSlot + ETH_CONSENSUS_REWARDS_SLOTS_PER_EPOCH - 1 };
}

function completeMetrics(metrics: EthConsensusRewardsMetrics): metrics is EthConsensusRewardsMetrics & {
  attestation_net_reward: ExactSignedGweiAmount;
  sync_committee_net_reward: ExactSignedGweiAmount;
  block_proposer_reward: ExactSignedGweiAmount;
  observed_consensus_reward: ExactSignedGweiAmount;
} {
  return CompleteRewardMetricsSchema.safeParse(metrics).success;
}

function exactGwei(amount: ExactSignedGweiAmount): bigint { return BigInt(amount.gwei); }

function observedIdentityHolds(metrics: EthConsensusRewardsMetrics): boolean {
  return completeMetrics(metrics) && exactGwei(metrics.observed_consensus_reward)
    === exactGwei(metrics.attestation_net_reward) + exactGwei(metrics.sync_committee_net_reward) + exactGwei(metrics.block_proposer_reward);
}

const UnavailableGapCodes = new Set<EthConsensusRewardsGapCode>([
  "beacon_not_configured", "beacon_access_gap", "beacon_finality_gap", "beacon_schema_drift", "beacon_evidence_mismatch",
]);

export const EthConsensusRewardsCrossCheckSnapshotSchema = SnapshotBaseSchema.superRefine((snapshot, context) => {
  const slots = calculateEpochSlots(snapshot.requested_epoch.epoch);
  if (slots === null) snapshotIssue(context, "Requested epoch must calculate to safe slot bounds.", ["requested_epoch", "epoch"]);

  if (snapshot.status === "unavailable") {
    const noObservedMetrics = snapshot.metrics.attestation_net_reward === null
      && snapshot.metrics.sync_committee_net_reward === null
      && snapshot.metrics.block_proposer_reward === null
      && snapshot.metrics.observed_consensus_reward === null;
    const noExposedCoverage = !snapshot.coverage.attestation_rewards_complete
      && !snapshot.coverage.sync_committee_rewards_complete && !snapshot.coverage.block_proposer_rewards_complete;
    if (snapshot.verified_epoch !== null || snapshot.identities !== null || snapshot.blocks !== undefined || !noObservedMetrics || !noExposedCoverage) {
      snapshotIssue(context, "Unavailable snapshots must not contain verified evidence.");
    }
    if (!snapshot.gaps.some((gap) => UnavailableGapCodes.has(gap.code))) {
      snapshotIssue(context, "Unavailable snapshots require a transport, finality, schema, or evidence gap.", ["gaps"]);
    }
    return;
  }

  if (snapshot.verified_epoch === null || snapshot.identities === null || !completeMetrics(snapshot.metrics)) {
    snapshotIssue(context, "Verified snapshots require complete observed reward metrics and identities.");
    return;
  }
  const verified = snapshot.verified_epoch;
  if (slots === null || verified.epoch !== snapshot.requested_epoch.epoch || verified.start_slot !== slots.startSlot || verified.end_slot !== slots.endSlot || verified.finalized_epoch <= verified.epoch) {
    snapshotIssue(context, "Verified epoch must exactly reconcile with the finalized requested epoch.", ["verified_epoch"]);
  }
  if (verified.proposed_block_count + verified.missed_slot_count !== ETH_CONSENSUS_REWARDS_SLOTS_PER_EPOCH) {
    snapshotIssue(context, "Proposed and missed slot counts must equal 32.", ["verified_epoch"]);
  }
  if (!snapshot.coverage.attestation_rewards_complete || !snapshot.coverage.sync_committee_rewards_complete || !snapshot.coverage.block_proposer_rewards_complete) {
    snapshotIssue(context, "Verified snapshots require every exposed reward coverage flag.", ["coverage"]);
  }
  if (!snapshot.gaps.some((gap) => gap.code === "consensus_issuance_incomplete") || !snapshot.gaps.some((gap) => gap.code === "net_issuance_requires_burn_alignment")) {
    snapshotIssue(context, "Verified snapshots require permanent issuance coverage gaps.", ["gaps"]);
  }
  if (!observedIdentityHolds(snapshot.metrics)) snapshotIssue(context, "Observed consensus reward identity must hold.", ["metrics"]);

  if (snapshot.blocks !== undefined) {
    if (snapshot.blocks.length !== verified.proposed_block_count) snapshotIssue(context, "Block rows must cover every proposed block exactly once.", ["blocks"]);
    const roots = new Set<string>();
    let proposerTotal = 0n;
    let syncTotal = 0n;
    for (let index = 0; index < snapshot.blocks.length; index += 1) {
      const block = snapshot.blocks[index]!;
      if (block.slot < verified.start_slot || block.slot > verified.end_slot || (index > 0 && block.slot <= snapshot.blocks[index - 1]!.slot) || roots.has(block.block_root)) {
        snapshotIssue(context, "Block rows must be root-unique and ordered within the verified epoch.", ["blocks", index]);
      }
      roots.add(block.block_root);
      proposerTotal += exactGwei(block.block_proposer_reward);
      syncTotal += exactGwei(block.sync_committee_net_reward);
    }
    if (proposerTotal !== exactGwei(snapshot.metrics.block_proposer_reward) || syncTotal !== exactGwei(snapshot.metrics.sync_committee_net_reward)) {
      snapshotIssue(context, "Block-row totals must reconcile to aggregate proposer and sync rewards.", ["blocks"]);
    }
  }
});
export type EthConsensusRewardsCrossCheckSnapshot = z.infer<typeof EthConsensusRewardsCrossCheckSnapshotSchema>;
