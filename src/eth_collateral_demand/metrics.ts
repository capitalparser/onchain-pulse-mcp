import {
  ETH_COLLATERAL_ASSETS,
  EthCollateralDemandSnapshotSchema,
  ExactEthEquivalentSchema,
  type AaveReserveEvidenceInput,
  type EthCollateralBlock,
  type EthCollateralDemandSnapshot,
  type EthCollateralGap,
  type EthCollateralSourceStatus,
  type ExactEthEquivalent,
} from "./types.js";

const ETH_WEI = 1_000_000_000_000_000_000n;
const PERMANENT_GAPS: readonly EthCollateralGap[] = [
  { code: "actual_user_collateral_not_indexed", detail: "User collateral toggles are not indexed." },
  { code: "net_eth_locked_not_reconciled", detail: "ETH-family lineage is not reconciled across protocols." },
  { code: "gross_collateral_not_reconciled", detail: "Gross collateral is not reconciled across protocols." },
  { code: "rehypothecation_not_reconciled", detail: "Rehypothecation cannot be measured from reserve supply." },
];

export class EthCollateralDomainError extends Error {
  constructor(
    public readonly kind: "schema_drift" | "evidence_mismatch",
    message: string,
  ) {
    super(message);
    this.name = "EthCollateralDomainError";
  }
}

function fail(kind: EthCollateralDomainError["kind"], message: string): never {
  throw new EthCollateralDomainError(kind, message);
}

function requireBigint(value: unknown, name: string): bigint {
  if (typeof value !== "bigint") fail("schema_drift", `${name} must be a bigint.`);
  return value;
}

function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function lcm(left: bigint, right: bigint): bigint {
  return (left / gcd(left, right)) * right;
}

function formatWeiAsEth(wei: bigint): string {
  const whole = wei / ETH_WEI;
  const fractionalWei = wei % ETH_WEI;
  if (fractionalWei === 0n) return whole.toString();
  return `${whole}.${fractionalWei.toString().padStart(18, "0").replace(/0+$/, "")}`;
}

function exactFromFraction(numerator: bigint, denominator: bigint, reduce = true): ExactEthEquivalent {
  if (numerator < 0n || denominator <= 0n) fail("evidence_mismatch", "Exact ETH fraction must be non-negative with a positive denominator.");
  const divisor = reduce ? gcd(numerator, denominator) : 1n;
  const normalizedNumerator = numerator / divisor;
  const normalizedDenominator = denominator / divisor;
  const weiFloor = normalizedNumerator / normalizedDenominator;
  const remainder = normalizedNumerator % normalizedDenominator;
  return {
    wei_floor: weiFloor.toString(),
    eth_floor: formatWeiAsEth(weiFloor),
    remainder: remainder.toString(),
    denominator: normalizedDenominator.toString(),
  };
}

function fractionFromExact(value: ExactEthEquivalent): { numerator: bigint; denominator: bigint } {
  const denominator = BigInt(value.denominator);
  const remainder = BigInt(value.remainder);
  if (denominator <= 0n || remainder < 0n || remainder >= denominator) {
    fail("schema_drift", "Exact ETH value is not a canonical non-negative fraction.");
  }
  return { numerator: BigInt(value.wei_floor) * denominator + remainder, denominator };
}

export function exactEthEquivalent(suppliedRaw: bigint, assetOraclePrice: bigint, wethOraclePrice: bigint): ExactEthEquivalent {
  requireBigint(suppliedRaw, "suppliedRaw");
  requireBigint(assetOraclePrice, "assetOraclePrice");
  requireBigint(wethOraclePrice, "wethOraclePrice");
  if (suppliedRaw < 0n || assetOraclePrice <= 0n || wethOraclePrice <= 0n) {
    fail("evidence_mismatch", "Supply must be non-negative and oracle prices must be positive.");
  }
  return exactFromFraction(suppliedRaw * assetOraclePrice, wethOraclePrice, false);
}

export function sumExactEthEquivalents(values: readonly ExactEthEquivalent[]): ExactEthEquivalent {
  if (!Array.isArray(values)) fail("schema_drift", "Exact ETH values must be an array.");
  let numerator = 0n;
  let denominator = 1n;
  for (const value of values) {
    const parsed = ExactEthEquivalentSchema.safeParse(value);
    if (!parsed.success) fail("schema_drift", "Exact ETH value violates its public contract.");
    const fraction = fractionFromExact(parsed.data);
    const commonDenominator = lcm(denominator, fraction.denominator);
    numerator = numerator * (commonDenominator / denominator)
      + fraction.numerator * (commonDenominator / fraction.denominator);
    denominator = commonDenominator;
    const divisor = gcd(numerator, denominator);
    numerator /= divisor;
    denominator /= divisor;
  }
  return exactFromFraction(numerator, denominator);
}

