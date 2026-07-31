import { z } from "zod";

export const LIDO_POOLED_ETH_BACKING_METHODOLOGY = "lido-pooled-eth-backing-v1" as const;

const DecimalStringSchema = z.string().max(78).regex(/^(0|[1-9]\d*)$/);
const BlockHashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const BlockIntegerSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const LidoPooledEthBackingBlockSchema = z.object({
  number: BlockIntegerSchema,
  hash: BlockHashSchema,
  timestamp: BlockIntegerSchema,
}).strict();
export type LidoPooledEthBackingBlock = z.infer<typeof LidoPooledEthBackingBlockSchema>;

export const LidoAccountingEvidenceSchema = z.object({
  total_supply_wei: DecimalStringSchema,
  total_pooled_ether_wei: DecimalStringSchema,
  total_shares: DecimalStringSchema,
  external_shares: DecimalStringSchema,
  buffered_ether_wei: DecimalStringSchema,
  cl_validators_balance_at_last_report_wei: DecimalStringSchema,
  cl_pending_balance_at_last_report_wei: DecimalStringSchema,
  deposited_since_last_report_wei: DecimalStringSchema,
  deposited_for_current_report_wei: DecimalStringSchema,
}).strict();
export type LidoAccountingEvidence = z.infer<typeof LidoAccountingEvidenceSchema>;

export const LidoPooledEthBackingMetricsSchema = z.object({
  total_pooled_eth_wei: DecimalStringSchema.nullable(),
  internal_pooled_eth_wei: DecimalStringSchema.nullable(),
  external_pooled_eth_wei: DecimalStringSchema.nullable(),
  buffered_eth_wei: DecimalStringSchema.nullable(),
  cl_validators_balance_at_last_report_wei: DecimalStringSchema.nullable(),
  cl_pending_balance_at_last_report_wei: DecimalStringSchema.nullable(),
  deposited_since_last_report_wei: DecimalStringSchema.nullable(),
  deposited_for_current_report_wei: DecimalStringSchema.nullable(),
  steth_total_supply_wei: DecimalStringSchema.nullable(),
  total_shares: DecimalStringSchema.nullable(),
  internal_shares: DecimalStringSchema.nullable(),
  external_shares: DecimalStringSchema.nullable(),
  all_ethereum_native_staked_eth: z.null(),
  unique_net_eth_locked: z.null(),
  defi_eth_collateral: z.null(),
  combined_aave_spark_lido_demand: z.null(),
  rehypothecation_ratio: z.null(),
}).strict();
export type LidoPooledEthBackingMetrics = z.infer<typeof LidoPooledEthBackingMetricsSchema>;

export const LidoPooledEthBackingIdentitiesSchema = z.object({
  internal_ether_equals_components: z.literal(true),
  internal_shares_equals_total_minus_external: z.literal(true),
  external_ether_equals_floor_share_ratio: z.literal(true),
  total_pooled_ether_equals_internal_plus_external: z.literal(true),
  total_supply_equals_total_pooled_ether: z.literal(true),
}).strict();
export type LidoPooledEthBackingIdentities = z.infer<typeof LidoPooledEthBackingIdentitiesSchema>;

export const LidoPooledEthBackingCoverageSchema = z.object({
  lido_v4_mainnet_accounting_complete: z.boolean(),
  all_ethereum_native_staked_complete: z.literal(false),
  unique_net_eth_locked_complete: z.literal(false),
  defi_eth_collateral_complete: z.literal(false),
  combined_aave_spark_lido_demand_complete: z.literal(false),
  rehypothecation_ratio_complete: z.literal(false),
}).strict();
export type LidoPooledEthBackingCoverage = z.infer<typeof LidoPooledEthBackingCoverageSchema>;

export const LidoPooledEthBackingGapCodeSchema = z.enum([
  "rpc_not_configured",
  "rpc_access_gap",
  "rpc_chain_mismatch",
  "rpc_finality_gap",
  "rpc_schema_drift",
  "rpc_evidence_mismatch",
  "source_stale",
  "all_ethereum_native_staked_not_measured",
  "unique_net_eth_locked_not_reconciled",
  "defi_eth_collateral_not_indexed",
  "combined_aave_spark_lido_demand_not_reconciled",
  "rehypothecation_ratio_not_measurable",
]);
export type LidoPooledEthBackingGapCode = z.infer<typeof LidoPooledEthBackingGapCodeSchema>;

export const LidoPooledEthBackingGapSchema = z.object({
  code: LidoPooledEthBackingGapCodeSchema,
  detail: z.string().min(1).max(240),
}).strict();
export type LidoPooledEthBackingGap = z.infer<typeof LidoPooledEthBackingGapSchema>;

export const LidoPooledEthBackingSourceStatusSchema = z.object({
  source: z.string().min(1).max(80),
  role: z.string().min(1).max(120),
  stale: z.boolean(),
}).strict();
export type LidoPooledEthBackingSourceStatus = z.infer<typeof LidoPooledEthBackingSourceStatusSchema>;

