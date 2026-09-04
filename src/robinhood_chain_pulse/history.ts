import type { AdapterContext } from "../adapters/base.js";
import { makeContext } from "../adapters/base.js";
import {
  fetchRobinhoodChainCommunity,
  type RobinhoodCommunityResult,
} from "../adapters/robinhood_chain_community.js";
import {
  fetchRobinhoodChainDefiLlama,
  type RobinhoodDefiLlamaResult,
} from "../adapters/robinhood_chain_defillama.js";
import {
  fetchRobinhoodChainMorpho,
  type RobinhoodMorphoResult,
} from "../adapters/robinhood_chain_morpho.js";
import type { EnvConfig } from "../env.js";
import { buildMetricObservationId } from "../intelligence_core/observation_id.js";
import { assertInternalResearchAllowed } from "../intelligence_core/source_license.js";
import {
  JsonlMetricObservationStore,
  type MetricObservationStore,
} from "../intelligence_core/store.js";
import type { MetricObservation } from "../intelligence_core/types.js";
import { getRobinhoodChainPulse } from "../tools/get_robinhood_chain_pulse.js";
import type {
  RobinhoodChainPulseSnapshot,
  RobinhoodPulseGap,
  RobinhoodSourceStatus,
} from "./types.js";

export const ROBINHOOD_CHAIN_SUBJECT_REF = "robinhood-chain:4663";
export const ROBINHOOD_CHAIN_HISTORY_METHODOLOGY_VERSION = "robinhood-chain-history-v1";
export const ROBINHOOD_CHAIN_COLLECTOR_ID = "robinhood-chain:4663";
export const ROBINHOOD_CHAIN_COLLECTOR_VERSION = "robinhood-chain-collector-v1";

const CAPITAL_TVL_REFS = ["defillama:chains"] as const;
const CAPITAL_STABLECOIN_STOCK_REFS = ["defillama-stablecoins:chains"] as const;
const CAPITAL_STABLECOIN_HISTORY_REFS = ["defillama-stablecoins:history"] as const;
const CAPITAL_DEX_REFS = ["defillama:dexs:robinhood-chain"] as const;
const CAPITAL_FEE_REFS = ["defillama:fees:robinhood-chain"] as const;
const CAPITAL_AXIS_REFS = [
  "defillama:chains",
  "defillama-stablecoins:history",
  "defillama:dexs:robinhood-chain",
] as const;
const CREDIT_MARKET_REFS = ["morpho-api:markets:4663"] as const;
const CREDIT_HISTORY_REFS = ["morpho-api:market-history:4663"] as const;

const CAPITAL_STATUSES = ["expanding", "stable", "contracting", "mixed", "unknown"] as const;
const CREDIT_STATUSES = ["active", "forming", "inactive", "unknown"] as const;
const BREADTH_STATUSES = [
  "leader_beta_diffusion",
  "leader_only",
  "broad_risk_on",
  "mixed",
  "thin_data",
  "unknown",
] as const;
const FRAGILITY_STATUSES = ["low", "moderate", "high", "unknown"] as const;
const PHASES = [
  "capital_formation",
  "credit_activation",
  "leader_concentration",
  "leader_beta_diffusion",
  "fragile_blowoff",
  "mixed",
  "data_warning",
  "unavailable",
] as const;

interface FamilyQuality {
  status: "valid" | "partial" | "unavailable";
  stale: boolean;
  staleData: string[];
  gaps: RobinhoodPulseGap[];
  confidence: number;
  asOf: string;
  sourceStatus: RobinhoodSourceStatus[];
}

export interface RobinhoodChainHistoryInputs {
  fundamentals: RobinhoodDefiLlamaResult;
  credit: RobinhoodMorphoResult;
  community: RobinhoodCommunityResult;
  snapshot: RobinhoodChainPulseSnapshot;
}

export interface RobinhoodSourceFamilySummary {
  status: "valid" | "partial" | "unavailable";
  as_of: string;
  stale: boolean;
  confidence: number;
  gap_codes: string[];
}

