import { withCache, type AdapterContext } from "./base.js";
import type {
  RobinhoodCreditMetrics,
  RobinhoodPulseGap,
  RobinhoodSourceStatus,
} from "../robinhood_chain_pulse/types.js";
import { RobinhoodCreditMetricsSchema } from "../robinhood_chain_pulse/types.js";

export const MORPHO_GRAPHQL_URL = "https://api.morpho.org/graphql";
export const MORPHO_MARKET_PAGE_SIZE = 100;
export const MORPHO_MAX_MARKETS = 1_000;
export const MORPHO_HISTORY_BATCH_SIZE = 25;
export const MORPHO_MAX_HISTORY_MARKETS = 100;
export const MORPHO_BORROW_ROUNDING_ABSOLUTE_USD = 0.01;
export const MORPHO_BORROW_ROUNDING_RELATIVE = 1e-9;

const DAY_SECONDS = 86_400;
const MAX_HISTORY_POINTS_PER_SERIES = 64;
const MAX_HISTORY_DISTANCE_SECONDS = 48 * 60 * 60;

const CACHE_SPEC = {
  name: "robinhood_chain_morpho",
  ttlMs: 10 * 60_000,
  max: 8,
};

const MARKETS_QUERY = `
query RobinhoodChainMarkets($first: Int!, $skip: Int!) {
  markets(
    first: $first
    skip: $skip
    orderBy: SupplyAssetsUsd
    orderDirection: Desc
    where: { chainId_in: [4663], listed: true }
  ) {
    items {
      marketId
      loanAsset { address symbol }
      collateralAsset { address symbol }
      state {
        supplyAssetsUsd
        borrowAssetsUsd
        liquidityAssetsUsd
        collateralAssetsUsd
        utilization
      }
    }
    pageInfo {
      count
      countTotal
      limit
      skip
    }
  }
}`;

interface HistoryMetricPoint {
  timestamp: number;
  value: number;
}

interface MarketHistoryValues {
  currentSupply: number;
  baselineSupply: number;
  currentBorrow: number;
  baselineBorrow: number;
  currentUtilisation: number;
  baselineUtilisation: number;
}

interface MorphoHistoryResult {
  supplyChange7dPct: number | null;
  borrowChange7dPct: number | null;
  utilisationChange7d: number | null;
  marketCount: number;
  coveredMarketCount: number;
  sourceStatus: RobinhoodSourceStatus;
  sourceAvailable: boolean;
  gaps: RobinhoodPulseGap[];
}

export interface RobinhoodMorphoResult {
  status: "valid" | "partial" | "unavailable";
  metrics: RobinhoodCreditMetrics;
  sources: string[];
  sourceStatus: RobinhoodSourceStatus[];
  stale: boolean;
  staleData: string[];
  gaps: RobinhoodPulseGap[];
  confidence: number;
  asOf: string;
}

class RobinhoodMorphoRefreshError extends Error {
  constructor(readonly fallback: RobinhoodMorphoResult) {
    super("Robinhood Chain Morpho refresh failed");
  }
}

function failRefresh(fallback: RobinhoodMorphoResult): never {
  throw new RobinhoodMorphoRefreshError(fallback);
}

