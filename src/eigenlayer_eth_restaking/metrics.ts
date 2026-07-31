import {
  EIGENLAYER_CORE_CONTRACTS,
  EIGENLAYER_ETH_LST_STRATEGIES,
  EigenLayerEthRestakingExposureSnapshotSchema,
  type EigenLayerCoreEvidenceInput,
  type EigenLayerEthRestakingExposureSnapshot,
  type EigenLayerRestakingBlock,
  type EigenLayerRestakingGap,
  type EigenLayerRestakingSourceStatus,
  type EigenLayerStrategyEvidenceInput,
} from "./types.js";

const UINT256_MAX = (2n ** 256n) - 1n;
const PERMANENT_GAPS: readonly EigenLayerRestakingGap[] = [
  { code: "native_restaked_eth_not_measured", detail: "Bounded EigenPodManager diagnostics do not provide a global native-restaked ETH total." },
  { code: "lst_restaked_eth_equivalent_not_measured", detail: "Heterogeneous LST token units are not converted to ETH equivalents." },
  { code: "eigenlayer_eth_family_exposure_not_measured", detail: "Native and heterogeneous LST observations are not combined into an ETH-family total." },
  { code: "unique_net_eth_locked_not_reconciled", detail: "Restaked ETH-family backing is not deduplicated or netted." },
  { code: "combined_aave_spark_lido_sky_eigenlayer_demand_not_reconciled", detail: "No cross-protocol demand total is reconciled." },
  { code: "rehypothecation_ratio_not_measured", detail: "This bounded snapshot cannot measure rehypothecation." },
];

export class EigenLayerEthRestakingDomainError extends Error {
  constructor(public readonly kind: "schema_drift" | "evidence_mismatch", message: string) {
    super(message);
    this.name = "EigenLayerEthRestakingDomainError";
  }
}

function fail(kind: EigenLayerEthRestakingDomainError["kind"], message: string): never {
  throw new EigenLayerEthRestakingDomainError(kind, message);
}

function uint(value: bigint, field: string): bigint {
  if (typeof value !== "bigint" || value < 0n || value > UINT256_MAX) fail("evidence_mismatch", `${field} must be a uint256.`);
  return value;
}

function validAddress(value: string): boolean {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value) && !/^0x0{40}$/i.test(value);
}

function validateCore(core: EigenLayerCoreEvidenceInput): void {
  if (core.strategyManager !== EIGENLAYER_CORE_CONTRACTS.strategy_manager
    || core.eigenPodManager !== EIGENLAYER_CORE_CONTRACTS.eigen_pod_manager
    || core.delegationManager !== EIGENLAYER_CORE_CONTRACTS.delegation_manager
    || core.beaconChainEthStrategy !== EIGENLAYER_CORE_CONTRACTS.beacon_chain_eth_strategy
    || core.strategyManagerDelegation !== EIGENLAYER_CORE_CONTRACTS.delegation_manager
    || core.eigenPodManagerDelegation !== EIGENLAYER_CORE_CONTRACTS.delegation_manager) {
    fail("evidence_mismatch", "EigenLayer core evidence does not match the fixed manager bindings.");
  }
}

function validateStrategies(strategies: readonly EigenLayerStrategyEvidenceInput[]): void {
  if (strategies.length !== EIGENLAYER_ETH_LST_STRATEGIES.length) fail("evidence_mismatch", "EigenLayer evidence must contain exactly twelve ordered strategies.");
  const tokens = new Set<string>();
  strategies.forEach((actual, index) => {
    const expected = EIGENLAYER_ETH_LST_STRATEGIES[index]!;
    const token = typeof actual.underlyingToken === "string" ? actual.underlyingToken.toLowerCase() : "";
    if (actual.label !== expected.label || actual.strategy !== expected.strategy
      || actual.strategyManager !== EIGENLAYER_CORE_CONTRACTS.strategy_manager
      || !validAddress(actual.underlyingToken) || tokens.has(token)
      || !Number.isInteger(actual.decimals) || actual.decimals < 0 || actual.decimals > 255
      || typeof actual.whitelisted !== "boolean") {
      fail("evidence_mismatch", "EigenLayer strategy evidence does not match the fixed ordered universe.");
    }
    uint(actual.totalShares, "Total shares");
    uint(actual.tokenCustody, "Token custody");
    uint(actual.shareAccountingUnderlying, "Share-accounting underlying");
    tokens.add(token);
  });
}

