import { z } from "zod";

const DecimalStringSchema = z.string().regex(/^(0|[1-9]\d*)$/);
const EthDecimalStringSchema = z.string().regex(/^(0|[1-9]\d*)(?:\.\d*[1-9])?$/);
const AddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const BlockHashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/);

function formatWeiAsEth(wei: bigint): string {
  const whole = wei / 1_000_000_000_000_000_000n;
  const fractionalWei = wei % 1_000_000_000_000_000_000n;
  if (fractionalWei === 0n) return whole.toString();
  return `${whole}.${fractionalWei.toString().padStart(18, "0").replace(/0+$/, "")}`;
}

export const ETH_COLLATERAL_ASSETS = [
  { symbol: "WETH", underlying: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" },
  { symbol: "wstETH", underlying: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0" },
  { symbol: "cbETH", underlying: "0xBe9895146f7AF43049ca1c1AE358B0541Ea49704" },
  { symbol: "rETH", underlying: "0xae78736Cd615f374D3085123A210448E74Fc6393" },
  { symbol: "weETH", underlying: "0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee" },
  { symbol: "osETH", underlying: "0xf1C9acDc66974dFB6dEcB12aA385b9cD01190E38" },
  { symbol: "ETHx", underlying: "0xA35b1B31Ce002FBF2058D22F30f95D405200A15b" },
  { symbol: "rsETH", underlying: "0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7" },
  { symbol: "tETH", underlying: "0xD11c452fc99cF405034ee446803b6F6c1F6d5ED8" },
  { symbol: "ezETH", underlying: "0xbf5495Efe5DB9ce00f80364C8B423567e58d2110" },
] as const;

export const ExactEthEquivalentSchema = z.object({
  wei_floor: DecimalStringSchema,
  eth_floor: EthDecimalStringSchema,
  remainder: DecimalStringSchema,
  denominator: DecimalStringSchema.refine((value) => value !== "0"),
}).strict().superRefine((value, context) => {
  if (BigInt(value.remainder) >= BigInt(value.denominator)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "remainder must be smaller than denominator" });
  }
  if (value.eth_floor !== formatWeiAsEth(BigInt(value.wei_floor))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "eth_floor must be derived from wei_floor" });
  }
});
export type ExactEthEquivalent = z.infer<typeof ExactEthEquivalentSchema>;

export const EthCollateralAssetEvidenceSchema = z.object({
  symbol: z.string().min(1),
  underlying: AddressSchema,
  decimals: z.literal(18),
  active: z.literal(true),
  collateral_enabled: z.boolean(),
  supplied_raw: DecimalStringSchema,
  oracle_price: DecimalStringSchema.refine((value) => value !== "0"),
  eth_equivalent: ExactEthEquivalentSchema,
}).strict();
export type EthCollateralAssetEvidence = z.infer<typeof EthCollateralAssetEvidenceSchema>;

export const EthCollateralBlockSchema = z.object({
  number: z.number().int().nonnegative(),
  hash: BlockHashSchema,
  timestamp: z.number().int().nonnegative(),
}).strict();
export type EthCollateralBlock = z.infer<typeof EthCollateralBlockSchema>;

const NullableExactEthEquivalentSchema = ExactEthEquivalentSchema.nullable();
export const EthCollateralMetricsSchema = z.object({
  eth_family_supplied: NullableExactEthEquivalentSchema,
  collateral_eligible_supplied: NullableExactEthEquivalentSchema,
  actual_user_collateral: z.null(),
  net_eth_locked: z.null(),
  gross_eth_collateral: z.null(),
  rehypothecation_ratio: z.null(),
}).strict();
export type EthCollateralMetrics = z.infer<typeof EthCollateralMetricsSchema>;

export const EthCollateralGapCodeSchema = z.enum([
  "rpc_not_configured",
  "rpc_access_gap",
  "rpc_chain_mismatch",
  "rpc_finality_gap",
  "rpc_schema_drift",
  "rpc_evidence_mismatch",
  "source_stale",
  "actual_user_collateral_not_indexed",
  "net_eth_locked_not_reconciled",
  "gross_collateral_not_reconciled",
  "rehypothecation_not_reconciled",
]);
export type EthCollateralGapCode = z.infer<typeof EthCollateralGapCodeSchema>;

export const EthCollateralGapSchema = z.object({
  code: EthCollateralGapCodeSchema,
  detail: z.string().min(1),
}).strict();
export type EthCollateralGap = z.infer<typeof EthCollateralGapSchema>;

export const EthCollateralSourceStatusSchema = z.object({
  source: z.string().min(1),
  role: z.string().min(1),
  stale: z.boolean(),
}).strict();
export type EthCollateralSourceStatus = z.infer<typeof EthCollateralSourceStatusSchema>;