const PermanentGapCodes = new Set<LidoPooledEthBackingGapCode>([
  "all_ethereum_native_staked_not_measured",
  "unique_net_eth_locked_not_reconciled",
  "defi_eth_collateral_not_indexed",
  "combined_aave_spark_lido_demand_not_reconciled",
  "rehypothecation_ratio_not_measurable",
]);
const SourceFailureGapCodes = new Set<LidoPooledEthBackingGapCode>([
  "rpc_not_configured",
  "rpc_access_gap",
  "rpc_chain_mismatch",
  "rpc_finality_gap",
  "rpc_schema_drift",
  "rpc_evidence_mismatch",
]);

const LidoPooledEthBackingSnapshotBaseSchema = z.object({
  status: z.enum(["verified", "unavailable"]),
  summary: z.string().min(1).max(500),
  methodology: z.literal(LIDO_POOLED_ETH_BACKING_METHODOLOGY),
  verified_block: LidoPooledEthBackingBlockSchema.nullable(),
  accounting: LidoAccountingEvidenceSchema.nullable(),
  metrics: LidoPooledEthBackingMetricsSchema,
  identities: LidoPooledEthBackingIdentitiesSchema.nullable(),
  coverage: LidoPooledEthBackingCoverageSchema,
  sources: z.array(z.string().min(1).max(80)).max(8),
  source_status: z.array(LidoPooledEthBackingSourceStatusSchema).max(8),
  gaps: z.array(LidoPooledEthBackingGapSchema).max(6),
  capabilities: z.object({ ethereum_rpc_active: z.boolean() }).strict(),
}).strict();

function sameSourceSet(snapshot: z.infer<typeof LidoPooledEthBackingSnapshotBaseSchema>): boolean {
  const sources = new Set(snapshot.sources);
  const statuses = new Set(snapshot.source_status.map((status) => status.source));
  return sources.size === snapshot.sources.length && statuses.size === snapshot.source_status.length
    && sources.size === statuses.size && [...sources].every((source) => statuses.has(source));
}

interface AccountingBigints {
  total_supply_wei: bigint;
  total_pooled_ether_wei: bigint;
  total_shares: bigint;
  external_shares: bigint;
  buffered_ether_wei: bigint;
  cl_validators_balance_at_last_report_wei: bigint;
  cl_pending_balance_at_last_report_wei: bigint;
  deposited_since_last_report_wei: bigint;
  deposited_for_current_report_wei: bigint;
}

function values(snapshot: z.infer<typeof LidoPooledEthBackingSnapshotBaseSchema>): AccountingBigints | null {
  if (snapshot.accounting === null) return null;
  try {
    return {
      total_supply_wei: BigInt(snapshot.accounting.total_supply_wei),
      total_pooled_ether_wei: BigInt(snapshot.accounting.total_pooled_ether_wei),
      total_shares: BigInt(snapshot.accounting.total_shares),
      external_shares: BigInt(snapshot.accounting.external_shares),
      buffered_ether_wei: BigInt(snapshot.accounting.buffered_ether_wei),
      cl_validators_balance_at_last_report_wei: BigInt(snapshot.accounting.cl_validators_balance_at_last_report_wei),
      cl_pending_balance_at_last_report_wei: BigInt(snapshot.accounting.cl_pending_balance_at_last_report_wei),
      deposited_since_last_report_wei: BigInt(snapshot.accounting.deposited_since_last_report_wei),
      deposited_for_current_report_wei: BigInt(snapshot.accounting.deposited_for_current_report_wei),
    };
  } catch {
    return null;
  }
}