function validateReserveSet(reserves: readonly AaveReserveEvidenceInput[]): void {
  if (reserves.length !== ETH_COLLATERAL_ASSETS.length) fail("evidence_mismatch", "Aave evidence must contain exactly the fixed ten assets.");
  const expectedBySymbol = new Map<string, string>(ETH_COLLATERAL_ASSETS.map((asset) => [asset.symbol, asset.underlying.toLowerCase()]));
  const seenSymbols = new Set<string>();
  const seenAddresses = new Set<string>();
  for (const reserve of reserves) {
    if (typeof reserve.underlying !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(reserve.underlying)) {
      fail("schema_drift", "Reserve address is malformed.");
    }
    const expectedAddress = expectedBySymbol.get(reserve.symbol);
    const normalizedAddress = reserve.underlying.toLowerCase();
    if (!expectedAddress || expectedAddress !== normalizedAddress || seenSymbols.has(reserve.symbol) || seenAddresses.has(normalizedAddress)) {
      fail("evidence_mismatch", "Aave evidence does not match the fixed ETH-family asset set.");
    }
    if (reserve.decimals !== 18 || !reserve.active || reserve.oraclePrice <= 0n || reserve.suppliedRaw < 0n) {
      fail("evidence_mismatch", "Reserve evidence is inactive, incompatible, or incomplete.");
    }
    seenSymbols.add(reserve.symbol);
    seenAddresses.add(normalizedAddress);
  }
}

export function buildVerifiedEthCollateralSnapshot(input: {
  block: EthCollateralBlock;
  reserves: readonly AaveReserveEvidenceInput[];
  sources: string[];
  sourceStatus: EthCollateralSourceStatus[];
  stale?: boolean;
}): EthCollateralDemandSnapshot {
  validateReserveSet(input.reserves);
  const weth = input.reserves.find((reserve) => reserve.symbol === "WETH");
  if (!weth) fail("evidence_mismatch", "WETH reference evidence is required.");

  const assets = input.reserves.map((reserve) => ({
    symbol: reserve.symbol,
    underlying: reserve.underlying.toLowerCase(),
    decimals: 18 as const,
    active: true as const,
    collateral_enabled: reserve.collateralEnabled,
    supplied_raw: reserve.suppliedRaw.toString(),
    oracle_price: reserve.oraclePrice.toString(),
    eth_equivalent: exactEthEquivalent(reserve.suppliedRaw, reserve.oraclePrice, weth.oraclePrice),
  }));
  const supplied = sumExactEthEquivalents(assets.map((asset) => asset.eth_equivalent));
  const eligible = sumExactEthEquivalents(assets.filter((asset) => asset.collateral_enabled).map((asset) => asset.eth_equivalent));
  const snapshot = {
    status: "verified" as const,
    summary: "Aave V3 Ethereum Core supplied ETH-family capacity was verified at one finalized block.",
    methodology: "eth-collateral-demand-aave-v3-v1" as const,
    verified_block: input.block,
    metrics: {
      eth_family_supplied: supplied,
      collateral_eligible_supplied: eligible,
      actual_user_collateral: null,
      net_eth_locked: null,
      gross_eth_collateral: null,
      rehypothecation_ratio: null,
    },
    assets,
    identities: { supplied_equals_asset_sum: true as const, eligible_equals_enabled_asset_sum: true as const },
    coverage: {
      aave_v3_ethereum_core_complete: true,
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
  const parsed = EthCollateralDemandSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) fail("schema_drift", "Verified collateral snapshot violates its public contract.");
  return parsed.data;
}

export function buildUnavailableEthCollateralSnapshot(input: {
  summary: string;
  gaps: EthCollateralGap[];
  sources?: string[];
  sourceStatus?: EthCollateralSourceStatus[];
}): EthCollateralDemandSnapshot {
  const sourceFailure = input.gaps.some((gap) => ![
    "actual_user_collateral_not_indexed", "net_eth_locked_not_reconciled",
    "gross_collateral_not_reconciled", "rehypothecation_not_reconciled", "source_stale",
  ].includes(gap.code));
  if (!sourceFailure) fail("evidence_mismatch", "Unavailable evidence requires a bounded source failure gap.");
  const snapshot = {
    status: "unavailable" as const,
    summary: input.summary,
    methodology: "eth-collateral-demand-aave-v3-v1" as const,
    verified_block: null,
    metrics: {
      eth_family_supplied: null,
      collateral_eligible_supplied: null,
      actual_user_collateral: null,
      net_eth_locked: null,
      gross_eth_collateral: null,
      rehypothecation_ratio: null,
    },
    assets: [],
    identities: null,
    coverage: {
      aave_v3_ethereum_core_complete: false,
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
  const parsed = EthCollateralDemandSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) fail("schema_drift", "Unavailable collateral snapshot violates its public contract.");
  return parsed.data;
}