function emptyMetrics(): RobinhoodCreditMetrics {
  return RobinhoodCreditMetricsSchema.parse({
    listed_market_count: null,
    active_market_count: null,
    supply_usd: null,
    borrow_usd: null,
    liquidity_usd: null,
    collateral_usd: null,
    utilisation: null,
    high_utilisation_market_count: null,
    supply_change_7d_pct: null,
    borrow_change_7d_pct: null,
    utilisation_change_7d: null,
    history_market_count: null,
    history_covered_market_count: null,
    unique_borrowers_change_7d_pct: null,
    loan_asset_symbols: [],
    collateral_asset_symbols: [],
    stock_token_collateral_market_count: null,
  });
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finite(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function nonnegative(value: unknown): number | null {
  const parsed = finite(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function nonnegativeInteger(value: unknown): number | null {
  const parsed = nonnegative(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
}

function tokenSymbol(value: unknown): string | null {
  const item = record(value);
  return item !== null && typeof item.symbol === "string" && item.symbol.trim() !== ""
    ? item.symbol.trim()
    : null;
}

function borrowWithinSupplyTolerance(supply: number, borrow: number): boolean {
  if (borrow <= supply) return true;
  if (supply === 0) return false;
  const tolerance = Math.max(
    MORPHO_BORROW_ROUNDING_ABSOLUTE_USD,
    supply * MORPHO_BORROW_ROUNDING_RELATIVE,
  );
  return borrow - supply <= tolerance;
}

function utilisationFromBalances(supply: number, borrow: number): number {
  if (supply === 0) return 0;
  if (borrow > supply) return 1;
  return borrow / supply;
}

function compareSymbols(left: string, right: string): number {
  const leftFolded = left.toLowerCase();
  const rightFolded = right.toLowerCase();
  if (leftFolded < rightFolded) return -1;
  if (leftFolded > rightFolded) return 1;
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

type HistoryIssue =
  | "coverage_gap"
  | "duplicate_timestamp_conflict"
  | "freshness_gap"
  | "schema_drift";

function buildMarketHistoryQuery(marketCount: number): string {
  const marketVariables = Array.from(
    { length: marketCount },
    (_, index) => `$marketId${index}: String!`,
  ).join(", ");
  const markets = Array.from({ length: marketCount }, (_, index) => `
    market${index}: marketById(marketId: $marketId${index}, chainId: 4663) {
      marketId
      historicalState {
        supplyAssetsUsd(options: $options) { x y }
        borrowAssetsUsd(options: $options) { x y }
        utilization(options: $options) { x y }
      }
    }`).join("\n");
  return `
query RobinhoodChainMarketHistory($options: TimeseriesOptions!, ${marketVariables}) {
${markets}
}`;
}

function selectHistoryPoints(
  raw: unknown,
  currentCutoff: number,
  maximumValue?: number,
): { current: number; baseline: number } | HistoryIssue {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_HISTORY_POINTS_PER_SERIES) {
    return "schema_drift";
  }
  const timestamped = raw.map((value) => {
    const item = record(value);
    const timestamp = item === null ? null : nonnegativeInteger(item.x);
    return item === null || timestamp === null ? null : { item, timestamp };
  });
  if (timestamped.some((value) => value === null)) return "schema_drift";
  const valueByTimestamp = new Map<number, number>();
  for (const entry of timestamped) {
    if (entry === null || entry.timestamp > currentCutoff) continue;
    const value = nonnegative(entry.item.y);
    if (value === null || (maximumValue !== undefined && value > maximumValue)) return "schema_drift";
    const existing = valueByTimestamp.get(entry.timestamp);
    if (existing !== undefined && existing !== value) return "duplicate_timestamp_conflict";
    valueByTimestamp.set(entry.timestamp, value);
  }
  const observations = [...valueByTimestamp.entries()].map(([timestamp, value]) => ({ timestamp, value }));
  const latestAtOrBefore = (cutoff: number): HistoryMetricPoint | null => observations
    .filter((observation) => observation.timestamp <= cutoff)
    .sort((left, right) => right.timestamp - left.timestamp)[0] ?? null;
  const baselineCutoff = currentCutoff - 7 * DAY_SECONDS;
  const current = latestAtOrBefore(currentCutoff);
  const baseline = latestAtOrBefore(baselineCutoff);
  if (current === null || baseline === null) return "coverage_gap";
  if (
    currentCutoff - current.timestamp > MAX_HISTORY_DISTANCE_SECONDS
    || baselineCutoff - baseline.timestamp > MAX_HISTORY_DISTANCE_SECONDS
  ) {
    return "freshness_gap";
  }
  return { current: current.value, baseline: baseline.value };
}

function parseMarketHistory(
  raw: unknown,
  expectedMarketId: string,
  currentCutoff: number,
): MarketHistoryValues | HistoryIssue {
  const item = record(raw);
  const marketId = item !== null && typeof item.marketId === "string" ? item.marketId.trim() : "";
  const historicalState = item === null ? null : record(item.historicalState);
  if (marketId.toLowerCase() !== expectedMarketId.toLowerCase() || historicalState === null) {
    return "schema_drift";
  }
  const supply = selectHistoryPoints(historicalState.supplyAssetsUsd, currentCutoff);
  const borrow = selectHistoryPoints(historicalState.borrowAssetsUsd, currentCutoff);
  const utilisation = selectHistoryPoints(historicalState.utilization, currentCutoff, 1);
  for (const parsed of [supply, borrow, utilisation]) {
    if (typeof parsed === "string") return parsed;
  }
  if (typeof supply === "string" || typeof borrow === "string" || typeof utilisation === "string") {
    return "schema_drift";
  }
  return {
    currentSupply: supply.current,
    baselineSupply: supply.baseline,
    currentBorrow: borrow.current,
    baselineBorrow: borrow.baseline,
    currentUtilisation: utilisation.current,
    baselineUtilisation: utilisation.baseline,
  };
}

async function fetchMarketHistoryBatch(
  ctx: AdapterContext,
  marketIds: string[],
  now: Date,
): Promise<{
  rows: MarketHistoryValues[];
  issues: HistoryIssue[];
  failure: "source_access" | "schema_drift" | null;
}> {
  const endTimestamp = Math.floor(now.getTime() / 1_000);
  const variables: Record<string, unknown> = {
    options: {
      startTimestamp: endTimestamp - 10 * DAY_SECONDS,
      endTimestamp,
      interval: "DAY",
    },
  };
  marketIds.forEach((marketId, index) => {
    variables[`marketId${index}`] = marketId;
  });
  let response: Response;
  try {
    response = await ctx.fetch(MORPHO_GRAPHQL_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: buildMarketHistoryQuery(marketIds.length),
        variables,
      }),
    });
  } catch {
    return { rows: [], issues: [], failure: "source_access" };
  }
  if (!response.ok) return { rows: [], issues: [], failure: "source_access" };
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { rows: [], issues: [], failure: "schema_drift" };
  }
  const root = record(body);
  const data = root === null ? null : record(root.data);
  if (root === null || (Array.isArray(root.errors) && root.errors.length > 0) || data === null) {
    return { rows: [], issues: [], failure: "schema_drift" };
  }
  const rows: MarketHistoryValues[] = [];
  const issues: HistoryIssue[] = [];
  marketIds.forEach((marketId, index) => {
    const parsed = parseMarketHistory(data[`market${index}`], marketId, endTimestamp);
    if (typeof parsed === "string") issues.push(parsed);
    else rows.push(parsed);
  });
  return { rows, issues, failure: null };
}

function percentageChange(current: number, baseline: number): number | null {
  return baseline === 0 ? null : ((current - baseline) / baseline) * 100;
}

async function fetchMarketHistory(
  ctx: AdapterContext,
  marketIds: string[],
  now: Date,
): Promise<MorphoHistoryResult> {
  const asOf = now.toISOString();
  const source = "morpho-api:market-history:4663";
  const role = "Seven-day listed Morpho market supply, borrow, and utilisation history on chain id 4663";
  if (marketIds.length > MORPHO_MAX_HISTORY_MARKETS) {
    return {
      supplyChange7dPct: null,
      borrowChange7dPct: null,
      utilisationChange7d: null,
      marketCount: marketIds.length,
      coveredMarketCount: 0,
      sourceStatus: { source, role, status: "unavailable", as_of: asOf },
      sourceAvailable: false,
      gaps: [{
        code: "morpho-api:history_limit",
        detail: `Morpho history was not requested because ${marketIds.length} markets exceeded the bounded limit of ${MORPHO_MAX_HISTORY_MARKETS}.`,
      }],
    };
  }
  const batches = Array.from(
    { length: Math.ceil(marketIds.length / MORPHO_HISTORY_BATCH_SIZE) },
    (_, index) => marketIds.slice(
      index * MORPHO_HISTORY_BATCH_SIZE,
      (index + 1) * MORPHO_HISTORY_BATCH_SIZE,
    ),
  );
  const batchResults = await Promise.all(batches.map((batch) => fetchMarketHistoryBatch(ctx, batch, now)));
  const rows = batchResults.flatMap((result) => result.rows);
  const issues = batchResults.flatMap((result) => result.issues);
  const failures = batchResults.map((result) => result.failure).filter((value) => value !== null);
  const gaps: RobinhoodPulseGap[] = [];
  const issueCounts = new Map<HistoryIssue, number>();
  for (const issue of issues) issueCounts.set(issue, (issueCounts.get(issue) ?? 0) + 1);
  for (const [issue, count] of issueCounts) {
    const code = issue === "duplicate_timestamp_conflict"
      ? "morpho-api:history_duplicate_timestamp_conflict"
      : issue === "freshness_gap"
        ? "morpho-api:history_freshness_gap"
        : issue === "coverage_gap"
          ? "morpho-api:history_coverage_gap"
          : "morpho-api:history_schema_drift";
    gaps.push({ code, detail: `${count} Morpho market history row(s) failed the ${issue.replaceAll("_", " ")} control.` });
  }
  if (failures.length > 0) {
    gaps.push({
      code: failures.includes("source_access")
        ? "morpho-api:history_source_access_gap"
        : "morpho-api:history_schema_drift",
      detail: `${failures.length} bounded Morpho market-history batch request(s) failed.`,
    });
  }
  const fullyCovered = rows.length === marketIds.length && failures.length === 0 && issues.length === 0;
  if (!fullyCovered) {
    if (!gaps.some((gap) => gap.code === "morpho-api:history_coverage_gap")) {
      gaps.push({
        code: "morpho-api:history_coverage_gap",
        detail: `Only ${rows.length} of ${marketIds.length} listed markets had complete bounded history.`,
      });
    }
    return {
      supplyChange7dPct: null,
      borrowChange7dPct: null,
      utilisationChange7d: null,
      marketCount: marketIds.length,
      coveredMarketCount: rows.length,
      sourceStatus: {
        source,
        role,
        status: failures.includes("source_access") ? "unavailable" : "schema_drift",
        as_of: asOf,
      },
      sourceAvailable: failures.length === 0,
      gaps,
    };
  }
  const currentSupply = rows.reduce((sum, row) => sum + row.currentSupply, 0);
  const baselineSupply = rows.reduce((sum, row) => sum + row.baselineSupply, 0);
  const currentBorrow = rows.reduce((sum, row) => sum + row.currentBorrow, 0);
  const baselineBorrow = rows.reduce((sum, row) => sum + row.baselineBorrow, 0);
  if (
    !borrowWithinSupplyTolerance(currentSupply, currentBorrow)
    || !borrowWithinSupplyTolerance(baselineSupply, baselineBorrow)
  ) {
    gaps.push({
      code: "morpho-api:history_utilisation_inconsistent",
      detail: "Historical aggregate borrow exceeded supply beyond the explicit USD rounding tolerance.",
    });
    return {
      supplyChange7dPct: null,
      borrowChange7dPct: null,
      utilisationChange7d: null,
      marketCount: marketIds.length,
      coveredMarketCount: rows.length,
      sourceStatus: { source, role, status: "schema_drift", as_of: asOf },
      sourceAvailable: true,
      gaps,
    };
  }
  const supplyChange7dPct = percentageChange(currentSupply, baselineSupply);
  const borrowChange7dPct = percentageChange(currentBorrow, baselineBorrow);
  if (supplyChange7dPct === null || borrowChange7dPct === null) {
    gaps.push({
      code: "morpho-api:history_baseline_zero",
      detail: "Historical supply or borrow baseline was zero, so at least one percentage change is undefined.",
    });
  }
  const utilisationChange7d = currentSupply > 0 && baselineSupply > 0
    ? utilisationFromBalances(currentSupply, currentBorrow)
      - utilisationFromBalances(baselineSupply, baselineBorrow)
    : null;
  if (utilisationChange7d === null) {
    gaps.push({
      code: "morpho-api:history_utilisation_denominator_zero",
      detail: "Current or baseline historical supply was zero, so the utilisation change is undefined.",
    });
  }
  return {
    supplyChange7dPct,
    borrowChange7dPct,
    utilisationChange7d,
    marketCount: marketIds.length,
    coveredMarketCount: rows.length,
    sourceStatus: { source, role, status: "ok", as_of: asOf },
    sourceAvailable: true,
    gaps,
  };
}

async function fetchMarketPage(
  ctx: AdapterContext,
  asOf: string,
  skip: number,
): Promise<{ items: unknown[]; countTotal: number }> {
  let response: Response;
  try {
    response = await ctx.fetch(MORPHO_GRAPHQL_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: MARKETS_QUERY,
        variables: { first: MORPHO_MARKET_PAGE_SIZE, skip },
      }),
    });
  } catch {
    return failRefresh(unavailable(asOf, "morpho-api:source_access_gap", "Morpho markets API was unavailable."));
  }
  if (!response.ok) {
    return failRefresh(unavailable(asOf, "morpho-api:source_access_gap", "Morpho markets API returned a non-success response."));
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return failRefresh(unavailable(asOf, "morpho-api:schema_drift", "Morpho markets API did not return JSON."));
  }
  const root = record(body);
  if (root !== null && Array.isArray(root.errors) && root.errors.length > 0) {
    return failRefresh(unavailable(asOf, "morpho-api:schema_drift", "Morpho markets API returned GraphQL errors."));
  }
  const data = root === null ? null : record(root.data);
  const markets = data === null ? null : record(data.markets);
  if (markets === null || !Array.isArray(markets.items)) {
    return failRefresh(unavailable(asOf, "morpho-api:schema_drift", "Morpho market rows did not satisfy the bounded contract."));
  }
  const items = markets.items;
  const pageInfo = record(markets.pageInfo);
  const count = pageInfo === null ? null : nonnegativeInteger(pageInfo.count);
  const countTotal = pageInfo === null ? null : nonnegativeInteger(pageInfo.countTotal);
  const limit = pageInfo === null ? null : nonnegativeInteger(pageInfo.limit);
  const responseSkip = pageInfo === null ? null : nonnegativeInteger(pageInfo.skip);
  if (
    count === null
    || countTotal === null
    || limit !== MORPHO_MARKET_PAGE_SIZE
    || responseSkip !== skip
    || count !== items.length
    || count > MORPHO_MARKET_PAGE_SIZE
  ) {
    return failRefresh(unavailable(
      asOf,
      "morpho-api:pagination_page_invalid",
      "Morpho market page metadata did not match the bounded pagination contract.",
    ));
  }
  return { items, countTotal };
}

