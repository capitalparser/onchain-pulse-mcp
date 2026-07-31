import { z } from "zod";

export const EIGENLAYER_CORE_CONTRACTS = {
  strategy_manager: "0x858646372CC42E1A627fcE94aa7A7033e7CF075A",
  eigen_pod_manager: "0x91E677b07F7AF907ec9a428aafA9fc14a0d3A338",
  delegation_manager: "0x39053D51B77DC0d36036Fc1fCc8Cb819df8Ef37A",
  beacon_chain_eth_strategy: "0xbeaC0eeEeeeeEEeEeEEEEeeEEeEeeeEeeEEBEaC0",
} as const;

export const EIGENLAYER_ETH_LST_STRATEGIES = [
  { label: "stETH", strategy: "0x93c4b944D05dfe6df7645A86cd2206016c51564D" },
  { label: "rETH", strategy: "0x1BeE69b7dFFfA4E2d53C2a2Df135C388AD25dCD2" },
  { label: "cbETH", strategy: "0x54945180dB7943c0ed0FEE7EdaB2Bd24620256bc" },
  { label: "ETHx", strategy: "0x9d7eD45EE2E8FC5482fa2428f15C971e6369011d" },
  { label: "ankrETH", strategy: "0x13760F50a9d7377e4F20CB8CF9e4c26586c658ff" },
  { label: "oETH", strategy: "0xa4C637e0F704745D182e4D38cAb7E7485321d059" },
  { label: "osETH", strategy: "0x57ba429517c3473B6d34CA9aCd56c0e735b94c02" },
  { label: "swETH", strategy: "0x0Fe4F44beE93503346A3Ac9EE5A26b130a5796d6" },
  { label: "wBETH", strategy: "0x7CA911E83dabf90C90dD3De5411a10F1A6112184" },
  { label: "sfrxETH", strategy: "0x8CA7A5d6f3acd3A7A8bC468a8CD0FB14B6BD28b6" },
  { label: "lsETH", strategy: "0xAe60d8180437b5C34bB956822ac2710972584473" },
  { label: "mETH", strategy: "0x298aFB19A105D59E74658C4C334Ff360BadE6dd2" },
] as const;

const UINT256_MAX = (2n ** 256n) - 1n;
const DecimalStringSchema = z.string().max(78).regex(/^(0|[1-9]\d*)$/).refine((value) => {
  try {
    return BigInt(value) <= UINT256_MAX;
  } catch {
    return false;
  }
}, "must be a uint256");
const AddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/).refine((value) => !/^0x0{40}$/i.test(value), "must be nonzero");
const BlockHashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/);

export const EIGENLAYER_PERMANENT_GAP_CODES = [
  "native_restaked_eth_not_measured",
  "lst_restaked_eth_equivalent_not_measured",
  "eigenlayer_eth_family_exposure_not_measured",
  "unique_net_eth_locked_not_reconciled",
  "combined_aave_spark_lido_sky_eigenlayer_demand_not_reconciled",
  "rehypothecation_ratio_not_measured",
] as const;
const SOURCE_FAILURE_GAP_CODES = new Set([
  "rpc_not_configured",
  "rpc_access_gap",
  "rpc_chain_mismatch",
  "rpc_finality_gap",
  "rpc_schema_drift",
  "rpc_evidence_mismatch",
]);

