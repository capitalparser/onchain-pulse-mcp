import { z } from "zod";
import { exactEthEquivalent, sumExactEthEquivalents } from "../eth_collateral_demand/metrics.js";
import { ExactEthEquivalentSchema, type ExactEthEquivalent } from "../eth_collateral_demand/types.js";

const DecimalStringSchema = z.string().max(78).regex(/^(0|[1-9]\d*)$/);
const AddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const BlockHashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/);

export const SPARK_COLLATERAL_ASSETS = [
  { symbol: "WETH", underlying: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" },
  { symbol: "wstETH", underlying: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0" },
  { symbol: "rETH", underlying: "0xae78736Cd615f374D3085123A210448E74Fc6393" },
  { symbol: "weETH", underlying: "0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee" },
  { symbol: "rsETH", underlying: "0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7" },
  { symbol: "ezETH", underlying: "0xbf5495Efe5DB9ce00f80364C8B423567e58d2110" },
] as const;

export const SparkCollateralAssetEvidenceSchema = z.object({
  symbol: z.string().min(1),
  underlying: AddressSchema,
  decimals: z.literal(18),
  active: z.literal(true),
  collateral_enabled: z.boolean(),
  supplied_raw: DecimalStringSchema,
  oracle_price: DecimalStringSchema.refine((value) => value !== "0"),
  eth_equivalent: ExactEthEquivalentSchema,
}).strict();
export type SparkCollateralAssetEvidence = z.infer<typeof SparkCollateralAssetEvidenceSchema>;

export const SparkCollateralBlockSchema = z.object({
  number: z.number().int().nonnegative(),
  hash: BlockHashSchema,
  timestamp: z.number().int().nonnegative(),
}).strict();
export type SparkCollateralBlock = z.infer<typeof SparkCollateralBlockSchema>;

export const SparkCollateralMetricsSchema = z.object({
  spark_eth_family_supplied: ExactEthEquivalentSchema.nullable(),
  spark_collateral_eligible_supplied: ExactEthEquivalentSchema.nullable(),
  combined_aave_spark_supplied: z.null(),
  actual_user_collateral: z.null(),
  net_eth_locked: z.null(),
  gross_eth_collateral: z.null(),
  rehypothecation_ratio: z.null(),
}).strict();
export type SparkCollateralMetrics = z.infer<typeof SparkCollateralMetricsSchema>;

export const SparkCollateralGapCodeSchema = z.enum([
  "rpc_not_configured",
  "rpc_access_gap",
  "rpc_chain_mismatch",
  "rpc_finality_gap",
  "rpc_schema_drift",
  "rpc_evidence_mismatch",
  "source_stale",
  "aave_spark_overlap_not_reconciled",
  "actual_user_collateral_not_indexed",
  "net_eth_locked_not_reconciled",
  "gross_collateral_not_reconciled",
  "rehypothecation_not_reconciled",
]);
export type SparkCollateralGapCode = z.infer<typeof SparkCollateralGapCodeSchema>;

export const SparkCollateralGapSchema = z.object({ code: SparkCollateralGapCodeSchema, detail: z.string().min(1) }).strict();
export type SparkCollateralGap = z.infer<typeof SparkCollateralGapSchema>;

export const SparkCollateralSourceStatusSchema = z.object({
  source: z.string().min(1),
  role: z.string().min(1),
  stale: z.boolean(),
}).strict();
export type SparkCollateralSourceStatus = z.infer<typeof SparkCollateralSourceStatusSchema>;

export const SparkCollateralCoverageSchema = z.object({
  spark_lend_ethereum_complete: z.boolean(),
  aave_spark_overlap_reconciled: z.literal(false),
  user_collateral_usage_complete: z.literal(false),
  net_eth_locked_complete: z.literal(false),
  gross_collateral_complete: z.literal(false),
  rehypothecation_complete: z.literal(false),
}).strict();

export const SparkCollateralIdentitiesSchema = z.object({
  supplied_equals_asset_sum: z.literal(true),
  eligible_equals_enabled_asset_sum: z.literal(true),
}).strict();

const PermanentGapCodes = new Set<SparkCollateralGapCode>([
  "aave_spark_overlap_not_reconciled",
  "actual_user_collateral_not_indexed",
  "net_eth_locked_not_reconciled",
  "gross_collateral_not_reconciled",
  "rehypothecation_not_reconciled",
]);
const SourceFailureGapCodes = new Set<SparkCollateralGapCode>([
  "rpc_not_configured", "rpc_access_gap", "rpc_chain_mismatch", "rpc_finality_gap", "rpc_schema_drift", "rpc_evidence_mismatch",
]);
const ExpectedUnderlyingBySymbol = new Map<string, string>(SPARK_COLLATERAL_ASSETS.map((asset) => [asset.symbol, asset.underlying.toLowerCase()]));

function exactEqual(left: ExactEthEquivalent, right: ExactEthEquivalent): boolean {
  return left.wei_floor === right.wei_floor && left.eth_floor === right.eth_floor
    && left.remainder === right.remainder && left.denominator === right.denominator;
}

const SparkCollateralCapacitySnapshotBaseSchema = z.object({
  status: z.enum(["verified", "unavailable"]),
  summary: z.string().min(1),
  methodology: z.literal("spark-eth-collateral-capacity-v1"),
  verified_block: SparkCollateralBlockSchema.nullable(),
  metrics: SparkCollateralMetricsSchema,
  assets: z.array(SparkCollateralAssetEvidenceSchema),
  identities: SparkCollateralIdentitiesSchema.nullable(),
  coverage: SparkCollateralCoverageSchema,
  sources: z.array(z.string().min(1)),
  source_status: z.array(SparkCollateralSourceStatusSchema),
  gaps: z.array(SparkCollateralGapSchema),
  capabilities: z.object({ ethereum_rpc_active: z.boolean() }).strict(),
}).strict();

export const SparkCollateralCapacitySnapshotSchema = SparkCollateralCapacitySnapshotBaseSchema.superRefine((snapshot, context) => {
  const permanentGapsPresent = [...PermanentGapCodes].every((code) => snapshot.gaps.some((gap) => gap.code === code));
  if (snapshot.status === "verified") {
    const symbols = snapshot.assets.map((asset) => asset.symbol);
    const exactCoverage = symbols.length === SPARK_COLLATERAL_ASSETS.length && new Set(symbols).size === symbols.length
      && snapshot.assets.every((asset) => ExpectedUnderlyingBySymbol.get(asset.symbol) === asset.underlying.toLowerCase());
    const supplied = snapshot.metrics.spark_eth_family_supplied;
    const eligible = snapshot.metrics.spark_collateral_eligible_supplied;
    if (!exactCoverage || snapshot.verified_block === null || snapshot.identities === null || supplied === null || eligible === null
      || !snapshot.coverage.spark_lend_ethereum_complete || !snapshot.capabilities.ethereum_rpc_active || !permanentGapsPresent) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "verified Spark snapshot is incomplete" });
      return;
    }
    const sources = new Set(snapshot.sources);
    const statuses = new Set(snapshot.source_status.map((status) => status.source));
    const staleGaps = snapshot.gaps.filter((gap) => gap.code === "source_stale");
    const sourceFailures = snapshot.gaps.filter((gap) => !PermanentGapCodes.has(gap.code) && gap.code !== "source_stale");
    const allStale = snapshot.source_status.every((status) => status.stale);
    const allFresh = snapshot.source_status.every((status) => !status.stale);
    if (sources.size !== snapshot.sources.length || statuses.size !== snapshot.source_status.length || sources.size === 0
      || sources.size !== statuses.size || ![...sources].every((source) => statuses.has(source)) || sourceFailures.length > 0
      || staleGaps.length > 1 || (staleGaps.length === 1 && !allStale) || (staleGaps.length === 0 && !allFresh)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "verified Spark snapshot has inconsistent provenance" });
    }
    const weth = snapshot.assets.find((asset) => asset.symbol === "WETH");
    if (weth !== undefined) {
      try {
        const expectedAssets = snapshot.assets.map((asset) => exactEthEquivalent(
          BigInt(asset.supplied_raw), BigInt(asset.oracle_price), BigInt(weth.oracle_price),
        ));
        const expectedSupplied = sumExactEthEquivalents(expectedAssets);
        const expectedEligible = sumExactEthEquivalents(expectedAssets.filter((_, index) => snapshot.assets[index]!.collateral_enabled));
        if (!snapshot.assets.every((asset, index) => exactEqual(asset.eth_equivalent, expectedAssets[index]!))
          || !exactEqual(supplied, expectedSupplied) || !exactEqual(eligible, expectedEligible)) {
          context.addIssue({ code: z.ZodIssueCode.custom, message: "Spark exact identities do not reconcile" });
        }
      } catch {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Spark exact evidence is malformed" });
      }
    }
    return;
  }
  const metricsAbsent = snapshot.metrics.spark_eth_family_supplied === null && snapshot.metrics.spark_collateral_eligible_supplied === null;
  const sourceFailure = snapshot.gaps.some((gap) => SourceFailureGapCodes.has(gap.code));
  if (snapshot.verified_block !== null || snapshot.identities !== null || snapshot.assets.length !== 0 || !metricsAbsent
    || snapshot.coverage.spark_lend_ethereum_complete || snapshot.capabilities.ethereum_rpc_active || !sourceFailure) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "unavailable Spark snapshot contains partial evidence" });
  }
});
export type SparkCollateralCapacitySnapshot = z.infer<typeof SparkCollateralCapacitySnapshotSchema>;

export interface SparkReserveEvidenceInput {
  symbol: string;
  underlying: string;
  decimals: number;
  active: boolean;
  collateralEnabled: boolean;
  suppliedRaw: bigint;
  oraclePrice: bigint;
}
