import {
  LIDO_POOLED_ETH_BACKING_METHODOLOGY,
  LidoPooledEthBackingSnapshotSchema,
  type LidoAccountingEvidenceInput,
  type LidoPooledEthBackingBlock,
  type LidoPooledEthBackingGap,
  type LidoPooledEthBackingSnapshot,
  type LidoPooledEthBackingSourceStatus,
} from "./types.js";

const PERMANENT_GAPS: readonly LidoPooledEthBackingGap[] = [
  { code: "all_ethereum_native_staked_not_measured", detail: "All Ethereum native stake is outside this Lido pooled ETH measurement." },
  { code: "unique_net_eth_locked_not_reconciled", detail: "ETH lineage and overlap are not reconciled across protocols." },
  { code: "defi_eth_collateral_not_indexed", detail: "Downstream DeFi collateral positions are not indexed." },
  { code: "combined_aave_spark_lido_demand_not_reconciled", detail: "Aave, Spark, and Lido overlap is not reconciled." },
  { code: "rehypothecation_ratio_not_measurable", detail: "Rehypothecation cannot be measured from Lido accounting." },
];

export class LidoPooledEthBackingDomainError extends Error {
  constructor(public readonly kind: "schema_drift" | "evidence_mismatch", message: string) {
    super(message);
    this.name = "LidoPooledEthBackingDomainError";
  }
}

function fail(kind: LidoPooledEthBackingDomainError["kind"], message: string): never {
  throw new LidoPooledEthBackingDomainError(kind, message);
}

function validateAccounting(accounting: LidoAccountingEvidenceInput): void {
  const fields = Object.values(accounting);
  if (fields.some((value) => typeof value !== "bigint")) fail("schema_drift", "Lido accounting must use bigint evidence.");
  if (fields.some((value) => value < 0n)) fail("evidence_mismatch", "Lido accounting cannot be negative.");
  if (accounting.totalPooledEther <= 0n || accounting.totalShares <= 0n || accounting.externalShares >= accounting.totalShares) {
    fail("evidence_mismatch", "Lido accounting has impossible total or share evidence.");
  }
  if (accounting.depositedForCurrentReport > accounting.depositedSinceLastReport) {
    fail("evidence_mismatch", "Lido current-report deposits exceed deposits since the last report.");
  }
}

function parseVerified(snapshot: unknown): LidoPooledEthBackingSnapshot {
  const parsed = LidoPooledEthBackingSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) fail("schema_drift", "Verified Lido pooled ETH snapshot violates its public contract.");
  return parsed.data;
}