export const EthCollateralCoverageSchema = z.object({
  aave_v3_ethereum_core_complete: z.boolean(),
  user_collateral_usage_complete: z.literal(false),
  net_eth_locked_complete: z.literal(false),
  gross_collateral_complete: z.literal(false),
  rehypothecation_complete: z.literal(false),
}).strict();

export const EthCollateralIdentitiesSchema = z.object({
  supplied_equals_asset_sum: z.literal(true),
  eligible_equals_enabled_asset_sum: z.literal(true),
}).strict();

const PermanentGapCodes = new Set<EthCollateralGapCode>([
  "actual_user_collateral_not_indexed",
  "net_eth_locked_not_reconciled",
  "gross_collateral_not_reconciled",
  "rehypothecation_not_reconciled",
]);
const SourceFailureGapCodes = new Set<EthCollateralGapCode>([
  "rpc_not_configured", "rpc_access_gap", "rpc_chain_mismatch", "rpc_finality_gap",
  "rpc_schema_drift", "rpc_evidence_mismatch", "source_stale",
]);
const ExpectedSymbols = new Set<string>(ETH_COLLATERAL_ASSETS.map((asset) => asset.symbol));
const ExpectedUnderlyingBySymbol = new Map<string, string>(ETH_COLLATERAL_ASSETS.map((asset) => [asset.symbol, asset.underlying.toLowerCase()]));

const EthCollateralDemandSnapshotBaseSchema = z.object({
  status: z.enum(["verified", "unavailable"]),
  summary: z.string().min(1),
  methodology: z.literal("eth-collateral-demand-aave-v3-v1"),
  verified_block: EthCollateralBlockSchema.nullable(),
  metrics: EthCollateralMetricsSchema,
  assets: z.array(EthCollateralAssetEvidenceSchema),
  identities: EthCollateralIdentitiesSchema.nullable(),
  coverage: EthCollateralCoverageSchema,
  sources: z.array(z.string().min(1)),
  source_status: z.array(EthCollateralSourceStatusSchema),
  gaps: z.array(EthCollateralGapSchema),
  capabilities: z.object({ ethereum_rpc_active: z.boolean() }).strict(),
}).strict();

export const EthCollateralDemandSnapshotSchema = EthCollateralDemandSnapshotBaseSchema.superRefine((snapshot, context) => {
  const hasPermanentGaps = [...PermanentGapCodes].every((code) => snapshot.gaps.some((gap) => gap.code === code));
  if (snapshot.status === "verified") {
    const symbols = snapshot.assets.map((asset) => asset.symbol);
    const exactCoverage = symbols.length === ETH_COLLATERAL_ASSETS.length
      && new Set(symbols).size === symbols.length
      && symbols.every((symbol) => ExpectedSymbols.has(symbol))
      && snapshot.assets.every((asset) => ExpectedUnderlyingBySymbol.get(asset.symbol) === asset.underlying.toLowerCase());
    if (!exactCoverage) context.addIssue({ code: z.ZodIssueCode.custom, message: "verified snapshot requires the fixed ten-asset set" });
    if (snapshot.verified_block === null || snapshot.identities === null) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "verified snapshot requires block and identities" });
    }
    if (snapshot.metrics.eth_family_supplied === null || snapshot.metrics.collateral_eligible_supplied === null) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "verified snapshot requires aggregate values" });
    }
    if (!snapshot.coverage.aave_v3_ethereum_core_complete || !snapshot.capabilities.ethereum_rpc_active || !hasPermanentGaps) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "verified snapshot requires complete Aave coverage and permanent gaps" });
    }
    return;
  }

  const allObservedMetricsAbsent = snapshot.metrics.eth_family_supplied === null
    && snapshot.metrics.collateral_eligible_supplied === null;
  const hasSourceFailure = snapshot.gaps.some((gap) => SourceFailureGapCodes.has(gap.code));
  if (snapshot.verified_block !== null || snapshot.identities !== null || snapshot.assets.length !== 0
    || !allObservedMetricsAbsent || snapshot.coverage.aave_v3_ethereum_core_complete
    || snapshot.capabilities.ethereum_rpc_active || !hasSourceFailure) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "unavailable snapshot must contain no partial evidence and a source failure gap" });
  }
});
export type EthCollateralDemandSnapshot = z.infer<typeof EthCollateralDemandSnapshotSchema>;

export interface AaveReserveEvidenceInput {
  symbol: string;
  underlying: string;
  decimals: number;
  active: boolean;
  collateralEnabled: boolean;
  suppliedRaw: bigint;
  oraclePrice: bigint;
}
