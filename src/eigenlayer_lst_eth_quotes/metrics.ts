import {
  EIGENLAYER_COVERED_LST_STRATEGIES,
  EIGENLAYER_LST_ETH_QUOTES_PERMANENT_GAP_CODES,
  EIGENLAYER_UNQUOTED_LST_STRATEGY_BLOCKERS,
  EIGENLAYER_UNQUOTED_LST_STRATEGY_LABELS,
  EigenLayerLstEthQuotesSnapshotSchema,
  type BuildVerifiedEigenLayerLstEthQuotesInput,
  type EigenLayerCoveredLstQuote,
  type EigenLayerCoveredLstQuoteInput,
  type EigenLayerLstEthQuoteGap,
  type EigenLayerLstEthQuoteSourceStatus,
  type EigenLayerLstEthQuotesSnapshot,
} from "./types.js";

const UINT256_MAX = (2n ** 256n) - 1n;
const WAD = 10n ** 18n;
const UNQUOTED_BLOCKER_GAP_DETAILS = Object.fromEntries(
  EIGENLAYER_UNQUOTED_LST_STRATEGY_BLOCKERS.map((blocker) => [blocker.code, blocker.detail]),
) as Record<(typeof EIGENLAYER_UNQUOTED_LST_STRATEGY_BLOCKERS)[number]["code"], string>;

const PERMANENT_GAP_DETAILS: Record<(typeof EIGENLAYER_LST_ETH_QUOTES_PERMANENT_GAP_CODES)[number], string> = {
  lst_quote_coverage_partial: "Only nine of the twelve fixed legacy EigenLayer LST strategies have bounded ETH accounting quotes.",
  native_restaked_eth_not_measured: "No native-restaked ETH total is measured.",
  lst_restaked_eth_equivalent_not_measured: "Nine covered quotes do not establish a full EigenLayer LST ETH-equivalent total.",
  eigenlayer_eth_family_exposure_not_measured: "Native and full LST evidence are not combined into an ETH-family total.",
  unique_net_eth_locked_not_reconciled: "Issuer backing and downstream reuse are not deduplicated or netted.",
  combined_aave_spark_lido_sky_eigenlayer_demand_not_reconciled: "No cross-protocol demand total is reconciled.",
  rehypothecation_ratio_not_measured: "This bounded partial quote snapshot cannot measure rehypothecation.",
  executable_withdrawal_capacity_not_measured: "Accounting quotes are not executable redemption or withdrawal capacity.",
  cbeth_exchange_rate_freshness_not_verified: "The bounded cbETH exchangeRate call exposes no timestamp for independent freshness verification.",
  oseth_virtual_rewards_freshness_not_verified: "StakeWise controller accounting does not independently verify keeper-set virtual reward freshness.",
  oseth_backing_not_reconciled: "StakeWise controller accounting is not an independent backing reconciliation.",
  meth_oracle_record_freshness_not_verified: "Mantle Oracle accounting does not independently verify report-record freshness.",
  meth_backing_not_reconciled: "Mantle Oracle accounting is not an independent backing reconciliation.",
  lseth_oracle_report_freshness_not_verified: "Liquid Collective's last completed epoch is report context, not an independently verified freshness proof.",
  lseth_proxy_upgradeability_not_verified: "The bounded River proxy call does not independently verify current implementation-source correspondence.",
  lseth_backing_not_reconciled: "Liquid Collective River accounting is not an independent backing reconciliation.",
  ethx_oracle_report_freshness_not_verified: "Stader's oracle reporting block is context, not an independently verified freshness proof.",
  ethx_proxy_upgradeability_not_verified: "The bounded ETHx proxy calls do not independently verify current implementation-source correspondence.",
  ethx_backing_not_reconciled: "Stader pool accounting is not an independent backing reconciliation.",
  oeth_rebase_freshness_not_verified: "Origin's last rebase timestamp is context, not an independently verified freshness proof.",
  oeth_proxy_upgradeability_not_verified: "The bounded OETH proxy calls do not independently verify current implementation-source correspondence.",
  oeth_backing_not_reconciled: "OETH nominal unit accounting is not an independent backing or ETH spot-value reconciliation.",
  oeth_async_withdrawal_liquidity_not_verified: "OETH withdrawal delay context does not prove async withdrawal, immediate redemption, or executable liquidity.",
  sweth_reprice_freshness_not_verified: "Swell's last reprice timestamp is context, not an independently verified freshness proof.",
  sweth_proxy_upgradeability_not_verified: "The bounded swETH proxy call does not independently verify current implementation-source correspondence.",
  sweth_backing_not_reconciled: "Swell reprice accounting is not an independent backing reconciliation.",
  ...UNQUOTED_BLOCKER_GAP_DETAILS,
};
const PERMANENT_GAPS: readonly EigenLayerLstEthQuoteGap[] = EIGENLAYER_LST_ETH_QUOTES_PERMANENT_GAP_CODES.map(
  (code) => ({ code, detail: PERMANENT_GAP_DETAILS[code] }),
);