export const EigenLayerRestakingBlockSchema = z.object({
  number: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  hash: BlockHashSchema,
  timestamp: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).strict();
export type EigenLayerRestakingBlock = z.infer<typeof EigenLayerRestakingBlockSchema>;

export const EigenLayerCoreContractsSchema = z.object({
  strategy_manager: z.literal(EIGENLAYER_CORE_CONTRACTS.strategy_manager),
  eigen_pod_manager: z.literal(EIGENLAYER_CORE_CONTRACTS.eigen_pod_manager),
  delegation_manager: z.literal(EIGENLAYER_CORE_CONTRACTS.delegation_manager),
  beacon_chain_eth_strategy: z.literal(EIGENLAYER_CORE_CONTRACTS.beacon_chain_eth_strategy),
}).strict();
export type EigenLayerCoreContracts = z.infer<typeof EigenLayerCoreContractsSchema>;

export const EigenLayerStrategyEvidenceSchema = z.object({
  label: z.string().min(1).max(32),
  strategy: AddressSchema,
  underlying_token: AddressSchema,
  decimals: z.number().int().min(0).max(255),
  whitelisted: z.boolean(),
  strategy_manager: z.literal(EIGENLAYER_CORE_CONTRACTS.strategy_manager),
  total_shares: DecimalStringSchema,
  token_custody: DecimalStringSchema,
  share_accounting_underlying: DecimalStringSchema,
  share_quote_exceeds_custody: z.boolean(),
}).strict();
export type EigenLayerStrategyEvidence = z.infer<typeof EigenLayerStrategyEvidenceSchema>;

export const EigenLayerNativeDiagnosticsSchema = z.object({
  strategy_manager_delegation: z.literal(EIGENLAYER_CORE_CONTRACTS.delegation_manager),
  eigen_pod_manager_delegation: z.literal(EIGENLAYER_CORE_CONTRACTS.delegation_manager),
  beacon_chain_eth_strategy: z.literal(EIGENLAYER_CORE_CONTRACTS.beacon_chain_eth_strategy),
  num_pods: DecimalStringSchema,
  burnable_eth_shares: DecimalStringSchema,
}).strict();
export type EigenLayerNativeDiagnostics = z.infer<typeof EigenLayerNativeDiagnosticsSchema>;

export const EigenLayerRestakingGapCodeSchema = z.enum([
  ...EIGENLAYER_PERMANENT_GAP_CODES,
  "rpc_not_configured",
  "rpc_access_gap",
  "rpc_chain_mismatch",
  "rpc_finality_gap",
  "rpc_schema_drift",
  "rpc_evidence_mismatch",
  "source_stale",
]);
export type EigenLayerRestakingGapCode = z.infer<typeof EigenLayerRestakingGapCodeSchema>;
export const EigenLayerRestakingGapSchema = z.object({
  code: EigenLayerRestakingGapCodeSchema,
  detail: z.string().min(1).max(240),
}).strict();
export type EigenLayerRestakingGap = z.infer<typeof EigenLayerRestakingGapSchema>;

export const EigenLayerRestakingSourceStatusSchema = z.object({
  source: z.literal("ethereum_rpc"),
  role: z.literal("eigenlayer_finalized_restaking_exposure_evidence"),
  stale: z.boolean(),
}).strict();
export type EigenLayerRestakingSourceStatus = z.infer<typeof EigenLayerRestakingSourceStatusSchema>;

const MetricsSchema = z.object({
  native_restaked_eth_wei: z.null(),
  lst_restaked_eth_equivalent_wei: z.null(),
  eigenlayer_eth_family_exposure_eth_wei: z.null(),
  unique_net_eth_locked: z.null(),
  combined_aave_spark_lido_sky_eigenlayer_demand: z.null(),
  rehypothecation_ratio: z.null(),
}).strict();

const CoverageSchema = z.object({
  fixed_strategy_universe_complete: z.boolean(),
  native_restaked_eth_complete: z.literal(false),
  lst_restaked_eth_equivalent_complete: z.literal(false),
  eigenlayer_eth_family_exposure_complete: z.literal(false),
  unique_net_eth_locked_complete: z.literal(false),
  combined_aave_spark_lido_sky_eigenlayer_demand_complete: z.literal(false),
  rehypothecation_ratio_complete: z.literal(false),
}).strict();

const SnapshotBaseSchema = z.object({
  status: z.enum(["verified", "unavailable"]),
  summary: z.string().min(1).max(500),
  methodology: z.literal("eigenlayer-eth-restaking-exposure-v1"),
  verified_block: EigenLayerRestakingBlockSchema.nullable(),
  core_contracts: EigenLayerCoreContractsSchema.nullable(),
  strategies: z.array(EigenLayerStrategyEvidenceSchema),
  native_diagnostics: EigenLayerNativeDiagnosticsSchema.nullable(),
  metrics: MetricsSchema,
  identities: z.object({
    core_manager_bindings_verified: z.literal(true),
    beacon_strategy_identity_verified: z.literal(true),
    strategy_manager_bindings_verified: z.literal(true),
    underlying_tokens_unique: z.literal(true),
    token_native_amounts_not_aggregated: z.literal(true),
  }).strict().nullable(),
  coverage: CoverageSchema,
  sources: z.array(z.literal("ethereum_rpc")),
  source_status: z.array(EigenLayerRestakingSourceStatusSchema),
  gaps: z.array(EigenLayerRestakingGapSchema),
  capabilities: z.object({ ethereum_rpc_active: z.boolean() }).strict(),
}).strict();

function uint(value: string): bigint | null {
  try {
    const parsed = BigInt(value);
    return parsed >= 0n && parsed <= UINT256_MAX ? parsed : null;
  } catch {
    return null;
  }
}

function add(context: z.RefinementCtx, message: string): void {
  context.addIssue({ code: z.ZodIssueCode.custom, message });
}

export const EigenLayerEthRestakingExposureSnapshotSchema = SnapshotBaseSchema.superRefine((snapshot, context) => {
  try {
    if (snapshot.status === "unavailable") {
      const sourceFailure = snapshot.gaps.length === 1 && SOURCE_FAILURE_GAP_CODES.has(snapshot.gaps[0]!.code);
      const noEvidence = snapshot.verified_block === null && snapshot.core_contracts === null && snapshot.strategies.length === 0
        && snapshot.native_diagnostics === null && snapshot.identities === null && !snapshot.coverage.fixed_strategy_universe_complete;
      const noRpc = snapshot.gaps[0]?.code === "rpc_not_configured";
      const provenance = noRpc
        ? snapshot.sources.length === 0 && snapshot.source_status.length === 0
        : snapshot.sources.length === 1 && snapshot.source_status.length === 1 && !snapshot.source_status[0]!.stale;
      if (!sourceFailure || !noEvidence || snapshot.capabilities.ethereum_rpc_active || !provenance) {
        add(context, "unavailable snapshot contains partial or incoherent evidence");
      }
      return;
    }
    const staleGaps = snapshot.gaps.filter((gap) => gap.code === "source_stale").length;
    const provenance = snapshot.sources.length === 1 && snapshot.source_status.length === 1
      && snapshot.source_status[0]!.stale === (staleGaps === 1);
    const permanentGaps = EIGENLAYER_PERMANENT_GAP_CODES.every(
      (code) => snapshot.gaps.filter((gap) => gap.code === code).length === 1,
    ) && snapshot.gaps.every(
      (gap) => (EIGENLAYER_PERMANENT_GAP_CODES as readonly string[]).includes(gap.code) || gap.code === "source_stale",
    ) && staleGaps <= 1;
    if (snapshot.verified_block === null || snapshot.core_contracts === null || snapshot.native_diagnostics === null
      || snapshot.identities === null || !snapshot.coverage.fixed_strategy_universe_complete
      || !snapshot.capabilities.ethereum_rpc_active || !provenance || !permanentGaps) {
      add(context, "verified snapshot is incomplete or has incoherent provenance");
      return;
    }
    if (snapshot.strategies.length !== EIGENLAYER_ETH_LST_STRATEGIES.length) {
      add(context, "fixed strategy universe is incomplete");
      return;
    }
    const tokens = new Set<string>();
    for (let index = 0; index < EIGENLAYER_ETH_LST_STRATEGIES.length; index += 1) {
      const expected = EIGENLAYER_ETH_LST_STRATEGIES[index]!;
      const actual = snapshot.strategies[index]!;
      const custody = uint(actual.token_custody);
      const shareAccounting = uint(actual.share_accounting_underlying);
      const token = actual.underlying_token.toLowerCase();
      if (actual.label !== expected.label || actual.strategy !== expected.strategy || tokens.has(token)
        || custody === null || shareAccounting === null || actual.share_quote_exceeds_custody !== (shareAccounting > custody)) {
        add(context, "strategy evidence does not match the ordered fixed universe");
        return;
      }
      tokens.add(token);
    }
  } catch {
    add(context, "snapshot evidence could not be safely reconciled");
  }
});
export type EigenLayerEthRestakingExposureSnapshot = z.infer<typeof EigenLayerEthRestakingExposureSnapshotSchema>;

export interface EigenLayerCoreEvidenceInput {
  strategyManager: string;
  eigenPodManager: string;
  delegationManager: string;
  beaconChainEthStrategy: string;
  strategyManagerDelegation: string;
  eigenPodManagerDelegation: string;
}

export interface EigenLayerStrategyEvidenceInput {
  label: string;
  strategy: string;
  underlyingToken: string;
  decimals: number;
  whitelisted: boolean;
  strategyManager: string;
  totalShares: bigint;
  tokenCustody: bigint;
  shareAccountingUnderlying: bigint;
}