export interface RobinhoodChainCollectionRunResult {
  collector_id: typeof ROBINHOOD_CHAIN_COLLECTOR_ID;
  collector_version: typeof ROBINHOOD_CHAIN_COLLECTOR_VERSION;
  methodology_version: string;
  status: "complete" | "partial" | "failed";
  started_at: string;
  completed_at: string;
  snapshot_as_of: string;
  emitted_observation_ids: string[];
  emitted_observation_count: number;
  skipped_duplicate_ids: string[];
  skipped_duplicate_count: number;
  source_families: {
    defillama: RobinhoodSourceFamilySummary;
    morpho: RobinhoodSourceFamilySummary;
    community: RobinhoodSourceFamilySummary;
  };
  gaps: string[];
  stale_families: string[];
}

export interface RobinhoodChainCollectorOptions {
  fetchImpl?: typeof fetch;
  now?: () => Date;
  methodologyVersion?: string;
  fetchFundamentals?: (ctx: AdapterContext, asOf: Date) => Promise<RobinhoodDefiLlamaResult>;
  fetchCredit?: (ctx: AdapterContext, asOf: Date) => Promise<RobinhoodMorphoResult>;
  fetchCommunity?: (ctx: AdapterContext, asOf: Date) => Promise<RobinhoodCommunityResult>;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function qualityDimensions(family: string, quality: FamilyQuality): Record<string, string> {
  const dimensions: Record<string, string> = {
    source_family: family,
    quality_status: quality.status,
    source_stale: String(quality.stale),
  };
  uniqueSorted(quality.gaps.map((gap) => gap.code)).forEach((code, index) => {
    dimensions["source_gap_" + String(index + 1).padStart(3, "0")] = code;
  });
  uniqueSorted(quality.staleData).forEach((ref, index) => {
    dimensions["stale_ref_" + String(index + 1).padStart(3, "0")] = ref;
  });
  return dimensions;
}

function sourceAt(
  statuses: readonly RobinhoodSourceStatus[],
  sourceRefs: readonly string[],
  fallback: string,
  observedAt: string,
): string {
  const supported = new Set(sourceRefs);
  const observedMillis = Date.parse(observedAt);
  const candidates = statuses
    .filter((status) => supported.has(status.source) && status.as_of !== null)
    .map((status) => status.as_of as string)
    .filter((value) => Date.parse(value) <= observedMillis)
    .sort((left, right) => Date.parse(right) - Date.parse(left));
  const selected = candidates[0] ?? fallback;
  return Date.parse(selected) <= observedMillis ? selected : observedAt;
}

function buildObservation(args: {
  metricKey: string;
  value: number;
  unit: string;
  sourceRefs: readonly string[];
  sourceAt: string;
  observedAt: string;
  ingestedAt: string;
  confidence: number;
  methodologyVersion: string;
  dimensions: Record<string, string>;
}): MetricObservation {
  const sourceRefs = uniqueSorted(args.sourceRefs);
  const base = {
    metricKey: args.metricKey,
    subjectRef: ROBINHOOD_CHAIN_SUBJECT_REF,
    value: args.value,
    unit: args.unit,
    sourceAt: args.sourceAt,
    observedAt: args.observedAt,
    confidence: args.confidence,
    sourceRefs,
    methodologyVersion: args.methodologyVersion,
    dimensions: args.dimensions,
  };
  return {
    id: buildMetricObservationId(base),
    metric_key: args.metricKey,
    subject_ref: ROBINHOOD_CHAIN_SUBJECT_REF,
    value: args.value,
    unit: args.unit,
    source_at: args.sourceAt,
    observed_at: args.observedAt,
    ingested_at: args.ingestedAt,
    confidence: args.confidence,
    source_refs: sourceRefs,
    methodology_version: args.methodologyVersion,
    dimensions: args.dimensions,
  };
}

function communitySourceRefs(result: RobinhoodCommunityResult): string[] {
  const refs = ["dexscreener:robinhood:registered-tokens"];
  for (const token of result.tokens.filter((item) => item.eligible_for_breadth)) {
    const address = token.address.toLowerCase();
    const explorer = "robinhood-blockscout:token:" + address;
    const rpc = "robinhood-rpc:token:" + address;
    const explorerStatus = result.sourceStatus.find((row) => row.source === explorer)?.status;
    const rpcStatus = result.sourceStatus.find((row) => row.source === rpc)?.status;
    if (explorerStatus === "ok" || explorerStatus === "stale") refs.push(explorer);
    else if (rpcStatus === "ok" || rpcStatus === "stale") refs.push(rpc);
  }
  return uniqueSorted(refs);
}

function phaseSourceRefs(
  phase: RobinhoodChainPulseSnapshot["phase"],
  communityRefs: readonly string[],
): string[] {
  if (phase === "capital_formation") return [...CAPITAL_AXIS_REFS];
  if (phase === "credit_activation") return uniqueSorted([...CAPITAL_AXIS_REFS, ...CREDIT_MARKET_REFS]);
  if (
    phase === "leader_concentration"
    || phase === "leader_beta_diffusion"
    || phase === "fragile_blowoff"
  ) return [...communityRefs];
  return uniqueSorted([...CAPITAL_AXIS_REFS, ...CREDIT_MARKET_REFS, ...communityRefs]);
}

export function metricObservationsFromRobinhoodChain(
  input: RobinhoodChainHistoryInputs,
  ingestedAt: Date,
  methodologyVersion = ROBINHOOD_CHAIN_HISTORY_METHODOLOGY_VERSION,
): MetricObservation[] {
  const observedAt = input.snapshot.as_of;
  const ingestedAtIso = ingestedAt.toISOString();
  const observations: MetricObservation[] = [];

  const add = (
    metricKey: string,
    value: number | null,
    unit: string,
    refs: readonly string[],
    quality: FamilyQuality,
    dimensions = qualityDimensions(
      metricKey.includes(".morpho_")
        ? "credit"
        : metricKey.includes(".community_")
          ? "community"
          : "capital",
      quality,
    ),
    confidence = quality.confidence,
  ): void => {
    if (value === null) return;
    observations.push(buildObservation({
      metricKey,
      value,
      unit,
      sourceRefs: refs,
      sourceAt: sourceAt(quality.sourceStatus, refs, quality.asOf, observedAt),
      observedAt,
      ingestedAt: ingestedAtIso,
      confidence,
      methodologyVersion,
      dimensions,
    }));
  };

  const capital = input.fundamentals;
  add("robinhood_chain.tvl_usd", capital.metrics.tvl_usd, "USD", CAPITAL_TVL_REFS, capital);
  add("robinhood_chain.tvl_change_1d_pct", capital.metrics.tvl_change_1d_pct, "percent", CAPITAL_TVL_REFS, capital);
  add("robinhood_chain.stablecoin_supply_usd", capital.metrics.stablecoin_supply_usd, "USD", CAPITAL_STABLECOIN_STOCK_REFS, capital);
  add("robinhood_chain.stablecoin_change_7d_pct", capital.metrics.stablecoin_change_7d_pct, "percent", CAPITAL_STABLECOIN_HISTORY_REFS, capital);
  add("robinhood_chain.dex_volume_24h_usd", capital.metrics.dex_volume_24h_usd, "USD", CAPITAL_DEX_REFS, capital);
  add("robinhood_chain.dex_change_7d_pct", capital.metrics.dex_change_7d_pct, "percent", CAPITAL_DEX_REFS, capital);
  add("robinhood_chain.app_fees_24h_usd", capital.metrics.app_fees_24h_usd, "USD", CAPITAL_FEE_REFS, capital);

  const credit = input.credit;
  add("robinhood_chain.morpho_supply_usd", credit.metrics.supply_usd, "USD", CREDIT_MARKET_REFS, credit);
  add("robinhood_chain.morpho_borrow_usd", credit.metrics.borrow_usd, "USD", CREDIT_MARKET_REFS, credit);
  add("robinhood_chain.morpho_liquidity_usd", credit.metrics.liquidity_usd, "USD", CREDIT_MARKET_REFS, credit);
  add("robinhood_chain.morpho_collateral_usd", credit.metrics.collateral_usd, "USD", CREDIT_MARKET_REFS, credit);
  add("robinhood_chain.morpho_utilisation", credit.metrics.utilisation, "ratio", CREDIT_MARKET_REFS, credit);
  add("robinhood_chain.morpho_supply_change_7d_pct", credit.metrics.supply_change_7d_pct, "percent", CREDIT_HISTORY_REFS, credit);
  add("robinhood_chain.morpho_borrow_change_7d_pct", credit.metrics.borrow_change_7d_pct, "percent", CREDIT_HISTORY_REFS, credit);
  add("robinhood_chain.morpho_utilisation_change_7d", credit.metrics.utilisation_change_7d, "ratio", CREDIT_HISTORY_REFS, credit);
  const historyCoverage = credit.metrics.history_market_count !== null
    && credit.metrics.history_market_count > 0
    && credit.metrics.history_covered_market_count !== null
    ? credit.metrics.history_covered_market_count / credit.metrics.history_market_count
    : null;
  add(
    "robinhood_chain.morpho_history_coverage_ratio",
    historyCoverage,
    "ratio",
    [...CREDIT_MARKET_REFS, ...CREDIT_HISTORY_REFS],
    credit,
  );

  const community = input.community;
  const communityRefs = communitySourceRefs(community);
  add("robinhood_chain.community_eligible_count", input.snapshot.breadth.eligible_count, "count", communityRefs, community);
  add("robinhood_chain.community_positive_24h_share", input.snapshot.breadth.positive_24h_share, "ratio", communityRefs, community);
  add("robinhood_chain.community_beta_median_return_24h_pct", input.snapshot.breadth.beta_median_return_24h_pct, "percent", communityRefs, community);
  add("robinhood_chain.community_leader_return_24h_pct", input.snapshot.breadth.leader_return_24h_pct, "percent", communityRefs, community);
  add("robinhood_chain.community_leader_market_cap_share", input.snapshot.breadth.leader_market_cap_share, "ratio", communityRefs, community);
  add("robinhood_chain.community_median_market_cap_to_liquidity", input.snapshot.breadth.median_market_cap_to_liquidity, "ratio", communityRefs, community);
  add("robinhood_chain.community_median_volume_to_liquidity", input.snapshot.breadth.median_volume_to_liquidity, "ratio", communityRefs, community);

  const addOneHot = (
    prefix: string,
    selected: string,
    values: readonly string[],
    refs: readonly string[],
    quality: FamilyQuality,
    confidence: number,
    dimensions: Record<string, string>,
  ): void => {
    for (const value of values) {
      add(prefix + "." + value, value === selected ? 1 : 0, "one_hot", refs, quality, dimensions, confidence);
    }
  };

  addOneHot(
    "robinhood_chain.status.capital_base",
    input.snapshot.axes.capital_base.status,
    CAPITAL_STATUSES,
    CAPITAL_AXIS_REFS,
    capital,
    input.snapshot.axes.capital_base.confidence,
    qualityDimensions("capital_status", capital),
  );
  addOneHot(
    "robinhood_chain.status.current_credit",
    input.snapshot.axes.credit_activation.status,
    CREDIT_STATUSES,
    CREDIT_MARKET_REFS,
    credit,
    input.snapshot.axes.credit_activation.confidence,
    qualityDimensions("credit_status", credit),
  );
  addOneHot(
    "robinhood_chain.status.speculative_breadth",
    input.snapshot.axes.speculative_breadth.status,
    BREADTH_STATUSES,
    communityRefs,
    community,
    input.snapshot.axes.speculative_breadth.confidence,
    qualityDimensions("breadth_status", community),
  );
  addOneHot(
    "robinhood_chain.status.fragility",
    input.snapshot.axes.fragility.status,
    FRAGILITY_STATUSES,
    communityRefs,
    community,
    input.snapshot.axes.fragility.confidence,
    qualityDimensions("fragility_status", community),
  );

  const allQuality: FamilyQuality = {
    status: [capital.status, credit.status, community.status].every((status) => status === "valid")
      ? "valid"
      : [capital.status, credit.status, community.status].every((status) => status === "unavailable")
        ? "unavailable"
        : "partial",
    stale: capital.stale || credit.stale || community.stale,
    staleData: [...capital.staleData, ...credit.staleData, ...community.staleData],
    gaps: input.snapshot.gaps,
    confidence: input.snapshot.confidence,
    asOf: observedAt,
    sourceStatus: input.snapshot.source_status,
  };
  addOneHot(
    "robinhood_chain.status.overall_phase",
    input.snapshot.phase,
    PHASES,
    phaseSourceRefs(input.snapshot.phase, communityRefs),
    allQuality,
    input.snapshot.confidence,
    qualityDimensions("overall_phase", allQuality),
  );

  return observations;
}

function familySummary(result: FamilyQuality): RobinhoodSourceFamilySummary {
  return {
    status: result.status,
    as_of: result.asOf,
    stale: result.stale,
    confidence: result.confidence,
    gap_codes: uniqueSorted(result.gaps.map((gap) => gap.code)),
  };
}

async function appendUnique(
  store: MetricObservationStore,
  observations: readonly MetricObservation[],
): Promise<{ emitted: string[]; skipped: string[] }> {
  const existing = new Set((await store.readAll()).map((row) => row.id));
  const novel = observations.filter((row) => !existing.has(row.id));
  const skipped = observations.filter((row) => existing.has(row.id)).map((row) => row.id);
  if (store.appendMany !== undefined) await store.appendMany(novel);
  else for (const observation of novel) await store.append(observation);
  return { emitted: novel.map((row) => row.id), skipped };
}

export async function runRobinhoodChainCollectionOnce(args: {
  env: EnvConfig;
  store: MetricObservationStore;
  options?: RobinhoodChainCollectorOptions;
}): Promise<RobinhoodChainCollectionRunResult> {
  const options = args.options ?? {};
  const now = options.now ?? (() => new Date());
  const startedAt = now();
  const ctx = makeContext(
    options.fetchImpl === undefined ? { env: args.env } : { env: args.env, fetchImpl: options.fetchImpl },
  );
  const [fundamentals, credit, community] = await Promise.all([
    (options.fetchFundamentals ?? fetchRobinhoodChainDefiLlama)(ctx, startedAt),
    (options.fetchCredit ?? fetchRobinhoodChainMorpho)(ctx, startedAt),
    (options.fetchCommunity ?? fetchRobinhoodChainCommunity)(ctx, startedAt),
  ]);
  const snapshot = getRobinhoodChainPulse({
    lang: args.env.lang,
    fundamentals,
    credit,
    community,
    now: startedAt,
  });
  const completedAt = now();
  const methodologyVersion = options.methodologyVersion
    ?? ROBINHOOD_CHAIN_HISTORY_METHODOLOGY_VERSION;
  const observations = metricObservationsFromRobinhoodChain(
    { fundamentals, credit, community, snapshot },
    completedAt,
    methodologyVersion,
  );

  assertInternalResearchAllowed(observations);
  const persisted = await appendUnique(args.store, observations);
  const statuses = [fundamentals.status, credit.status, community.status];
  const status = statuses.every((value) => value === "valid")
    && !fundamentals.stale
    && !credit.stale
    && !community.stale
    ? "complete"
    : statuses.every((value) => value === "unavailable")
      ? "failed"
      : "partial";
  const gapCodes = uniqueSorted(snapshot.gaps.map((gap) => gap.code));
  const staleFamilies = [
    fundamentals.stale ? "defillama" : null,
    credit.stale ? "morpho" : null,
    community.stale ? "community" : null,
  ].filter((value): value is string => value !== null);

  return {
    collector_id: ROBINHOOD_CHAIN_COLLECTOR_ID,
    collector_version: ROBINHOOD_CHAIN_COLLECTOR_VERSION,
    methodology_version: methodologyVersion,
    status,
    started_at: startedAt.toISOString(),
    completed_at: completedAt.toISOString(),
    snapshot_as_of: snapshot.as_of,
    emitted_observation_ids: persisted.emitted,
    emitted_observation_count: persisted.emitted.length,
    skipped_duplicate_ids: persisted.skipped,
    skipped_duplicate_count: persisted.skipped.length,
    source_families: {
      defillama: familySummary(fundamentals),
      morpho: familySummary(credit),
      community: familySummary(community),
    },
    gaps: gapCodes,
    stale_families: staleFamilies,
  };
}

export async function runRobinhoodChainCollectCli(
  env: EnvConfig,
  options: RobinhoodChainCollectorOptions = {},
): Promise<RobinhoodChainCollectionRunResult & {
  mode: "robinhood-chain-collect";
  path: string;
  distribution_scope: "internal_research_only";
}> {
  const path = env.intelligenceHistoryPath;
  if (!path) throw new Error("intelligenceHistoryPath is required for robinhood-chain-collect");
  const result = await runRobinhoodChainCollectionOnce({
    env,
    store: new JsonlMetricObservationStore(path),
    options,
  });
  return {
    mode: "robinhood-chain-collect",
    path,
    distribution_scope: "internal_research_only",
    ...result,
  };
}