export class EigenLayerLstEthQuotesDomainError extends Error {
  constructor(public readonly kind: "schema_drift" | "evidence_mismatch", message: string) {
    super(message);
    this.name = "EigenLayerLstEthQuotesDomainError";
  }
}

function fail(kind: EigenLayerLstEthQuotesDomainError["kind"], message: string): never {
  throw new EigenLayerLstEthQuotesDomainError(kind, message);
}

function uint(value: bigint | undefined | null, field: string): bigint {
  if (typeof value !== "bigint" || value < 0n || value > UINT256_MAX) {
    fail("evidence_mismatch", `${field} must be a uint256.`);
  }
  return value;
}

function checkedProduct(left: bigint, right: bigint, field: string): bigint {
  const product = left * right;
  if (product > UINT256_MAX) fail("evidence_mismatch", `${field} product exceeds uint256.`);
  return product;
}

function fullPrecisionFloorWad(amount: bigint, rate: bigint, field: string): bigint {
  const quotient = (amount * rate) / WAD;
  if (quotient > UINT256_MAX) fail("evidence_mismatch", `${field} quotient exceeds uint256.`);
  return quotient;
}

function checkedAdd(left: bigint, right: bigint, field: string): bigint {
  const sum = left + right;
  if (sum > UINT256_MAX) fail("evidence_mismatch", `${field} sum exceeds uint256.`);
  return sum;
}

function validateFixedQuote(input: EigenLayerCoveredLstQuoteInput, index: number): {
  shareAmount: bigint;
  custodyAmount: bigint;
} {
  const expected = EIGENLAYER_COVERED_LST_STRATEGIES[index]!;
  if (input.label !== expected.label || input.strategy !== expected.strategy
    || input.underlyingToken !== expected.underlying_token || input.decimals !== 18) {
    fail("evidence_mismatch", "Covered quote evidence does not match the exact ordered strategy-token universe.");
  }
  return {
    shareAmount: uint(input.shareAccountingTokenAmount, "Share-accounting token amount"),
    custodyAmount: uint(input.tokenCustodyTokenAmount, "Token custody amount"),
  };
}