export function buildVerifiedLidoPooledEthBackingSnapshot(input: {
  block: LidoPooledEthBackingBlock;
  accounting: LidoAccountingEvidenceInput;
  sources: string[];
  sourceStatus: LidoPooledEthBackingSourceStatus[];
  stale?: boolean;
}): LidoPooledEthBackingSnapshot {
  validateAccounting(input.accounting);
  const accounting = input.accounting;
  const internalEther = accounting.bufferedEther + accounting.clValidatorsBalanceAtLastReport
    + accounting.clPendingBalanceAtLastReport + accounting.depositedSinceLastReport;
  const internalShares = accounting.totalShares - accounting.externalShares;
  const externalEther = accounting.externalShares * internalEther / internalShares;
  const totalPooledEther = internalEther + externalEther;
  if (accounting.totalPooledEther !== totalPooledEther || accounting.totalSupply !== totalPooledEther || externalEther > totalPooledEther) {
    fail("evidence_mismatch", "Lido pooled ETH accounting identities do not reconcile.");
  }
  const snapshot = {
    status: "verified" as const,
    summary: "Lido v4 pooled ETH backing was verified at one finalized Ethereum block.",
    methodology: LIDO_POOLED_ETH_BACKING_METHODOLOGY,
    verified_block: input.block,
    accounting: {
      total_supply_wei: accounting.totalSupply.toString(), total_pooled_ether_wei: accounting.totalPooledEther.toString(),
      total_shares: accounting.totalShares.toString(), external_shares: accounting.externalShares.toString(),
      buffered_ether_wei: accounting.bufferedEther.toString(), cl_validators_balance_at_last_report_wei: accounting.clValidatorsBalanceAtLastReport.toString(),
      cl_pending_balance_at_last_report_wei: accounting.clPendingBalanceAtLastReport.toString(), deposited_since_last_report_wei: accounting.depositedSinceLastReport.toString(),
      deposited_for_current_report_wei: accounting.depositedForCurrentReport.toString(),
    },
    metrics: {
      total_pooled_eth_wei: totalPooledEther.toString(), internal_pooled_eth_wei: internalEther.toString(), external_pooled_eth_wei: externalEther.toString(),
      buffered_eth_wei: accounting.bufferedEther.toString(), cl_validators_balance_at_last_report_wei: accounting.clValidatorsBalanceAtLastReport.toString(),
      cl_pending_balance_at_last_report_wei: accounting.clPendingBalanceAtLastReport.toString(), deposited_since_last_report_wei: accounting.depositedSinceLastReport.toString(),
      deposited_for_current_report_wei: accounting.depositedForCurrentReport.toString(), steth_total_supply_wei: accounting.totalSupply.toString(),
      total_shares: accounting.totalShares.toString(), internal_shares: internalShares.toString(), external_shares: accounting.externalShares.toString(),
      all_ethereum_native_staked_eth: null, unique_net_eth_locked: null, defi_eth_collateral: null,
      combined_aave_spark_lido_demand: null, rehypothecation_ratio: null,
    },
    identities: {
      internal_ether_equals_components: true as const, internal_shares_equals_total_minus_external: true as const,
      external_ether_equals_floor_share_ratio: true as const, total_pooled_ether_equals_internal_plus_external: true as const,
      total_supply_equals_total_pooled_ether: true as const,
    },
    coverage: {
      lido_v4_mainnet_accounting_complete: true, all_ethereum_native_staked_complete: false as const,
      unique_net_eth_locked_complete: false as const, defi_eth_collateral_complete: false as const,
      combined_aave_spark_lido_demand_complete: false as const, rehypothecation_ratio_complete: false as const,
    },
    sources: input.sources,
    source_status: input.sourceStatus.map((status) => ({ ...status, stale: input.stale === true })),
    gaps: input.stale === true
      ? [...PERMANENT_GAPS, { code: "source_stale" as const, detail: "Previously verified finalized evidence is stale." }]
      : [...PERMANENT_GAPS],
    capabilities: { ethereum_rpc_active: true },
  };
  return parseVerified(snapshot);
}

export function buildUnavailableLidoPooledEthBackingSnapshot(input: {
  summary: string;
  gaps: LidoPooledEthBackingGap[];
  sources?: string[];
  sourceStatus?: LidoPooledEthBackingSourceStatus[];
}): LidoPooledEthBackingSnapshot {
  const snapshot = {
    status: "unavailable" as const,
    summary: input.summary,
    methodology: LIDO_POOLED_ETH_BACKING_METHODOLOGY,
    verified_block: null,
    accounting: null,
    metrics: {
      total_pooled_eth_wei: null, internal_pooled_eth_wei: null, external_pooled_eth_wei: null,
      buffered_eth_wei: null, cl_validators_balance_at_last_report_wei: null, cl_pending_balance_at_last_report_wei: null,
      deposited_since_last_report_wei: null, deposited_for_current_report_wei: null, steth_total_supply_wei: null,
      total_shares: null, internal_shares: null, external_shares: null, all_ethereum_native_staked_eth: null,
      unique_net_eth_locked: null, defi_eth_collateral: null, combined_aave_spark_lido_demand: null,
      rehypothecation_ratio: null,
    },
    identities: null,
    coverage: {
      lido_v4_mainnet_accounting_complete: false, all_ethereum_native_staked_complete: false as const,
      unique_net_eth_locked_complete: false as const, defi_eth_collateral_complete: false as const,
      combined_aave_spark_lido_demand_complete: false as const, rehypothecation_ratio_complete: false as const,
    },
    sources: input.sources ?? [],
    source_status: input.sourceStatus ?? [],
    gaps: input.gaps,
    capabilities: { ethereum_rpc_active: false },
  };
  const parsed = LidoPooledEthBackingSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) fail("schema_drift", "Unavailable Lido pooled ETH snapshot violates its public contract.");
  return parsed.data;
}
