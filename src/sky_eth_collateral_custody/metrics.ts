import {
  SKY_ETH_CUSTODY_ILKS,
  SkyEthCollateralCustodySnapshotSchema,
  type SkyEthCollateralBlock,
  type SkyEthCollateralCustodySnapshot,
  type SkyEthCollateralGap,
  type SkyEthCollateralSourceStatus,
  type SkyEthCustodyIlkEvidenceInput,
  type SkyResolvedContracts,
} from "./types.js";

const UINT256_MAX = (2n ** 256n) - 1n;
const PERMANENT_GAPS: readonly SkyEthCollateralGap[] = [
  { code: "active_vault_collateral_not_measured", detail: "Adapter token custody does not measure active Vault ink." },
  { code: "actual_user_collateral_not_measured", detail: "Adapter token custody does not identify actual user collateral usage." },
  { code: "unique_net_eth_locked_not_reconciled", detail: "ETH-family backing is not deduplicated across protocols." },
  { code: "combined_aave_spark_lido_sky_demand_not_reconciled", detail: "No cross-protocol demand total is reconciled." },
  { code: "rehypothecation_ratio_not_measured", detail: "Adapter token custody cannot measure rehypothecation." },
];

export class SkyEthCollateralCustodyDomainError extends Error {
  constructor(public readonly kind: "schema_drift" | "evidence_mismatch", message: string) {
    super(message);
    this.name = "SkyEthCollateralCustodyDomainError";
  }
}

function fail(kind: SkyEthCollateralCustodyDomainError["kind"], message: string): never {
  throw new SkyEthCollateralCustodyDomainError(kind, message);
}

function uint(value: bigint, field: string): bigint {
  if (typeof value !== "bigint" || value < 0n || value > UINT256_MAX) fail("evidence_mismatch", `${field} must be a uint256.`);
  return value;
}

function validAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

function sum(left: bigint, right: bigint, field: string): bigint {
  const result = left + right;
  return uint(result, field);
}

function validateEvidence(input: { contracts: SkyResolvedContracts; ilks: readonly SkyEthCustodyIlkEvidenceInput[] }): void {
  if (!validAddress(input.contracts.vat)) fail("schema_drift", "Resolved Vat address is malformed.");
  if (input.ilks.length !== SKY_ETH_CUSTODY_ILKS.length) fail("evidence_mismatch", "Sky evidence must contain exactly six ordered ilks.");
  const joins = new Set<string>();
  input.ilks.forEach((actual, index) => {
    const expected = SKY_ETH_CUSTODY_ILKS[index]!;
    if (actual.ilk !== expected.ilk || actual.asset !== expected.asset || actual.chainlog_key !== expected.chainlog_key
      || actual.expected_token.toLowerCase() !== expected.expected_token.toLowerCase() || actual.token.toLowerCase() !== expected.expected_token.toLowerCase()
      || actual.vat.toLowerCase() !== input.contracts.vat.toLowerCase() || !validAddress(actual.join) || joins.has(actual.join.toLowerCase())
      || actual.decimals !== 18 || (actual.live !== 0 && actual.live !== 1)) {
      fail("evidence_mismatch", "Sky resolved join evidence does not match the fixed universe.");
    }
    uint(actual.rawCustody, "Raw adapter custody");
    joins.add(actual.join.toLowerCase());
  });
}