export function buildVerifiedEigenLayerEthRestakingExposureSnapshot(input: {
  block: EigenLayerRestakingBlock;
  core: EigenLayerCoreEvidenceInput;
  strategies: readonly EigenLayerStrategyEvidenceInput[];
  numPods: bigint;
  burnableEthShares: bigint;
  sources: string[];
  sourceStatus: EigenLayerRestakingSourceStatus[];
  stale?: boolean;
}): EigenLayerEthRestakingExposureSnapshot {
  validateCore(input.core);
  validateStrategies(input.strategies);
  const numPods = uint(input.numPods, "EigenPod count");
  const burnableEthShares = uint(input.burnableEthShares, "Burnable ETH shares");
  const stale = input.stale === true;
  const snapshot = {
    status: "verified" as const,
    summary: "Fixed legacy EigenLayer ETH-family LST strategy token-unit exposure and native-restaking diagnostics were verified at one finalized block.",
    methodology: "eigenlayer-eth-restaking-exposure-v1" as const,
    verified_block: input.block,
    core_contracts: { ...EIGENLAYER_CORE_CONTRACTS },
    strategies: input.strategies.map((strategy) => ({
      label: strategy.label,
      strategy: strategy.strategy,
      underlying_token: strategy.underlyingToken,
      decimals: strategy.decimals,
      whitelisted: strategy.whitelisted,
      strategy_manager: strategy.strategyManager,
      total_shares: strategy.totalShares.toString(),
      token_custody: strategy.tokenCustody.toString(),
      share_accounting_underlying: strategy.shareAccountingUnderlying.toString(),
      share_quote_exceeds_custody: strategy.shareAccountingUnderlying > strategy.tokenCustody,
    })),
    native_diagnostics: {
      strategy_manager_delegation: input.core.strategyManagerDelegation,
      eigen_pod_manager_delegation: input.core.eigenPodManagerDelegation,
      beacon_chain_eth_strategy: input.core.beaconChainEthStrategy,
      num_pods: numPods.toString(),
      burnable_eth_shares: burnableEthShares.toString(),
    },
    metrics: {
      native_restaked_eth_wei: null,
      lst_restaked_eth_equivalent_wei: null,
      eigenlayer_eth_family_exposure_eth_wei: null,
      unique_net_eth_locked: null,
      combined_aave_spark_lido_sky_eigenlayer_demand: null,
      rehypothecation_ratio: null,
    },
    identities: {
      core_manager_bindings_verified: true as const,
      beacon_strategy_identity_verified: true as const,
      strategy_manager_bindings_verified: true as const,
      underlying_tokens_unique: true as const,
      token_native_amounts_not_aggregated: true as const,
    },
    coverage: {
      fixed_strategy_universe_complete: true,
      native_restaked_eth_complete: false as const,
      lst_restaked_eth_equivalent_complete: false as const,
      eigenlayer_eth_family_exposure_complete: false as const,
      unique_net_eth_locked_complete: false as const,
      combined_aave_spark_lido_sky_eigenlayer_demand_complete: false as const,
      rehypothecation_ratio_complete: false as const,
    },
    sources: input.sources,
    source_status: input.sourceStatus.map((status) => ({ ...status, stale })),
    gaps: stale ? [...PERMANENT_GAPS, { code: "source_stale" as const, detail: "Previously verified finalized evidence is stale." }] : [...PERMANENT_GAPS],
    capabilities: { ethereum_rpc_active: true },
  };
  const parsed = EigenLayerEthRestakingExposureSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) fail("schema_drift", "Verified EigenLayer restaking exposure snapshot violates its public contract.");
  return parsed.data;
}

export function buildUnavailableEigenLayerEthRestakingExposureSnapshot(input: {
  summary: string;
  gaps: EigenLayerRestakingGap[];
  sources?: string[];
  sourceStatus?: EigenLayerRestakingSourceStatus[];
}): EigenLayerEthRestakingExposureSnapshot {
  const sourceFailures = [
    "rpc_not_configured",
    "rpc_access_gap",
    "rpc_chain_mismatch",
    "rpc_finality_gap",
    "rpc_schema_drift",
    "rpc_evidence_mismatch",
  ];
  if (input.gaps.length !== 1 || !sourceFailures.includes(input.gaps[0]!.code)) {
    fail("evidence_mismatch", "Unavailable EigenLayer evidence requires exactly one source failure gap.");
  }
  const snapshot = {
    status: "unavailable" as const,
    summary: input.summary,
    methodology: "eigenlayer-eth-restaking-exposure-v1" as const,
    verified_block: null,
    core_contracts: null,
    strategies: [],
    native_diagnostics: null,
    metrics: {
      native_restaked_eth_wei: null,
      lst_restaked_eth_equivalent_wei: null,
      eigenlayer_eth_family_exposure_eth_wei: null,
      unique_net_eth_locked: null,
      combined_aave_spark_lido_sky_eigenlayer_demand: null,
      rehypothecation_ratio: null,
    },
    identities: null,
    coverage: {
      fixed_strategy_universe_complete: false,
      native_restaked_eth_complete: false as const,
      lst_restaked_eth_equivalent_complete: false as const,
      eigenlayer_eth_family_exposure_complete: false as const,
      unique_net_eth_locked_complete: false as const,
      combined_aave_spark_lido_sky_eigenlayer_demand_complete: false as const,
      rehypothecation_ratio_complete: false as const,
    },
    sources: input.sources ?? [],
    source_status: input.sourceStatus ?? [],
    gaps: input.gaps,
    capabilities: { ethereum_rpc_active: false },
  };
  const parsed = EigenLayerEthRestakingExposureSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) fail("schema_drift", "Unavailable EigenLayer restaking exposure snapshot violates its public contract.");
  return parsed.data;
}
