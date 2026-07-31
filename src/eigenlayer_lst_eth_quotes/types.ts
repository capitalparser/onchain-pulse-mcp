import { z } from "zod";
import {
  EigenLayerRestakingBlockSchema,
  type EigenLayerRestakingBlock,
} from "../eigenlayer_eth_restaking/types.js";

export const EIGENLAYER_COVERED_LST_STRATEGIES = [
  {
    label: "stETH",
    strategy: "0x93c4b944D05dfe6df7645A86cd2206016c51564D",
    underlying_token: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
    decimals: 18,
  },
  {
    label: "rETH",
    strategy: "0x1BeE69b7dFFfA4E2d53C2a2Df135C388AD25dCD2",
    underlying_token: "0xae78736Cd615f374D3085123A210448E74Fc6393",
    decimals: 18,
  },
  {
    label: "cbETH",
    strategy: "0x54945180dB7943c0ed0FEE7EdaB2Bd24620256bc",
    underlying_token: "0xBe9895146f7AF43049ca1c1AE358B0541Ea49704",
    decimals: 18,
  },
  {
    label: "ETHx",
    strategy: "0x9d7eD45EE2E8FC5482fa2428f15C971e6369011d",
    underlying_token: "0xA35b1B31Ce002FBF2058D22F30f95D405200A15b",
    decimals: 18,
  },
  {
    label: "osETH",
    strategy: "0x57ba429517c3473B6d34CA9aCd56c0e735b94c02",
    underlying_token: "0xf1C9acDc66974dFB6dEcB12aA385b9cD01190E38",
    decimals: 18,
  },
  {
    label: "lsETH",
    strategy: "0xAe60d8180437b5C34bB956822ac2710972584473",
    underlying_token: "0x8c1BEd5b9a0928467c9B1341Da1D7BD5e10b6549",
    decimals: 18,
  },
  {
    label: "mETH",
    strategy: "0x298aFB19A105D59E74658C4C334Ff360BadE6dd2",
    underlying_token: "0xd5F7838F5C461fefF7FE49ea5ebaF7728bB0ADfa",
    decimals: 18,
  },
] as const;

export const EIGENLAYER_UNQUOTED_LST_STRATEGY_LABELS = [
  "ankrETH",
  "oETH",
  "swETH",
  "wBETH",
  "sfrxETH",
] as const;

export const EIGENLAYER_LST_ETH_QUOTES_PERMANENT_GAP_CODES = [
  "lst_quote_coverage_partial",
  "native_restaked_eth_not_measured",
  "lst_restaked_eth_equivalent_not_measured",
  "eigenlayer_eth_family_exposure_not_measured",
  "unique_net_eth_locked_not_reconciled",
  "combined_aave_spark_lido_sky_eigenlayer_demand_not_reconciled",
  "rehypothecation_ratio_not_measured",
  "executable_withdrawal_capacity_not_measured",
  "cbeth_exchange_rate_freshness_not_verified",
  "oseth_virtual_rewards_freshness_not_verified",
  "oseth_backing_not_reconciled",
  "meth_oracle_record_freshness_not_verified",
  "meth_backing_not_reconciled",
  "lseth_oracle_report_freshness_not_verified",
  "lseth_proxy_upgradeability_not_verified",
  "lseth_backing_not_reconciled",
  "ethx_oracle_report_freshness_not_verified",
  "ethx_proxy_upgradeability_not_verified",
  "ethx_backing_not_reconciled",
] as const;

const SOURCE_FAILURE_GAP_CODES = new Set([
  "rpc_not_configured",
  "rpc_access_gap",
  "rpc_chain_mismatch",
  "rpc_finality_gap",
  "rpc_schema_drift",
  "rpc_evidence_mismatch",
]);
const UINT256_MAX = (2n ** 256n) - 1n;
const WAD = 10n ** 18n;

const DecimalStringSchema = z.string().max(78).regex(/^(0|[1-9]\d*)$/).refine((value) => {
  try {
    return BigInt(value) <= UINT256_MAX;
  } catch {
    return false;
  }
}, "must be a uint256");

