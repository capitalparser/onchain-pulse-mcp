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
export const MORPHO_BORROW_ROUNDING_ABSOLUTE_USD = 0.01;
export const MORPHO_BORROW_ROUNDING_RELATIVE = 1e-9;

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
  const metrics = RobinhoodCreditMetricsSchema.parse({
    listed_market_count: items.length,
    active_market_count: active,
    supply_usd: supply,
    borrow_usd: borrow,
    liquidity_usd: liquidity,
    collateral_usd: collateralComplete ? collateral : null,
    utilisation,
    high_utilisation_market_count: utilisationComplete ? highUtilisation : null,
    loan_asset_symbols: [...loanSymbols].sort(compareSymbols),
    collateral_asset_symbols: [...collateralSymbols].sort(compareSymbols),
    stock_token_collateral_market_count: null,
  });
  gaps.push({
    code: "morpho-api:stock_token_classification_gap",
    detail: "Stock-token collateral markets are not classified until the official Robinhood stock-token registry is consumed with effective dates.",
  });
  return {
    status: gaps.length === 1 ? "valid" : "partial",
    metrics,
    sources: ["morpho-api:markets:4663"],
    sourceStatus: [{
      source: "morpho-api:markets:4663",
      role: "Listed Morpho lending supply, borrow, liquidity, and utilisation on chain id 4663",
      status: "ok",
      as_of: asOf,
    }],
    stale: false,
    staleData: [],
    gaps,
    confidence: Number((parsedRows / items.length).toFixed(2)),
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
    sourceStatus: result.sourceStatus.map((source) => ({ ...source, status: "stale" })),
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
