import { withCache, type AdapterContext } from "./base.js";
import { shiftUtcDay } from "../eth_value_capture/metrics.js";
import type {
  EthEcosystemCaptureGap,
  EthEcosystemCaptureSourceStatus,
} from "../eth_ecosystem_capture/types.js";

const MASTER_URL = "https://api.growthepie.com/v1/master.json";
const FEES_URL = "https://api.growthepie.com/v1/export/fees.json";
const RENT_URL = "https://api.growthepie.com/v1/export/rent_paid.json";
const STABLES_URL = "https://api.growthepie.com/v1/export/stables_mcap.json";
const CACHE_SPEC = {
  name: "eth_ecosystem_growthepie",
  ttlMs: 30 * 60_000,
  max: 16,
};
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const REQUIRED_METRICS = ["fees", "rent_paid", "stables_mcap"] as const;

export interface GrowThePieEcosystemInput {
  cutoffDay: string;
  windowDays: 7 | 30 | 90;
}

export interface EcosystemPeriodPair {
  current: number | null;
  previous: number | null;
}

export interface GrowThePieEcosystemResult {
  status: "valid" | "partial" | "unavailable";
  cutoffDay: string;
  asOf: string | null;
  metrics: {
    l2UserFeesUsd: EcosystemPeriodPair;
    l2RentPaidUsd: EcosystemPeriodPair;
    l2SettlementCostShare: EcosystemPeriodPair;
    ethereumL1StablecoinSupplyUsd: EcosystemPeriodPair;
    ethereumL2StablecoinSupplyUsd: EcosystemPeriodPair;
    ethereumEcosystemStablecoinSupplyUsd: EcosystemPeriodPair;
  };
  includedL2Origins: string[];
  excludedExternalDaOrigins: string[];
  sources: string[];
  sourceStatus: EthEcosystemCaptureSourceStatus[];
  stale: boolean;
  gaps: EthEcosystemCaptureGap[];
  confidence: number;
}

interface ChainMetadata {
  origin: string;
  launchDate: string;
}

interface MasterCoverage {
  included: ChainMetadata[];
  excludedExternalDaOrigins: string[];
}

interface MetricRow {
  origin: string;
  day: string;
  value: number;
}

class SchemaDriftError extends Error {}
class SourceAccessError extends Error {}

function emptyPair(): EcosystemPeriodPair {
  return { current: null, previous: null };
}

function emptyMetrics(): GrowThePieEcosystemResult["metrics"] {
  return {
    l2UserFeesUsd: emptyPair(),
    l2RentPaidUsd: emptyPair(),
    l2SettlementCostShare: emptyPair(),
    ethereumL1StablecoinSupplyUsd: emptyPair(),
    ethereumL2StablecoinSupplyUsd: emptyPair(),
    ethereumEcosystemStablecoinSupplyUsd: emptyPair(),
  };
}

function sourceStatus(asOf: string | null, stale: boolean): EthEcosystemCaptureSourceStatus[] {
  return [
    { source: "growthepie:master", role: "production chain, rollup, data-availability, and metric coverage metadata", as_of: asOf, stale },
    { source: "growthepie:fees_paid_usd", role: "fees paid by users on included Ethereum-settled L2s", as_of: asOf, stale },
    { source: "growthepie:rent_paid_usd", role: "rent paid by included L2s to Ethereum for data availability and settlement", as_of: asOf, stale },
    { source: "growthepie:stables_mcap", role: "stablecoin supply on Ethereum L1 and included Ethereum-settled L2s", as_of: asOf, stale },
  ];
}