const QuoteSchema = z.object({
  label: z.enum(["stETH", "rETH", "cbETH", "ETHx", "osETH", "lsETH", "mETH"]),
  strategy: z.string(),
  underlying_token: z.string(),
  decimals: z.literal(18),
  share_accounting_token_amount: DecimalStringSchema,
  token_custody_token_amount: DecimalStringSchema,
  quote_kind: z.enum([
    "steth_token_wei_identity_quote",
    "rocket_pool_direct_aggregate_quote",
    "coinbase_oracle_accounting_quote",
    "stader_direct_pool_accounting_quote",
    "stakewise_v3_direct_controller_quote",
    "liquid_collective_river_direct_share_quote",
    "mantle_staking_direct_oracle_quote",
  ]),
  trust_basis: z.enum([
    "lido_pooled_eth_accounting",
    "rocket_pool_network_accounting",
    "coinbase_oracle_controlled_rate",
    "stader_oracle_reported_accounting",
    "stakewise_v3_keeper_reward_accounting",
    "liquid_collective_oracle_reported_accounting",
    "mantle_oracle_reported_accounting",
  ]),
  share_accounting_eth_quote_wei: DecimalStringSchema,
  token_custody_eth_quote_wei: DecimalStringSchema,
  cbeth_exchange_rate_wei: DecimalStringSchema.nullable(),
}).strict();
export type EigenLayerCoveredLstQuote = z.infer<typeof QuoteSchema>;

const MetricsSchema = z.object({
  covered_share_accounting_eth_equivalent_wei: DecimalStringSchema.nullable(),
  covered_token_custody_eth_equivalent_wei: DecimalStringSchema.nullable(),
  lst_restaked_eth_equivalent_wei: z.null(),
  native_restaked_eth_wei: z.null(),
  eigenlayer_eth_family_exposure_eth_wei: z.null(),
  unique_net_eth_locked: z.null(),
  combined_aave_spark_lido_sky_eigenlayer_demand: z.null(),
  rehypothecation_ratio: z.null(),
  executable_withdrawal_capacity_eth_wei: z.null(),
}).strict();

const IdentitiesSchema = z.object({
  covered_strategy_order_verified: z.literal(true),
  covered_token_identities_verified: z.literal(true),
  covered_token_decimals_verified: z.literal(true),
  token_amounts_and_quotes_independent: z.literal(true),
  partial_aggregates_only: z.literal(true),
}).strict();

const CoverageSchema = z.object({
  quoted_strategy_count: z.literal(7),
  fixed_strategy_count: z.literal(12),
  unquoted_strategy_labels: z.tuple([
    z.literal("ankrETH"),
    z.literal("oETH"),
    z.literal("swETH"),
    z.literal("wBETH"),
    z.literal("sfrxETH"),
  ]),
}).strict();

const ReportContextSchema = z.object({
  lseth_last_completed_epoch_id: DecimalStringSchema,
  ethx_oracle_reporting_block_number: DecimalStringSchema,
}).strict();

export const EigenLayerLstEthQuoteGapCodeSchema = z.enum([
  ...EIGENLAYER_LST_ETH_QUOTES_PERMANENT_GAP_CODES,
  "rpc_not_configured",
  "rpc_access_gap",
  "rpc_chain_mismatch",
  "rpc_finality_gap",
  "rpc_schema_drift",
  "rpc_evidence_mismatch",
  "source_stale",
]);
export type EigenLayerLstEthQuoteGapCode = z.infer<typeof EigenLayerLstEthQuoteGapCodeSchema>;
export const EigenLayerLstEthQuoteGapSchema = z.object({
  code: EigenLayerLstEthQuoteGapCodeSchema,
  detail: z.string().min(1).max(240),
}).strict();
export type EigenLayerLstEthQuoteGap = z.infer<typeof EigenLayerLstEthQuoteGapSchema>;

export const EigenLayerLstEthQuoteSourceStatusSchema = z.object({
  source: z.literal("ethereum_rpc"),
  role: z.literal("eigenlayer_finalized_lst_eth_quote_evidence"),
  stale: z.boolean(),
}).strict();
export type EigenLayerLstEthQuoteSourceStatus = z.infer<typeof EigenLayerLstEthQuoteSourceStatusSchema>;