export const LidoPooledEthBackingSnapshotSchema = LidoPooledEthBackingSnapshotBaseSchema.superRefine((snapshot, context) => {
  const issue = (message: string) => context.addIssue({ code: z.ZodIssueCode.custom, message });
  try {
    if (snapshot.status === "unavailable") {
      const observedMetricsAbsent = Object.entries(snapshot.metrics)
        .filter(([key]) => !["all_ethereum_native_staked_eth", "unique_net_eth_locked", "defi_eth_collateral", "combined_aave_spark_lido_demand", "rehypothecation_ratio"].includes(key))
        .every(([, value]) => value === null);
      const failure = snapshot.gaps.length === 1 && SourceFailureGapCodes.has(snapshot.gaps[0]!.code);
      const notConfigured = snapshot.gaps[0]?.code === "rpc_not_configured";
      const coherentProvenance = notConfigured
        ? snapshot.sources.length === 0 && snapshot.source_status.length === 0
        : snapshot.sources.length > 0 && snapshot.source_status.length > 0 && sameSourceSet(snapshot)
          && snapshot.source_status.every((status) => !status.stale);
      if (snapshot.verified_block !== null || snapshot.accounting !== null || snapshot.identities !== null
        || !observedMetricsAbsent || snapshot.coverage.lido_v4_mainnet_accounting_complete
        || snapshot.capabilities.ethereum_rpc_active || !failure || !coherentProvenance) {
        issue("unavailable Lido snapshot contains partial or incoherent evidence");
      }
      return;
    }

    const allObservedMetrics = [
      snapshot.metrics.total_pooled_eth_wei, snapshot.metrics.internal_pooled_eth_wei,
      snapshot.metrics.external_pooled_eth_wei, snapshot.metrics.buffered_eth_wei,
      snapshot.metrics.cl_validators_balance_at_last_report_wei, snapshot.metrics.cl_pending_balance_at_last_report_wei,
      snapshot.metrics.deposited_since_last_report_wei, snapshot.metrics.deposited_for_current_report_wei,
      snapshot.metrics.steth_total_supply_wei, snapshot.metrics.total_shares,
      snapshot.metrics.internal_shares, snapshot.metrics.external_shares,
    ];
    const permanentExact = PermanentGapCodes.size === 5
      && [...PermanentGapCodes].every((code) => snapshot.gaps.filter((gap) => gap.code === code).length === 1);
    const onlyPermanentOrStale = snapshot.gaps.every((gap) => PermanentGapCodes.has(gap.code) || gap.code === "source_stale");
    const staleGaps = snapshot.gaps.filter((gap) => gap.code === "source_stale");
    const allFresh = snapshot.source_status.every((status) => !status.stale);
    const allStale = snapshot.source_status.every((status) => status.stale);
    const accounting = values(snapshot);
    if (snapshot.verified_block === null || snapshot.accounting === null || accounting === null || snapshot.identities === null
      || allObservedMetrics.some((value) => value === null) || !snapshot.coverage.lido_v4_mainnet_accounting_complete
      || !snapshot.capabilities.ethereum_rpc_active || !permanentExact || !onlyPermanentOrStale || !sameSourceSet(snapshot)
      || snapshot.sources.length === 0 || (!allFresh && !allStale) || (allFresh && staleGaps.length !== 0)
      || (allStale && staleGaps.length !== 1)) {
      issue("verified Lido snapshot is incomplete or has incoherent provenance");
      return;
    }
    const internalEther = accounting.buffered_ether_wei + accounting.cl_validators_balance_at_last_report_wei
      + accounting.cl_pending_balance_at_last_report_wei + accounting.deposited_since_last_report_wei;
    const internalShares = accounting.total_shares - accounting.external_shares;
    if (accounting.total_pooled_ether_wei <= 0n || accounting.total_shares <= 0n || accounting.external_shares >= accounting.total_shares
      || accounting.deposited_for_current_report_wei > accounting.deposited_since_last_report_wei || internalShares <= 0n) {
      issue("verified Lido accounting has impossible balances");
      return;
    }
    const externalEther = accounting.external_shares * internalEther / internalShares;
    const totalPooled = internalEther + externalEther;
    const actual = snapshot.metrics;
    const expected = {
      total_pooled_eth_wei: totalPooled.toString(), internal_pooled_eth_wei: internalEther.toString(),
      external_pooled_eth_wei: externalEther.toString(), buffered_eth_wei: accounting.buffered_ether_wei.toString(),
      cl_validators_balance_at_last_report_wei: accounting.cl_validators_balance_at_last_report_wei.toString(),
      cl_pending_balance_at_last_report_wei: accounting.cl_pending_balance_at_last_report_wei.toString(),
      deposited_since_last_report_wei: accounting.deposited_since_last_report_wei.toString(),
      deposited_for_current_report_wei: accounting.deposited_for_current_report_wei.toString(),
      steth_total_supply_wei: accounting.total_supply_wei.toString(), total_shares: accounting.total_shares.toString(),
      internal_shares: internalShares.toString(), external_shares: accounting.external_shares.toString(),
    };
    if (accounting.total_pooled_ether_wei !== totalPooled || accounting.total_supply_wei !== totalPooled || externalEther > totalPooled
      || Object.entries(expected).some(([key, value]) => actual[key as keyof typeof expected] !== value)) {
      issue("verified Lido accounting identities do not reconcile");
    }
  } catch {
    issue("Lido snapshot validation failed safely");
  }
});
export type LidoPooledEthBackingSnapshot = z.infer<typeof LidoPooledEthBackingSnapshotSchema>;

export interface LidoAccountingEvidenceInput {
  totalSupply: bigint;
  totalPooledEther: bigint;
  totalShares: bigint;
  externalShares: bigint;
  bufferedEther: bigint;
  clValidatorsBalanceAtLastReport: bigint;
  clPendingBalanceAtLastReport: bigint;
  depositedSinceLastReport: bigint;
  depositedForCurrentReport: bigint;
}