function unavailable(
  input: GrowThePieEcosystemInput,
  gap: EthEcosystemCaptureGap,
): GrowThePieEcosystemResult {
  return {
    status: "unavailable",
    cutoffDay: input.cutoffDay,
    asOf: null,
    metrics: emptyMetrics(),
    includedL2Origins: [],
    excludedExternalDaOrigins: [],
    sources: [],
    sourceStatus: sourceStatus(null, false),
    stale: false,
    gaps: [gap],
    confidence: 0,
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isCanonicalDay(value: string): boolean {
  if (!DAY.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseMaster(body: unknown): MasterCoverage {
  const root = record(body);
  const chains = root === null ? null : record(root.chains);
  if (chains === null) throw new SchemaDriftError();

  const included: ChainMetadata[] = [];
  const excludedExternalDaOrigins: string[] = [];
  for (const [origin, raw] of Object.entries(chains)) {
    const chain = record(raw);
    if (chain === null || chain.deployment !== "PROD") continue;
    if (typeof chain.launch_date !== "string" || !isCanonicalDay(chain.launch_date)) continue;
    const supported = Array.isArray(chain.supported_metrics)
      ? chain.supported_metrics.filter((item): item is string => typeof item === "string")
      : [];
    const supportsRequired = REQUIRED_METRICS.every((metric) => supported.includes(metric));
    if (!supportsRequired) continue;

    const chainType = typeof chain.chain_type === "string" ? chain.chain_type : "";
    const daLayer = typeof chain.da_layer === "string" ? chain.da_layer : "";
    const ethereumDa = daLayer.toLowerCase().includes("ethereum");
    if (chainType === "rollup" && ethereumDa) {
      included.push({ origin, launchDate: chain.launch_date });
      continue;
    }
    if (chainType !== "l1" && origin !== "all_l2s" && !ethereumDa) {
      excludedExternalDaOrigins.push(origin);
    }
  }

  if (included.length === 0) throw new SchemaDriftError();
  return {
    included: included.sort((left, right) => left.origin.localeCompare(right.origin)),
    excludedExternalDaOrigins: [...new Set(excludedExternalDaOrigins)].sort(),
  };
}

function parseMetricRows(body: unknown, acceptedMetricKeys: readonly string[]): MetricRow[] {
  if (!Array.isArray(body)) throw new SchemaDriftError();
  const accepted = new Set(acceptedMetricKeys);
  const rows: MetricRow[] = [];
  const seen = new Set<string>();

  for (const item of body) {
    const row = record(item);
    if (row === null || typeof row.metric_key !== "string") throw new SchemaDriftError();
    if (!accepted.has(row.metric_key)) continue;
    if (
      typeof row.origin_key !== "string" || row.origin_key.length === 0 ||
      typeof row.date !== "string" || !isCanonicalDay(row.date) ||
      typeof row.value !== "number" || !Number.isFinite(row.value) || row.value < 0
    ) {
      throw new SchemaDriftError();
    }
    const key = `${row.origin_key}\u0000${row.date}`;
    if (seen.has(key)) throw new SchemaDriftError();
    seen.add(key);
    rows.push({ origin: row.origin_key, day: row.date, value: row.value });
  }

  if (rows.length === 0) throw new SchemaDriftError();
  return rows;
}

function rowsByOrigin(rows: MetricRow[]): Map<string, Map<string, number>> {
  const output = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const series = output.get(row.origin) ?? new Map<string, number>();
    series.set(row.day, row.value);
    output.set(row.origin, series);
  }
  return output;
}

function aggregateFlow(
  series: Map<string, Map<string, number>>,
  origins: readonly ChainMetadata[],
  startDay: string,
  endDayExclusive: string,
): { value: number | null; missing: string[] } {
  let total = 0;
  const missing: string[] = [];
  for (const origin of origins) {
    const rows = series.get(origin.origin);
    for (let day = startDay; day < endDayExclusive; day = shiftUtcDay(day, 1)) {
      if (day < origin.launchDate) continue;
      const value = rows?.get(day);
      if (value === undefined) {
        missing.push(`${origin.origin}:${day}`);
        continue;
      }
      total += value;
      if (!Number.isFinite(total) || total < 0) throw new SchemaDriftError();
    }
  }
  return { value: missing.length === 0 ? total : null, missing };
}

function aggregateStock(
  series: Map<string, Map<string, number>>,
  origins: readonly ChainMetadata[],
  day: string,
): { value: number | null; missing: string[] } {
  let total = 0;
  const missing: string[] = [];
  for (const origin of origins) {
    if (day < origin.launchDate) continue;
    const value = series.get(origin.origin)?.get(day);
    if (value === undefined) {
      missing.push(`${origin.origin}:${day}`);
      continue;
    }
    total += value;
    if (!Number.isFinite(total) || total < 0) throw new SchemaDriftError();
  }
  return { value: missing.length === 0 ? total : null, missing };
}

function pair(current: number | null, previous: number | null): EcosystemPeriodPair {
  return { current, previous };
}

function ratioPair(
  currentNumerator: number | null,
  currentDenominator: number | null,
  previousNumerator: number | null,
  previousDenominator: number | null,
): EcosystemPeriodPair {
  const current = currentNumerator !== null && currentDenominator !== null && currentDenominator !== 0
    ? currentNumerator / currentDenominator
    : null;
  const previous = previousNumerator !== null && previousDenominator !== null && previousDenominator !== 0
    ? previousNumerator / previousDenominator
    : null;
  return pair(current, previous);
}

function addPair(left: EcosystemPeriodPair, right: EcosystemPeriodPair): EcosystemPeriodPair {
  return pair(
    left.current !== null && right.current !== null ? left.current + right.current : null,
    left.previous !== null && right.previous !== null ? left.previous + right.previous : null,
  );
}

function summarizeMissing(label: string, values: string[]): string {
  const examples = values.slice(0, 3).join(", ");
  return `${label} is missing ${values.length} required origin-day observation${values.length === 1 ? "" : "s"}${examples.length > 0 ? `; examples: ${examples}` : ""}.`;
}

async function fetchJson(fetchImpl: typeof fetch, url: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url);
  } catch {
    throw new SourceAccessError();
  }
  if (!response.ok) throw new SourceAccessError();
  try {
    return await response.json();
  } catch {
    throw new SourceAccessError();
  }
}

async function loadEcosystem(
  input: GrowThePieEcosystemInput,
  ctx: AdapterContext,
): Promise<GrowThePieEcosystemResult> {
  if (!isCanonicalDay(input.cutoffDay)) throw new SchemaDriftError();
  const [masterBody, feesBody, rentBody, stablesBody] = await Promise.all([
    fetchJson(ctx.fetch, MASTER_URL),
    fetchJson(ctx.fetch, FEES_URL),
    fetchJson(ctx.fetch, RENT_URL),
    fetchJson(ctx.fetch, STABLES_URL),
  ]);

  const coverage = parseMaster(masterBody);
  const fees = rowsByOrigin(parseMetricRows(feesBody, ["fees_paid_usd"]));
  const rent = rowsByOrigin(parseMetricRows(rentBody, ["rent_paid_usd"]));
  const stables = rowsByOrigin(parseMetricRows(stablesBody, ["stables_mcap", "stables_mcap_usd"]));
  const combinedStart = shiftUtcDay(input.cutoffDay, -2 * input.windowDays);
  const currentStart = shiftUtcDay(input.cutoffDay, -input.windowDays);
  const currentStockDay = shiftUtcDay(input.cutoffDay, -1);
  const previousStockDay = shiftUtcDay(currentStart, -1);

  const feeCurrent = aggregateFlow(fees, coverage.included, currentStart, input.cutoffDay);
  const feePrevious = aggregateFlow(fees, coverage.included, combinedStart, currentStart);
  const rentCurrent = aggregateFlow(rent, coverage.included, currentStart, input.cutoffDay);
  const rentPrevious = aggregateFlow(rent, coverage.included, combinedStart, currentStart);
  const ethereumOrigin: ChainMetadata[] = [{ origin: "ethereum", launchDate: "2015-07-30" }];
  const l1StableCurrent = aggregateStock(stables, ethereumOrigin, currentStockDay);
  const l1StablePrevious = aggregateStock(stables, ethereumOrigin, previousStockDay);
  const l2StableCurrent = aggregateStock(stables, coverage.included, currentStockDay);
  const l2StablePrevious = aggregateStock(stables, coverage.included, previousStockDay);

  const l2UserFeesUsd = pair(feeCurrent.value, feePrevious.value);
  const l2RentPaidUsd = pair(rentCurrent.value, rentPrevious.value);
  const ethereumL1StablecoinSupplyUsd = pair(l1StableCurrent.value, l1StablePrevious.value);
  const ethereumL2StablecoinSupplyUsd = pair(l2StableCurrent.value, l2StablePrevious.value);
  const ethereumEcosystemStablecoinSupplyUsd = addPair(
    ethereumL1StablecoinSupplyUsd,
    ethereumL2StablecoinSupplyUsd,
  );
  const l2SettlementCostShare = ratioPair(
    l2RentPaidUsd.current,
    l2UserFeesUsd.current,
    l2RentPaidUsd.previous,
    l2UserFeesUsd.previous,
  );

  const gaps: EthEcosystemCaptureGap[] = [];
  const feeMissing = [...feeCurrent.missing, ...feePrevious.missing];
  const rentMissing = [...rentCurrent.missing, ...rentPrevious.missing];
  const stableMissing = [
    ...l1StableCurrent.missing,
    ...l1StablePrevious.missing,
    ...l2StableCurrent.missing,
    ...l2StablePrevious.missing,
  ];
  if (feeMissing.length > 0) gaps.push({ code: "fees_coverage_gap", detail: summarizeMissing("L2 user fee coverage", feeMissing) });
  if (rentMissing.length > 0) gaps.push({ code: "rent_coverage_gap", detail: summarizeMissing("L2 Ethereum rent coverage", rentMissing) });
  if (stableMissing.length > 0) gaps.push({ code: "stablecoin_coverage_gap", detail: summarizeMissing("Ethereum ecosystem stablecoin coverage", stableMissing) });
  if (l2SettlementCostShare.current === null || l2SettlementCostShare.previous === null) {
    gaps.push({ code: "period_mismatch", detail: "L2 user fees and Ethereum rent could not be aligned into both comparison windows." });
  }

  const pairs = [
    l2UserFeesUsd,
    l2RentPaidUsd,
    l2SettlementCostShare,
    ethereumL1StablecoinSupplyUsd,
    ethereumL2StablecoinSupplyUsd,
    ethereumEcosystemStablecoinSupplyUsd,
  ];
  const allPresent = pairs.every((metric) => metric.current !== null && metric.previous !== null);
  const anyPresent = pairs.some((metric) => metric.current !== null || metric.previous !== null);
  const status: GrowThePieEcosystemResult["status"] = allPresent && gaps.length === 0
    ? "valid"
    : anyPresent
      ? "partial"
      : "unavailable";
  if (status === "partial") {
    gaps.push({ code: "partial_result", detail: "At least one Ethereum ecosystem growth or ETH settlement-capture metric is unavailable." });
  }

  const completePairs = pairs.filter((metric) => metric.current !== null && metric.previous !== null).length;
  return {
    status,
    cutoffDay: input.cutoffDay,
    asOf: `${currentStockDay}T00:00:00Z`,
    metrics: {
      l2UserFeesUsd,
      l2RentPaidUsd,
      l2SettlementCostShare,
      ethereumL1StablecoinSupplyUsd,
      ethereumL2StablecoinSupplyUsd,
      ethereumEcosystemStablecoinSupplyUsd,
    },
    includedL2Origins: coverage.included.map((item) => item.origin),
    excludedExternalDaOrigins: coverage.excludedExternalDaOrigins,
    sources: [
      "growthepie:master",
      "growthepie:fees_paid_usd",
      "growthepie:rent_paid_usd",
      "growthepie:stables_mcap",
    ],
    sourceStatus: sourceStatus(`${currentStockDay}T00:00:00Z`, false),
    stale: false,
    gaps,
    confidence: Number((completePairs / pairs.length).toFixed(2)),
  };
}

function markStale(result: GrowThePieEcosystemResult): GrowThePieEcosystemResult {
  const gaps = [
    ...result.gaps.filter((gap) => gap.code !== "source_stale"),
    { code: "source_stale" as const, detail: "GrowThePie refresh failed; cached ecosystem-capture data was used." },
  ];
  return {
    ...result,
    status: result.status === "valid" ? "partial" : result.status,
    sourceStatus: result.sourceStatus.map((item) => ({ ...item, stale: true })),
    stale: true,
    gaps,
    confidence: Number((result.confidence * 0.75).toFixed(2)),
  };
}

export async function fetchGrowThePieEcosystemCapture(
  input: GrowThePieEcosystemInput,
  ctx: AdapterContext,
): Promise<GrowThePieEcosystemResult> {
  try {
    const result = await withCache(
      ctx.cacheFor<GrowThePieEcosystemResult>(CACHE_SPEC),
      `${input.cutoffDay}:${input.windowDays}`,
      async () => loadEcosystem(input, ctx),
    );
    return result.stale ? markStale(result) : result;
  } catch (error) {
    return error instanceof SchemaDriftError
      ? unavailable(input, {
          code: "growthepie_schema_drift",
          detail: "GrowThePie chain metadata or ecosystem metric rows did not satisfy the bounded contract.",
        })
      : unavailable(input, {
          code: "source_access_gap",
          detail: "GrowThePie ecosystem metadata, fees, rent, or stablecoin response was unavailable.",
        });
  }
}