const SnapshotBaseSchema = z.object({
  status: z.enum(["verified", "unavailable"]),
  summary: z.string().min(1).max(500),
  methodology: z.literal("eigenlayer-covered-lst-eth-quotes-v4"),
  verified_block: EigenLayerRestakingBlockSchema.nullable(),
  covered_quotes: z.array(QuoteSchema),
  report_context: ReportContextSchema.nullable(),
  metrics: MetricsSchema,
  identities: IdentitiesSchema.nullable(),
  coverage: CoverageSchema.nullable(),
  sources: z.array(z.literal("ethereum_rpc")),
  source_status: z.array(EigenLayerLstEthQuoteSourceStatusSchema),
  gaps: z.array(EigenLayerLstEthQuoteGapSchema),
  capabilities: z.object({ ethereum_rpc_active: z.boolean() }).strict(),
}).strict();

function add(context: z.RefinementCtx, message: string): void {
  context.addIssue({ code: z.ZodIssueCode.custom, message });
}

function uint(value: string): bigint {
  return BigInt(value);
}

export const EigenLayerLstEthQuotesSnapshotSchema = SnapshotBaseSchema.superRefine((snapshot, context) => {
  try {
    if (snapshot.status === "unavailable") {
      const sourceFailure = snapshot.gaps.length === 1 && SOURCE_FAILURE_GAP_CODES.has(snapshot.gaps[0]!.code);
      const noEvidence = snapshot.verified_block === null && snapshot.covered_quotes.length === 0
        && snapshot.metrics.covered_share_accounting_eth_equivalent_wei === null
        && snapshot.metrics.covered_token_custody_eth_equivalent_wei === null
        && snapshot.report_context === null && snapshot.identities === null && snapshot.coverage === null;
      const noRpc = snapshot.gaps[0]?.code === "rpc_not_configured";
      const provenance = noRpc
        ? snapshot.sources.length === 0 && snapshot.source_status.length === 0
        : snapshot.sources.length === 1 && snapshot.source_status.length === 1 && !snapshot.source_status[0]!.stale;
      if (!sourceFailure || !noEvidence || snapshot.capabilities.ethereum_rpc_active || !provenance) {
        add(context, "unavailable quote snapshot contains partial or incoherent evidence");
      }
      return;
    }

    const staleGaps = snapshot.gaps.filter((gap) => gap.code === "source_stale").length;
    const provenance = snapshot.sources.length === 1 && snapshot.source_status.length === 1
      && snapshot.source_status[0]!.stale === (staleGaps === 1);
    const permanentGaps = EIGENLAYER_LST_ETH_QUOTES_PERMANENT_GAP_CODES.every(
      (code) => snapshot.gaps.filter((gap) => gap.code === code).length === 1,
    ) && snapshot.gaps.every(
      (gap) => (EIGENLAYER_LST_ETH_QUOTES_PERMANENT_GAP_CODES as readonly string[]).includes(gap.code)
        || gap.code === "source_stale",
    ) && staleGaps <= 1;
    if (snapshot.verified_block === null || snapshot.report_context === null || snapshot.identities === null || snapshot.coverage === null
      || snapshot.metrics.covered_share_accounting_eth_equivalent_wei === null
      || snapshot.metrics.covered_token_custody_eth_equivalent_wei === null
      || !snapshot.capabilities.ethereum_rpc_active || !provenance || !permanentGaps
      || snapshot.covered_quotes.length !== EIGENLAYER_COVERED_LST_STRATEGIES.length) {
      add(context, "verified quote snapshot is incomplete or has incoherent provenance");
      return;
    }

    let shareSum = 0n;
    let custodySum = 0n;
    for (let index = 0; index < EIGENLAYER_COVERED_LST_STRATEGIES.length; index += 1) {
      const expected = EIGENLAYER_COVERED_LST_STRATEGIES[index]!;
      const quote = snapshot.covered_quotes[index]!;
      const shareAmount = uint(quote.share_accounting_token_amount);
      const custodyAmount = uint(quote.token_custody_token_amount);
      const shareQuote = uint(quote.share_accounting_eth_quote_wei);
      const custodyQuote = uint(quote.token_custody_eth_quote_wei);
      if (quote.label !== expected.label || quote.strategy !== expected.strategy
        || quote.underlying_token !== expected.underlying_token || quote.decimals !== 18) {
        add(context, "covered evidence does not match the exact ordered strategy-token universe");
        return;
      }
      if (index === 0 && (quote.quote_kind !== "steth_token_wei_identity_quote"
        || quote.trust_basis !== "lido_pooled_eth_accounting" || quote.cbeth_exchange_rate_wei !== null
        || shareQuote !== shareAmount || custodyQuote !== custodyAmount)) {
        add(context, "stETH token wei must use the identity quote");
        return;
      }
      if (index === 1 && (quote.quote_kind !== "rocket_pool_direct_aggregate_quote"
        || quote.trust_basis !== "rocket_pool_network_accounting" || quote.cbeth_exchange_rate_wei !== null)) {
        add(context, "rETH must preserve two direct aggregate quote results");
        return;
      }
      if (index === 2) {
        const rate = quote.cbeth_exchange_rate_wei === null ? 0n : uint(quote.cbeth_exchange_rate_wei);
        const shareProduct = shareAmount * rate;
        const custodyProduct = custodyAmount * rate;
        if (quote.quote_kind !== "coinbase_oracle_accounting_quote"
          || quote.trust_basis !== "coinbase_oracle_controlled_rate" || rate === 0n
          || shareProduct > UINT256_MAX || custodyProduct > UINT256_MAX
          || shareQuote !== shareProduct / WAD || custodyQuote !== custodyProduct / WAD) {
          add(context, "cbETH quotes must be exact floor conversions from one nonzero oracle rate");
          return;
        }
      }
      if (index === 3 && (quote.quote_kind !== "stader_direct_pool_accounting_quote"
        || quote.trust_basis !== "stader_oracle_reported_accounting"
        || quote.cbeth_exchange_rate_wei !== null)) {
        add(context, "ETHx must preserve two direct pool-accounting quote results");
        return;
      }
      if (index === 4 && (quote.quote_kind !== "stakewise_v3_direct_controller_quote"
        || quote.trust_basis !== "stakewise_v3_keeper_reward_accounting"
        || quote.cbeth_exchange_rate_wei !== null)) {
        add(context, "osETH must preserve two direct controller quote results");
        return;
      }
      if (index === 5 && (quote.quote_kind !== "liquid_collective_river_direct_share_quote"
        || quote.trust_basis !== "liquid_collective_oracle_reported_accounting"
        || quote.cbeth_exchange_rate_wei !== null)) {
        add(context, "lsETH must preserve two direct River share-accounting quote results");
        return;
      }
      if (index === 6 && (quote.quote_kind !== "mantle_staking_direct_oracle_quote"
        || quote.trust_basis !== "mantle_oracle_reported_accounting"
        || quote.cbeth_exchange_rate_wei !== null)) {
        add(context, "mETH must preserve two direct oracle quote results");
        return;
      }
      shareSum += shareQuote;
      custodySum += custodyQuote;
      if (shareSum > UINT256_MAX || custodySum > UINT256_MAX) {
        add(context, "covered partial sum exceeds uint256");
        return;
      }
    }
    if (uint(snapshot.metrics.covered_share_accounting_eth_equivalent_wei) !== shareSum
      || uint(snapshot.metrics.covered_token_custody_eth_equivalent_wei) !== custodySum) {
      add(context, "covered partial sums do not match the ordered quotes");
    }
    if (uint(snapshot.report_context.ethx_oracle_reporting_block_number) > BigInt(snapshot.verified_block.number)) {
      add(context, "ETHx oracle reporting block cannot be after the verified block");
    }
  } catch {
    add(context, "quote evidence could not be safely reconciled");
  }
});
export type EigenLayerLstEthQuotesSnapshot = z.infer<typeof EigenLayerLstEthQuotesSnapshotSchema>;

export interface EigenLayerCoveredLstQuoteInput {
  label: string;
  strategy: string;
  underlyingToken: string;
  decimals: number;
  shareAccountingTokenAmount: bigint;
  tokenCustodyTokenAmount: bigint;
  directShareAccountingEthQuote?: bigint;
  directTokenCustodyEthQuote?: bigint;
  cbethExchangeRate?: bigint | null;
}

export interface BuildVerifiedEigenLayerLstEthQuotesInput {
  block: EigenLayerRestakingBlock;
  quotes: readonly EigenLayerCoveredLstQuoteInput[];
  lsethLastCompletedEpochId: bigint;
  ethxOracleReportingBlockNumber: bigint;
  sources: string[];
  sourceStatus: EigenLayerLstEthQuoteSourceStatus[];
  stale?: boolean;
}