function normalizeQuote(input: EigenLayerCoveredLstQuoteInput, index: number): EigenLayerCoveredLstQuote {
  const expected = EIGENLAYER_COVERED_LST_STRATEGIES[index]!;
  const { shareAmount, custodyAmount } = validateFixedQuote(input, index);
  let shareQuote: bigint;
  let custodyQuote: bigint;
  let quoteKind: EigenLayerCoveredLstQuote["quote_kind"];
  let trustBasis: EigenLayerCoveredLstQuote["trust_basis"];
  let cbethRate: bigint | null = null;
  let swethRate: bigint | null = null;

  if (expected.label === "stETH") {
    if (input.directShareAccountingEthQuote !== undefined || input.directTokenCustodyEthQuote !== undefined
      || (input.cbethExchangeRate !== undefined && input.cbethExchangeRate !== null)
      || (input.swethToEthRate !== undefined && input.swethToEthRate !== null)) {
      fail("evidence_mismatch", "stETH accepts token amounts only and uses identity quotes.");
    }
    shareQuote = shareAmount;
    custodyQuote = custodyAmount;
    quoteKind = "steth_token_wei_identity_quote";
    trustBasis = "lido_pooled_eth_accounting";
  } else if (expected.label === "oETH") {
    if (input.directShareAccountingEthQuote !== undefined || input.directTokenCustodyEthQuote !== undefined
      || (input.cbethExchangeRate !== undefined && input.cbethExchangeRate !== null)
      || (input.swethToEthRate !== undefined && input.swethToEthRate !== null)) {
      fail("evidence_mismatch", "oETH accepts token amounts only and preserves nominal unit accounting.");
    }
    shareQuote = shareAmount;
    custodyQuote = custodyAmount;
    quoteKind = "origin_oeth_vault_unit_identity_quote";
    trustBasis = "origin_vault_nominal_withdrawal_unit_accounting";
  } else if (expected.label === "rETH" || expected.label === "ETHx" || expected.label === "osETH" || expected.label === "lsETH" || expected.label === "mETH") {
    if ("rethExchangeRate" in input
      || "fabricatedConversionRate" in input
      || (input.cbethExchangeRate !== undefined && input.cbethExchangeRate !== null)
      || (input.swethToEthRate !== undefined && input.swethToEthRate !== null)) {
      fail("evidence_mismatch", `${expected.label} accepts direct aggregate quote results, not a rounded rate.`);
    }
    shareQuote = uint(input.directShareAccountingEthQuote, `Direct ${expected.label} share-accounting quote`);
    custodyQuote = uint(input.directTokenCustodyEthQuote, `Direct ${expected.label} custody quote`);
    if (expected.label === "rETH") {
      quoteKind = "rocket_pool_direct_aggregate_quote";
      trustBasis = "rocket_pool_network_accounting";
    } else if (expected.label === "ETHx") {
      quoteKind = "stader_direct_pool_accounting_quote";
      trustBasis = "stader_oracle_reported_accounting";
    } else if (expected.label === "osETH") {
      quoteKind = "stakewise_v3_direct_controller_quote";
      trustBasis = "stakewise_v3_keeper_reward_accounting";
    } else if (expected.label === "lsETH") {
      quoteKind = "liquid_collective_river_direct_share_quote";
      trustBasis = "liquid_collective_oracle_reported_accounting";
    } else {
      quoteKind = "mantle_staking_direct_oracle_quote";
      trustBasis = "mantle_oracle_reported_accounting";
    }
  } else if (expected.label === "swETH") {
    if (input.directShareAccountingEthQuote !== undefined || input.directTokenCustodyEthQuote !== undefined
      || (input.cbethExchangeRate !== undefined && input.cbethExchangeRate !== null)) {
      fail("evidence_mismatch", "swETH accepts one stored reprice rate and recomputes both floor quotes.");
    }
    swethRate = uint(input.swethToEthRate, "swETH to ETH rate");
    if (swethRate === 0n) fail("evidence_mismatch", "swETH to ETH rate must be nonzero.");
    shareQuote = fullPrecisionFloorWad(shareAmount, swethRate, "swETH share-accounting quote");
    custodyQuote = fullPrecisionFloorWad(custodyAmount, swethRate, "swETH custody quote");
    quoteKind = "swell_reprice_rate_floor_quote";
    trustBasis = "swell_reprice_role_controlled_rate";
  } else {
    if (input.directShareAccountingEthQuote !== undefined || input.directTokenCustodyEthQuote !== undefined) {
      fail("evidence_mismatch", "cbETH accepts one oracle exchange rate and recomputes both floor quotes.");
    }
    cbethRate = uint(input.cbethExchangeRate, "cbETH exchange rate");
    if (cbethRate === 0n) fail("evidence_mismatch", "cbETH exchange rate must be nonzero.");
    shareQuote = checkedProduct(shareAmount, cbethRate, "cbETH share-accounting quote") / WAD;
    custodyQuote = checkedProduct(custodyAmount, cbethRate, "cbETH custody quote") / WAD;
    quoteKind = "coinbase_oracle_accounting_quote";
    trustBasis = "coinbase_oracle_controlled_rate";
  }

  return {
    ...expected,
    share_accounting_token_amount: shareAmount.toString(),
    token_custody_token_amount: custodyAmount.toString(),
    quote_kind: quoteKind,
    trust_basis: trustBasis,
    share_accounting_eth_quote_wei: shareQuote.toString(),
    token_custody_eth_quote_wei: custodyQuote.toString(),
    cbeth_exchange_rate_wei: cbethRate?.toString() ?? null,
    sweth_to_eth_rate_wei: swethRate?.toString() ?? null,
  };
}