async function load(ctx: AdapterContext, now: Date): Promise<RobinhoodMorphoResult> {
  const asOf = now.toISOString();
  const items: unknown[] = [];
  const marketIds = new Set<string>();
  let expectedTotal: number | null = null;
  for (let skip = 0; ; skip += MORPHO_MARKET_PAGE_SIZE) {
    const page = await fetchMarketPage(ctx, asOf, skip);
    if (expectedTotal === null) {
      expectedTotal = page.countTotal;
      if (expectedTotal > MORPHO_MAX_MARKETS) {
        return failRefresh(unavailable(
          asOf,
          "morpho-api:pagination_limit",
          `Morpho reported more than the bounded limit of ${MORPHO_MAX_MARKETS} listed markets.`,
        ));
      }
    } else if (page.countTotal !== expectedTotal) {
      return failRefresh(unavailable(
        asOf,
        "morpho-api:pagination_inconsistent_total",
        "Morpho listed-market count changed while bounded pages were being collected.",
      ));
    }

    for (const raw of page.items) {
      const row = record(raw);
      const marketId = row !== null && typeof row.marketId === "string" && row.marketId.trim() !== ""
        ? row.marketId.trim()
        : null;
      if (marketId === null) {
        return failRefresh(unavailable(asOf, "morpho-api:schema_drift", "A Morpho market row had no valid market ID."));
      }
      const normalizedMarketId = marketId.toLowerCase();
      if (marketIds.has(normalizedMarketId)) {
        return failRefresh(unavailable(
          asOf,
          "morpho-api:duplicate_market_id",
          "Morpho pagination returned a duplicate market ID.",
        ));
      }
      marketIds.add(normalizedMarketId);
      items.push(raw);
    }

    if (items.length === expectedTotal) break;
    if (items.length > expectedTotal || page.items.length !== MORPHO_MARKET_PAGE_SIZE) {
      return failRefresh(unavailable(
        asOf,
        "morpho-api:pagination_incomplete",
        "Morpho pagination ended before the reported listed-market total was collected.",
      ));
    }
  }
  if (items.length === 0) {
    return {
      status: "partial",
      metrics: RobinhoodCreditMetricsSchema.parse({
        ...emptyMetrics(),
        listed_market_count: 0,
        active_market_count: 0,
        supply_usd: 0,
        borrow_usd: 0,
        liquidity_usd: 0,
        collateral_usd: 0,
        utilisation: 0,
        high_utilisation_market_count: 0,
        history_market_count: 0,
        history_covered_market_count: 0,
      }),
      sources: ["morpho-api:markets:4663"],
      sourceStatus: [{
        source: "morpho-api:markets:4663",
        role: "Listed Morpho lending markets on Robinhood Chain",
        status: "ok",
        as_of: asOf,
      }],
      stale: false,
      staleData: [],
      gaps: [{ code: "morpho-api:no_listed_markets", detail: "No listed Morpho markets were returned for chain id 4663." }],
      confidence: 0.7,
      asOf,
    };
  }

  let supply = 0;
  let borrow = 0;
  let liquidity = 0;
  let collateral = 0;
  let collateralComplete = true;
  let active = 0;
  let highUtilisation = 0;
  let parsedRows = 0;
  let missingStateRows = 0;
  let invalidUsdRows = 0;
  let missingCollateralRows = 0;
  let invalidProviderUtilisationRows = 0;
  let inconsistentBorrowRows = 0;
  const loanSymbols = new Set<string>();
  const collateralSymbols = new Set<string>();
  const gaps: RobinhoodPulseGap[] = [];

  for (const raw of items) {
    const row = record(raw);
    const state = row === null ? null : record(row.state);
    if (row === null || state === null) {
      missingStateRows += 1;
      continue;
    }
    const rowSupply = nonnegative(state.supplyAssetsUsd);
    const rowBorrow = nonnegative(state.borrowAssetsUsd);
    const rowLiquidity = nonnegative(state.liquidityAssetsUsd);
    const rowCollateral = nonnegative(state.collateralAssetsUsd);
    if (rowSupply === null || rowBorrow === null || rowLiquidity === null) {
      invalidUsdRows += 1;
      continue;
    }
    parsedRows += 1;
    supply += rowSupply;
    borrow += rowBorrow;
    liquidity += rowLiquidity;
    if (rowCollateral === null) {
      collateralComplete = false;
      missingCollateralRows += 1;
    } else {
      collateral += rowCollateral;
    }
    if (rowSupply > 0 || rowBorrow > 0) active += 1;
    const rawProviderUtilisation = state.utilization;
    const providerUtilisation = finite(rawProviderUtilisation);
    const providerUtilisationPresent = rawProviderUtilisation !== undefined && rawProviderUtilisation !== null;
    const providerUtilisationValid = !providerUtilisationPresent
      || (providerUtilisation !== null && providerUtilisation >= 0 && providerUtilisation <= 1);
    const balancesConsistent = borrowWithinSupplyTolerance(rowSupply, rowBorrow);
    if (!providerUtilisationValid) invalidProviderUtilisationRows += 1;
    if (!balancesConsistent) inconsistentBorrowRows += 1;
    if (providerUtilisationValid && balancesConsistent) {
      const rowUtilisation = providerUtilisation ?? utilisationFromBalances(rowSupply, rowBorrow);
      if (rowUtilisation >= 0.85) highUtilisation += 1;
    }
    const loan = tokenSymbol(row.loanAsset);
    const collateralSymbol = tokenSymbol(row.collateralAsset);
    if (loan !== null) loanSymbols.add(loan);
    if (collateralSymbol !== null) collateralSymbols.add(collateralSymbol);
  }

  if (missingStateRows > 0) {
    gaps.push({
      code: "morpho-api:row_schema_gap",
      detail: `${missingStateRows} Morpho market row(s) were skipped because state fields were missing.`,
    });
  }
  if (invalidUsdRows > 0) {
    gaps.push({
      code: "morpho-api:row_schema_gap",
      detail: `${invalidUsdRows} Morpho market row(s) were skipped because supply, borrow, or liquidity USD fields were invalid.`,
    });
  }
  if (missingCollateralRows > 0) {
    gaps.push({
      code: "morpho-api:collateral_value_gap",
      detail: `${missingCollateralRows} Morpho market row(s) had no valid collateral USD value; aggregate collateral remains unknown.`,
    });
  }
  if (invalidProviderUtilisationRows > 0) {
    gaps.push({
      code: "morpho-api:utilisation_out_of_range",
      detail: `${invalidProviderUtilisationRows} Morpho market row(s) reported utilisation outside the inclusive [0, 1] range.`,
    });
  }

  if (parsedRows === 0) {
    return failRefresh(unavailable(asOf, "morpho-api:schema_drift", "No Morpho market row could be normalized."));
  }
  const aggregateBalancesConsistent = borrowWithinSupplyTolerance(supply, borrow);
  if (inconsistentBorrowRows > 0 || !aggregateBalancesConsistent) {
    gaps.push({
      code: "morpho-api:utilisation_inconsistent",
      detail: `${inconsistentBorrowRows} Morpho market row(s) or their aggregate had borrow above supply beyond the explicit USD rounding tolerance.`,
    });
  }
  const utilisationComplete = invalidProviderUtilisationRows === 0
    && inconsistentBorrowRows === 0
    && aggregateBalancesConsistent;
  const utilisation = utilisationComplete ? utilisationFromBalances(supply, borrow) : null;
  const history = await fetchMarketHistory(ctx, [...marketIds], now);
  gaps.push(...history.gaps);
  gaps.push({
    code: "morpho-api:unique_borrowers_history_unavailable",
    detail: "The official Morpho MarketHistory schema has no unique-borrower time series; borrower growth remains unmeasured.",
  });
  const metrics = RobinhoodCreditMetricsSchema.parse({
    listed_market_count: items.length,
    active_market_count: active,
    supply_usd: supply,
    borrow_usd: borrow,
    liquidity_usd: liquidity,
    collateral_usd: collateralComplete ? collateral : null,
    utilisation,
    high_utilisation_market_count: utilisationComplete ? highUtilisation : null,
    supply_change_7d_pct: history.supplyChange7dPct,
    borrow_change_7d_pct: history.borrowChange7dPct,
    utilisation_change_7d: history.utilisationChange7d,
    history_market_count: history.marketCount,
    history_covered_market_count: history.coveredMarketCount,
    unique_borrowers_change_7d_pct: null,
    loan_asset_symbols: [...loanSymbols].sort(compareSymbols),
    collateral_asset_symbols: [...collateralSymbols].sort(compareSymbols),
    stock_token_collateral_market_count: null,
  });
  gaps.push({
    code: "morpho-api:stock_token_classification_gap",
    detail: "Stock-token collateral markets are not classified until the official Robinhood stock-token registry is consumed with effective dates.",
  });
  const materialGaps = gaps.filter((gap) => ![
    "morpho-api:stock_token_classification_gap",
    "morpho-api:unique_borrowers_history_unavailable",
  ].includes(gap.code));
  return {
    status: materialGaps.length === 0 ? "valid" : "partial",
    metrics,
    sources: [
      "morpho-api:markets:4663",
      ...(history.sourceAvailable ? ["morpho-api:market-history:4663"] : []),
    ],
    sourceStatus: [
      {
        source: "morpho-api:markets:4663",
        role: "Listed Morpho lending supply, borrow, liquidity, and utilisation on chain id 4663",
        status: "ok",
        as_of: asOf,
      },
      history.sourceStatus,
    ],
    stale: false,
    staleData: [],
    gaps,
    confidence: Number((
      (parsedRows / items.length) * 0.75
      + (history.marketCount === 0 ? 0 : history.coveredMarketCount / history.marketCount) * 0.25
    ).toFixed(2)),
    asOf,
  };
}