export function buildVerifiedSkyEthCollateralCustodySnapshot(input: {
  block: SkyEthCollateralBlock;
  contracts: SkyResolvedContracts;
  ilks: readonly SkyEthCustodyIlkEvidenceInput[];
  wstethQuotedEthWei: bigint;
  rethQuotedEthWei: bigint;
  sources: string[];
  sourceStatus: SkyEthCollateralSourceStatus[];
  stale?: boolean;
}): SkyEthCollateralCustodySnapshot {
  validateEvidence(input);
  const raw = { WETH: 0n, wstETH: 0n, rETH: 0n };
  for (const ilk of input.ilks) raw[ilk.asset as keyof typeof raw] = sum(raw[ilk.asset as keyof typeof raw], ilk.rawCustody, "Bucket raw custody");
  const wstethQuote = uint(input.wstethQuotedEthWei, "wstETH aggregate quote");
  const rethQuote = uint(input.rethQuotedEthWei, "rETH aggregate quote");
  const total = sum(sum(raw.WETH, wstethQuote, "Total quoted custody"), rethQuote, "Total quoted custody");
  const stale = input.stale === true;
  const snapshot = {
    status: "verified" as const,
    summary: "Sky legacy Maker ETH-family adapter-held token custody was verified at one finalized block.",
    methodology: "sky-eth-collateral-adapter-custody-v1" as const,
    verified_block: input.block,
    resolved_contracts: input.contracts,
    ilks: input.ilks.map(({ rawCustody, ...ilk }) => ({ ...ilk, raw_custody: rawCustody.toString() })),
    buckets: [
      { asset: "WETH" as const, raw_custody: raw.WETH.toString(), quoted_eth_wei: raw.WETH.toString() },
      { asset: "wstETH" as const, raw_custody: raw.wstETH.toString(), quoted_eth_wei: wstethQuote.toString() },
      { asset: "rETH" as const, raw_custody: raw.rETH.toString(), quoted_eth_wei: rethQuote.toString() },
    ],
    quote_inputs: { wsteth_raw: raw.wstETH.toString(), reth_raw: raw.rETH.toString() },
    metrics: {
      sky_eth_family_adapter_custody_eth_wei: total.toString(),
      active_vault_collateral_eth: null, actual_user_collateral_eth: null, unique_net_eth_locked: null,
      combined_aave_spark_lido_sky_demand: null, rehypothecation_ratio: null,
    },
    identities: {
      ilk_raw_custody_equals_bucket_sums: true as const, weth_quote_equals_raw_custody: true as const,
      wsteth_quote_uses_aggregate_amount: true as const, reth_quote_uses_aggregate_amount: true as const,
      total_quoted_custody_equals_bucket_sum: true as const,
    },
    coverage: {
      fixed_ilk_universe_complete: true, active_vault_collateral_complete: false as const, actual_user_collateral_complete: false as const,
      unique_net_eth_locked_complete: false as const, combined_aave_spark_lido_sky_demand_complete: false as const, rehypothecation_ratio_complete: false as const,
    },
    sources: input.sources,
    source_status: input.sourceStatus.map((status) => ({ ...status, stale })),
    gaps: stale ? [...PERMANENT_GAPS, { code: "source_stale" as const, detail: "Previously verified finalized evidence is stale." }] : [...PERMANENT_GAPS],
    capabilities: { ethereum_rpc_active: true },
  };
  const parsed = SkyEthCollateralCustodySnapshotSchema.safeParse(snapshot);
  if (!parsed.success) fail("schema_drift", "Verified Sky adapter custody snapshot violates its public contract.");
  return parsed.data;
}

export function buildUnavailableSkyEthCollateralCustodySnapshot(input: {
  summary: string;
  gaps: SkyEthCollateralGap[];
  sources?: string[];
  sourceStatus?: SkyEthCollateralSourceStatus[];
}): SkyEthCollateralCustodySnapshot {
  if (input.gaps.length !== 1 || !["rpc_not_configured", "rpc_access_gap", "rpc_chain_mismatch", "rpc_finality_gap", "rpc_schema_drift", "rpc_evidence_mismatch"].includes(input.gaps[0]!.code)) {
    fail("evidence_mismatch", "Unavailable Sky evidence requires exactly one source failure gap.");
  }
  const snapshot = {
    status: "unavailable" as const,
    summary: input.summary,
    methodology: "sky-eth-collateral-adapter-custody-v1" as const,
    verified_block: null, resolved_contracts: null, ilks: [], buckets: [], quote_inputs: null,
    metrics: {
      sky_eth_family_adapter_custody_eth_wei: null,
      active_vault_collateral_eth: null, actual_user_collateral_eth: null, unique_net_eth_locked: null,
      combined_aave_spark_lido_sky_demand: null, rehypothecation_ratio: null,
    },
    identities: null,
    coverage: {
      fixed_ilk_universe_complete: false, active_vault_collateral_complete: false as const, actual_user_collateral_complete: false as const,
      unique_net_eth_locked_complete: false as const, combined_aave_spark_lido_sky_demand_complete: false as const, rehypothecation_ratio_complete: false as const,
    },
    sources: input.sources ?? [], source_status: input.sourceStatus ?? [], gaps: input.gaps,
    capabilities: { ethereum_rpc_active: false },
  };
  const parsed = SkyEthCollateralCustodySnapshotSchema.safeParse(snapshot);
  if (!parsed.success) fail("schema_drift", "Unavailable Sky adapter custody snapshot violates its public contract.");
  return parsed.data;
}