export function buildVerifiedEigenLayerLstEthQuotesSnapshot(
  input: BuildVerifiedEigenLayerLstEthQuotesInput,
): EigenLayerLstEthQuotesSnapshot {
  if (input.quotes.length !== EIGENLAYER_COVERED_LST_STRATEGIES.length) {
    fail("evidence_mismatch", "Exactly nine ordered covered quote inputs are required.");
  }
  const coveredQuotes = input.quotes.map(normalizeQuote);
  let shareSum = 0n;
  let custodySum = 0n;
  for (const quote of coveredQuotes) {
    shareSum = checkedAdd(shareSum, BigInt(quote.share_accounting_eth_quote_wei), "Covered share-accounting");
    custodySum = checkedAdd(custodySum, BigInt(quote.token_custody_eth_quote_wei), "Covered token custody");
  }
  const stale = input.stale === true;
  const snapshot = {
    status: "verified" as const,
    summary: "Finalized 9-of-12 ceiling: pinned evidence does not verify ankrETH immutable source/proxy/freshness or wBETH issuer-source/proxy/freshness; sfrxETH stops at frxETH, not ETH. ID119 remains final; no RPC calls added. Nominal OETH accounting is not backing, redeemability, or liquidity.",
    methodology: "eigenlayer-covered-lst-eth-quotes-v7" as const,
    verified_block: input.block,
    covered_quotes: coveredQuotes,
    report_context: {
      lseth_last_completed_epoch_id: uint(input.lsethLastCompletedEpochId, "lsETH last completed epoch").toString(),
      ethx_oracle_reporting_block_number: uint(input.ethxOracleReportingBlockNumber, "ETHx oracle reporting block").toString(),
      sweth_last_reprice_unix: uint(input.swethLastRepriceUnix, "swETH last reprice timestamp").toString(),
      oeth_last_rebase_unix: uint(input.oethLastRebaseUnix, "oETH last rebase timestamp").toString(),
      oeth_rebase_paused: input.oethRebasePaused,
      oeth_withdrawal_claim_delay_seconds: uint(input.oethWithdrawalClaimDelaySeconds, "oETH withdrawal claim delay").toString(),
    },
    metrics: {
      covered_share_accounting_eth_equivalent_wei: shareSum.toString(),
      covered_token_custody_eth_equivalent_wei: custodySum.toString(),
      lst_restaked_eth_equivalent_wei: null,
      native_restaked_eth_wei: null,
      eigenlayer_eth_family_exposure_eth_wei: null,
      unique_net_eth_locked: null,
      combined_aave_spark_lido_sky_eigenlayer_demand: null,
      rehypothecation_ratio: null,
      executable_withdrawal_capacity_eth_wei: null,
    },
    identities: {
      covered_strategy_order_verified: true as const,
      covered_token_identities_verified: true as const,
      covered_token_decimals_verified: true as const,
      token_amounts_and_quotes_independent: true as const,
      partial_aggregates_only: true as const,
    },
    coverage: {
      quoted_strategy_count: 9 as const,
      fixed_strategy_count: 12 as const,
      unquoted_strategy_labels: [...EIGENLAYER_UNQUOTED_LST_STRATEGY_LABELS] as const,
      unquoted_strategy_blockers: EIGENLAYER_UNQUOTED_LST_STRATEGY_BLOCKERS,
    },
    sources: input.sources,
    source_status: input.sourceStatus.map((status) => ({ ...status, stale })),
    gaps: stale
      ? [...PERMANENT_GAPS, { code: "source_stale" as const, detail: "Previously verified finalized quote evidence is stale." }]
      : [...PERMANENT_GAPS],
    capabilities: { ethereum_rpc_active: true },
  };
  const parsed = EigenLayerLstEthQuotesSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) fail("schema_drift", "Verified EigenLayer covered LST quote snapshot violates its public contract.");
  return parsed.data;
}

export function buildUnavailableEigenLayerLstEthQuotesSnapshot(input: {
  summary: string;
  gaps: EigenLayerLstEthQuoteGap[];
  sources?: string[];
  sourceStatus?: EigenLayerLstEthQuoteSourceStatus[];
}): EigenLayerLstEthQuotesSnapshot {
  const sourceFailures = [
    "rpc_not_configured",
    "rpc_access_gap",
    "rpc_chain_mismatch",
    "rpc_finality_gap",
    "rpc_schema_drift",
    "rpc_evidence_mismatch",
  ];
  if (input.gaps.length !== 1 || !sourceFailures.includes(input.gaps[0]!.code)) {
    fail("evidence_mismatch", "Unavailable quote evidence requires exactly one source failure gap.");
  }
  const snapshot = {
    status: "unavailable" as const,
    summary: input.summary,
    methodology: "eigenlayer-covered-lst-eth-quotes-v7" as const,
    verified_block: null,
    covered_quotes: [],
    report_context: null,
    metrics: {
      covered_share_accounting_eth_equivalent_wei: null,
      covered_token_custody_eth_equivalent_wei: null,
      lst_restaked_eth_equivalent_wei: null,
      native_restaked_eth_wei: null,
      eigenlayer_eth_family_exposure_eth_wei: null,
      unique_net_eth_locked: null,
      combined_aave_spark_lido_sky_eigenlayer_demand: null,
      rehypothecation_ratio: null,
      executable_withdrawal_capacity_eth_wei: null,
    },
    identities: null,
    coverage: null,
    sources: input.sources ?? [],
    source_status: input.sourceStatus ?? [],
    gaps: input.gaps,
    capabilities: { ethereum_rpc_active: false },
  };
  const parsed = EigenLayerLstEthQuotesSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) fail("schema_drift", "Unavailable EigenLayer covered LST quote snapshot violates its public contract.");
  return parsed.data;
}