function unavailable(asOf: string, code: string, detail: string): RobinhoodMorphoResult {
  return {
    status: "unavailable",
    metrics: emptyMetrics(),
    sources: [],
    sourceStatus: [{
      source: "morpho-api:markets:4663",
      role: "Listed Morpho lending markets on Robinhood Chain",
      status: code.endsWith("schema_drift") ? "schema_drift" : "unavailable",
      as_of: asOf,
    }],
    stale: false,
    staleData: [],
    gaps: [{ code, detail }],
    confidence: 0,
    asOf,
  };
}

function markStale(result: RobinhoodMorphoResult): RobinhoodMorphoResult {
  return {
    ...result,
    status: result.status === "valid" ? "partial" : result.status,
    stale: true,
    staleData: [...new Set([...result.staleData, "morpho-api:stale_cache"])],
    sourceStatus: result.sourceStatus.map((source) => ({
      ...source,
      status: source.status === "ok" ? "stale" : source.status,
    })),
    gaps: [
      ...result.gaps,
      { code: "morpho-api:stale_cache", detail: "Live refresh failed and cached Robinhood Chain credit data was used." },
    ],
    confidence: Number((result.confidence * 0.75).toFixed(2)),
  };
}

export async function fetchRobinhoodChainMorpho(
  ctx: AdapterContext,
  now: Date = new Date(),
): Promise<RobinhoodMorphoResult> {
  try {
    const result = await withCache(
      ctx.cacheFor<RobinhoodMorphoResult>(CACHE_SPEC),
      "chain-4663",
      () => load(ctx, now),
    );
    return result.stale ? markStale(result) : result;
  } catch (error) {
    if (error instanceof RobinhoodMorphoRefreshError) return error.fallback;
    return unavailable(now.toISOString(), "morpho-api:source_access_gap", "Robinhood Chain credit data could not be loaded.");
  }
}
