import {
  exactEthEquivalent,
  sumExactEthEquivalents,
  EthCollateralDomainError,
} from "../eth_collateral_demand/metrics.js";
import {
  SPARK_COLLATERAL_ASSETS,
  SparkCollateralCapacitySnapshotSchema,
  type SparkCollateralBlock,
  type SparkCollateralCapacitySnapshot,
  type SparkCollateralGap,
  type SparkCollateralSourceStatus,
  type SparkReserveEvidenceInput,
} from "./types.js";

const PERMANENT_GAPS: readonly SparkCollateralGap[] = [
  { code: "aave_spark_overlap_not_reconciled", detail: "Aave and Spark ETH-family overlap is not reconciled." },
  { code: "actual_user_collateral_not_indexed", detail: "User collateral toggles are not indexed." },
  { code: "net_eth_locked_not_reconciled", detail: "ETH-family lineage is not reconciled across protocols." },
  { code: "gross_collateral_not_reconciled", detail: "Gross collateral is not reconciled across protocols." },
  { code: "rehypothecation_not_reconciled", detail: "Rehypothecation cannot be measured from reserve supply." },
];

export class SparkCollateralDomainError extends Error {
  constructor(public readonly kind: "schema_drift" | "evidence_mismatch", message: string) {
    super(message);
    this.name = "SparkCollateralDomainError";
  }
}

function fail(kind: SparkCollateralDomainError["kind"], message: string): never {
  throw new SparkCollateralDomainError(kind, message);
}

function validateReserveSet(reserves: readonly SparkReserveEvidenceInput[]): void {
  if (reserves.length !== SPARK_COLLATERAL_ASSETS.length) fail("evidence_mismatch", "Spark evidence must contain exactly six fixed assets.");
  const expected = new Map<string, string>(SPARK_COLLATERAL_ASSETS.map((asset) => [asset.symbol, asset.underlying.toLowerCase()]));
  const symbols = new Set<string>();
  const addresses = new Set<string>();
  for (const reserve of reserves) {
    if (typeof reserve.underlying !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(reserve.underlying)) fail("schema_drift", "Spark reserve address is malformed.");
    const address = reserve.underlying.toLowerCase();
    if (expected.get(reserve.symbol) !== address || symbols.has(reserve.symbol) || addresses.has(address)) {
      fail("evidence_mismatch", "Spark evidence does not match the fixed ETH-family asset set.");
    }
    if (reserve.decimals !== 18 || !reserve.active || typeof reserve.suppliedRaw !== "bigint" || typeof reserve.oraclePrice !== "bigint") {
      fail("evidence_mismatch", "Spark reserve evidence is incompatible.");
    }
    if (reserve.suppliedRaw < 0n || reserve.oraclePrice <= 0n) fail("evidence_mismatch", "Spark reserve evidence is incomplete.");
    symbols.add(reserve.symbol);
    addresses.add(address);
  }
}

