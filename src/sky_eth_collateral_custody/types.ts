import { z } from "zod";

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

export const SKY_ETH_CUSTODY_ILKS = [
  { ilk: "ETH-A", asset: "WETH", chainlog_key: "MCD_JOIN_ETH_A", expected_token: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" },
  { ilk: "ETH-B", asset: "WETH", chainlog_key: "MCD_JOIN_ETH_B", expected_token: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" },
  { ilk: "ETH-C", asset: "WETH", chainlog_key: "MCD_JOIN_ETH_C", expected_token: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" },
  { ilk: "WSTETH-A", asset: "wstETH", chainlog_key: "MCD_JOIN_WSTETH_A", expected_token: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0" },
  { ilk: "WSTETH-B", asset: "wstETH", chainlog_key: "MCD_JOIN_WSTETH_B", expected_token: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0" },
  { ilk: "RETH-A", asset: "rETH", chainlog_key: "MCD_JOIN_RETH_A", expected_token: "0xae78736Cd615f374D3085123A210448E74Fc6393" },
] as const;

const PermanentGapCodes = [
  "active_vault_collateral_not_measured",
  "actual_user_collateral_not_measured",
  "unique_net_eth_locked_not_reconciled",
  "combined_aave_spark_lido_sky_demand_not_reconciled",
  "rehypothecation_ratio_not_measured",
] as const;
const SourceFailureGapCodes = new Set([
  "rpc_not_configured", "rpc_access_gap", "rpc_chain_mismatch", "rpc_finality_gap", "rpc_schema_drift", "rpc_evidence_mismatch",
]);

export const SkyEthCollateralBlockSchema = z.object({
  number: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), hash: BlockHashSchema,
  timestamp: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).strict();
export type SkyEthCollateralBlock = z.infer<typeof SkyEthCollateralBlockSchema>;

export const SkyResolvedContractsSchema = z.object({
  vat: AddressSchema,
  weth: z.literal("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"),
  wsteth: z.literal("0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0"),
  reth: z.literal("0xae78736Cd615f374D3085123A210448E74Fc6393"),
}).strict();
export type SkyResolvedContracts = z.infer<typeof SkyResolvedContractsSchema>;

export const SkyEthCustodyIlkSchema = z.object({
  ilk: z.string().min(1), asset: z.enum(["WETH", "wstETH", "rETH"]), chainlog_key: z.string().min(1), expected_token: AddressSchema,
  join: AddressSchema, vat: AddressSchema, token: AddressSchema, decimals: z.literal(18), live: z.union([z.literal(0), z.literal(1)]), raw_custody: DecimalStringSchema,
}).strict();
export type SkyEthCustodyIlk = z.infer<typeof SkyEthCustodyIlkSchema>;

export const SkyEthCustodyBucketSchema = z.object({
  asset: z.enum(["WETH", "wstETH", "rETH"]), raw_custody: DecimalStringSchema, quoted_eth_wei: DecimalStringSchema,
}).strict();
export type SkyEthCustodyBucket = z.infer<typeof SkyEthCustodyBucketSchema>;

export const SkyEthCollateralGapCodeSchema = z.enum([
  ...PermanentGapCodes, "rpc_not_configured", "rpc_access_gap", "rpc_chain_mismatch", "rpc_finality_gap", "rpc_schema_drift", "rpc_evidence_mismatch", "source_stale",
]);
export type SkyEthCollateralGapCode = z.infer<typeof SkyEthCollateralGapCodeSchema>;
export const SkyEthCollateralGapSchema = z.object({ code: SkyEthCollateralGapCodeSchema, detail: z.string().min(1).max(240) }).strict();
export type SkyEthCollateralGap = z.infer<typeof SkyEthCollateralGapSchema>;

export const SkyEthCollateralSourceStatusSchema = z.object({
  source: z.literal("ethereum_rpc"), role: z.literal("sky_chainlog_finalized_adapter_custody_evidence"), stale: z.boolean(),
}).strict();
export type SkyEthCollateralSourceStatus = z.infer<typeof SkyEthCollateralSourceStatusSchema>;

const SnapshotBaseSchema = z.object({
  status: z.enum(["verified", "unavailable"]),
  summary: z.string().min(1).max(500),
  methodology: z.literal("sky-eth-collateral-adapter-custody-v1"),
  verified_block: SkyEthCollateralBlockSchema.nullable(),
  resolved_contracts: SkyResolvedContractsSchema.nullable(),
  ilks: z.array(SkyEthCustodyIlkSchema),
  buckets: z.array(SkyEthCustodyBucketSchema),
  quote_inputs: z.object({ wsteth_raw: DecimalStringSchema, reth_raw: DecimalStringSchema }).strict().nullable(),
  metrics: z.object({
    sky_eth_family_adapter_custody_eth_wei: DecimalStringSchema.nullable(),
    active_vault_collateral_eth: z.null(), actual_user_collateral_eth: z.null(), unique_net_eth_locked: z.null(),
    combined_aave_spark_lido_sky_demand: z.null(), rehypothecation_ratio: z.null(),
  }).strict(),
  identities: z.object({
    ilk_raw_custody_equals_bucket_sums: z.literal(true), weth_quote_equals_raw_custody: z.literal(true),
    wsteth_quote_uses_aggregate_amount: z.literal(true), reth_quote_uses_aggregate_amount: z.literal(true),
    total_quoted_custody_equals_bucket_sum: z.literal(true),
  }).strict().nullable(),
  coverage: z.object({
    fixed_ilk_universe_complete: z.boolean(), active_vault_collateral_complete: z.literal(false), actual_user_collateral_complete: z.literal(false),
    unique_net_eth_locked_complete: z.literal(false), combined_aave_spark_lido_sky_demand_complete: z.literal(false), rehypothecation_ratio_complete: z.literal(false),
  }).strict(),
  sources: z.array(z.literal("ethereum_rpc")), source_status: z.array(SkyEthCollateralSourceStatusSchema), gaps: z.array(SkyEthCollateralGapSchema),
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

function verifiedProvenance(snapshot: z.infer<typeof SnapshotBaseSchema>): boolean {
  if (snapshot.sources.length !== 1 || snapshot.sources[0] !== "ethereum_rpc" || snapshot.source_status.length !== 1) return false;
  const status = snapshot.source_status[0]!;
  const staleGaps = snapshot.gaps.filter((gap) => gap.code === "source_stale").length;
  return status.source === "ethereum_rpc" && status.role === "sky_chainlog_finalized_adapter_custody_evidence"
    && (status.stale ? staleGaps === 1 : staleGaps === 0);
}

export const SkyEthCollateralCustodySnapshotSchema = SnapshotBaseSchema.superRefine((snapshot, context) => {
  try {
    if (snapshot.status === "unavailable") {
      const failure = snapshot.gaps.length === 1 && SourceFailureGapCodes.has(snapshot.gaps[0]!.code);
      const noEvidence = snapshot.verified_block === null && snapshot.resolved_contracts === null && snapshot.ilks.length === 0 && snapshot.buckets.length === 0
        && snapshot.quote_inputs === null && snapshot.identities === null && snapshot.metrics.sky_eth_family_adapter_custody_eth_wei === null && !snapshot.coverage.fixed_ilk_universe_complete;
      const noRpc = snapshot.gaps[0]?.code === "rpc_not_configured";
      const provenance = noRpc
        ? snapshot.sources.length === 0 && snapshot.source_status.length === 0
        : snapshot.sources.length === 1 && snapshot.source_status.length === 1 && !snapshot.source_status[0]!.stale;
      if (!failure || !noEvidence || snapshot.capabilities.ethereum_rpc_active || !provenance) add(context, "unavailable snapshot contains partial or incoherent evidence");
      return;
    }

    if (snapshot.verified_block === null || snapshot.resolved_contracts === null || snapshot.quote_inputs === null || snapshot.identities === null
      || snapshot.metrics.sky_eth_family_adapter_custody_eth_wei === null || !snapshot.coverage.fixed_ilk_universe_complete
      || !snapshot.capabilities.ethereum_rpc_active || !verifiedProvenance(snapshot)) {
      add(context, "verified snapshot is incomplete or has incoherent provenance");
      return;
    }
    const permanentExact = PermanentGapCodes.every((code) => snapshot.gaps.filter((gap) => gap.code === code).length === 1)
      && snapshot.gaps.every((gap) => (PermanentGapCodes as readonly string[]).includes(gap.code) || gap.code === "source_stale");
    if (!permanentExact) add(context, "verified snapshot must contain exactly the five permanent gaps");

    if (snapshot.ilks.length !== SKY_ETH_CUSTODY_ILKS.length || snapshot.buckets.length !== 3) {
      add(context, "fixed universe is incomplete");
      return;
    }
    const joins = new Set<string>();
    const raw = new Map<"WETH" | "wstETH" | "rETH", bigint>([["WETH", 0n], ["wstETH", 0n], ["rETH", 0n]]);
    for (let index = 0; index < SKY_ETH_CUSTODY_ILKS.length; index += 1) {
      const actual = snapshot.ilks[index]!;
      const expected = SKY_ETH_CUSTODY_ILKS[index]!;
      const amount = uint(actual.raw_custody);
      if (amount === null || actual.ilk !== expected.ilk || actual.asset !== expected.asset || actual.chainlog_key !== expected.chainlog_key
        || actual.expected_token.toLowerCase() !== expected.expected_token.toLowerCase() || actual.token.toLowerCase() !== expected.expected_token.toLowerCase()
        || actual.vat.toLowerCase() !== snapshot.resolved_contracts.vat.toLowerCase() || joins.has(actual.join.toLowerCase())) {
        add(context, "ilk evidence does not match the ordered resolved universe");
        return;
      }
      joins.add(actual.join.toLowerCase());
      raw.set(actual.asset, raw.get(actual.asset)! + amount);
    }
    const buckets = new Map(snapshot.buckets.map((bucket) => [bucket.asset, bucket]));
    if (buckets.size !== 3 || !["WETH", "wstETH", "rETH"].every((asset) => buckets.has(asset as "WETH"))) {
      add(context, "bucket universe is incomplete");
      return;
    }
    for (const asset of ["WETH", "wstETH", "rETH"] as const) {
      const bucket = buckets.get(asset)!;
      if (uint(bucket.raw_custody) !== raw.get(asset)) {
        add(context, "raw custody buckets do not reconcile");
        return;
      }
    }
    const weth = buckets.get("WETH")!;
    const wsteth = buckets.get("wstETH")!;
    const reth = buckets.get("rETH")!;
    if (weth.raw_custody !== weth.quoted_eth_wei || snapshot.quote_inputs.wsteth_raw !== wsteth.raw_custody || snapshot.quote_inputs.reth_raw !== reth.raw_custody) {
      add(context, "quote inputs do not match aggregate raw custody");
      return;
    }
    const quoted = [weth, wsteth, reth].map((bucket) => uint(bucket.quoted_eth_wei));
    const total = uint(snapshot.metrics.sky_eth_family_adapter_custody_eth_wei);
    if (quoted.some((value) => value === null) || total === null) {
      add(context, "quoted custody total does not reconcile");
      return;
    }
    const quotedTotal = (quoted as bigint[]).reduce((sum, value) => sum + value, 0n);
    if (quotedTotal !== total) add(context, "quoted custody total does not reconcile");
  } catch {
    add(context, "snapshot evidence could not be safely reconciled");
  }
});
export type SkyEthCollateralCustodySnapshot = z.infer<typeof SkyEthCollateralCustodySnapshotSchema>;

export interface SkyEthCustodyIlkEvidenceInput {
  ilk: string; asset: string; chainlog_key: string; expected_token: string; join: string; vat: string; token: string;
  decimals: number; live: number; rawCustody: bigint;
}