export function buildVerifiedSparkCollateralSnapshot(input: {
  block: SparkCollateralBlock;
  reserves: readonly SparkReserveEvidenceInput[];
  sources: string[];
  sourceStatus: SparkCollateralSourceStatus[];
  stale?: boolean;
}): SparkCollateralCapacitySnapshot {
  validateReserveSet(input.reserves);
  const weth = input.reserves.find((reserve) => reserve.symbol === "WETH");
  if (weth === undefined) fail("evidence_mismatch", "Spark WETH reference evidence is required.");
  let assets;
  try {
    assets = input.reserves.map((reserve) => ({
      symbol: reserve.symbol,
      underlying: reserve.underlying.toLowerCase(),
      decimals: 18 as const,
      active: true as const,
      collateral_enabled: reserve.collateralEnabled,
      supplied_raw: reserve.suppliedRaw.toString(),
      oracle_price: reserve.oraclePrice.toString(),
      eth_equivalent: exactEthEquivalent(reserve.suppliedRaw, reserve.oraclePrice, weth.oraclePrice),
    }));
  } catch (error) {
    if (error instanceof EthCollateralDomainError) fail(error.kind, error.message);
    throw error;
  }
  const snapshot = {
    status: "verified" as const,
    summary: "SparkLend Ethereum supplied ETH-family capacity was verified at one finalized block.",
    methodology: "spark-eth-collateral-capacity-v1" as const,
    verified_block: input.block,
    metrics: {
      spark_eth_family_supplied: sumExactEthEquivalents(assets.map((asset) => asset.eth_equivalent)),
      spark_collateral_eligible_supplied: sumExactEthEquivalents(assets.filter((asset) => asset.collateral_enabled).map((asset) => asset.eth_equivalent)),
      combined_aave_spark_supplied: null,
      actual_user_collateral: null,
      net_eth_locked: null,
      gross_eth_collateral: null,
      rehypothecation_ratio: null,
    },
    assets,
    identities: { supplied_equals_asset_sum: true as const, eligible_equals_enabled_asset_sum: true as const },
    coverage: {
      spark_lend_ethereum_complete: true,
      aave_spark_overlap_reconciled: false as const,
      user_collateral_usage_complete: false as const,
      net_eth_locked_complete: false as const,
      gross_collateral_complete: false as const,
      rehypothecation_complete: false as const,
    },
    sources: input.sources,
    source_status: input.sourceStatus.map((status) => ({ ...status, stale: input.stale === true })),
    gaps: input.stale === true
      ? [...PERMANENT_GAPS, { code: "source_stale" as const, detail: "Previously verified finalized evidence is stale." }]
      : [...PERMANENT_GAPS],
    capabilities: { ethereum_rpc_active: true },
  };
  const parsed = SparkCollateralCapacitySnapshotSchema.safeParse(snapshot);
  if (!parsed.success) fail("schema_drift", "Verified Spark collateral snapshot violates its public contract.");
  return parsed.data;
}

export function buildUnavailableSparkCollateralSnapshot(input: {
  summary: string;
  gaps: SparkCollateralGap[];
  sources?: string[];
  sourceStatus?: SparkCollateralSourceStatus[];
}): SparkCollateralCapacitySnapshot {
  const sourceFailure = input.gaps.some((gap) => ![
    "aave_spark_overlap_not_reconciled", "actual_user_collateral_not_indexed", "net_eth_locked_not_reconciled",
    "gross_collateral_not_reconciled", "rehypothecation_not_reconciled", "source_stale",
  ].includes(gap.code));
  if (!sourceFailure) fail("evidence_mismatch", "Unavailable Spark evidence requires a source failure gap.");
  const snapshot = {
    status: "unavailable" as const,
    summary: input.summary,
    methodology: "spark-eth-collateral-capacity-v1" as const,
    verified_block: null,
    metrics: {
      spark_eth_family_supplied: null,
      spark_collateral_eligible_supplied: null,
      combined_aave_spark_supplied: null,
      actual_user_collateral: null,
      net_eth_locked: null,
      gross_eth_collateral: null,
      rehypothecation_ratio: null,
    },
    assets: [],
    identities: null,
    coverage: {
      spark_lend_ethereum_complete: false,
      aave_spark_overlap_reconciled: false as const,
      user_collateral_usage_complete: false as const,
      net_eth_locked_complete: false as const,
      gross_collateral_complete: false as const,
      rehypothecation_complete: false as const,
    },
    sources: input.sources ?? [],
    source_status: input.sourceStatus ?? [],
    gaps: input.gaps,
    capabilities: { ethereum_rpc_active: false },
  };
  const parsed = SparkCollateralCapacitySnapshotSchema.safeParse(snapshot);
  if (!parsed.success) fail("schema_drift", "Unavailable Spark collateral snapshot violates its public contract.");
  return parsed.data;
}
