import { withCache, type AdapterContext } from "./base.js";
import { shiftUtcDay } from "../eth_value_capture/metrics.js";
import type { EthValueGap } from "../eth_value_capture/types.js";

const GROW_THE_PIE_RENT_URL =
  "https://api.growthepie.com/v1/export/rent_paid.json";
const CACHE_SPEC = {
  name: "eth_value_growthepie",
  ttlMs: 30 * 60_000,
  max: 32,
};
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export interface GrowThePieRentInput {
  cutoffDay: string;
  windowDays: 7 | 30 | 90;
  includeRollups: boolean;
}

export interface GrowThePieRentPeriod {
  l2Rent: number | null;
}

export interface GrowThePieRentRollup {
  name: string;
  current: GrowThePieRentPeriod;
  previous: GrowThePieRentPeriod;
}

export interface GrowThePieRentResult {
  status: "valid" | "stale" | "unavailable";
  cutoffDay: string;
  current: GrowThePieRentPeriod;
  previous: GrowThePieRentPeriod;
  rollups?: GrowThePieRentRollup[];
  asOf: string | null;
  stale: boolean;
  gaps: EthValueGap[];
}

class SchemaDriftError extends Error {}
class SourceAccessError extends Error {}

interface RentRow {
  origin: string;
  day: string;
  value: number;
}

function emptyPeriod(): GrowThePieRentPeriod {
  return { l2Rent: null };
}

function unavailable(
  input: GrowThePieRentInput,
  gap: EthValueGap,
): GrowThePieRentResult {
  return {
    status: "unavailable",
    cutoffDay: input.cutoffDay,
    current: emptyPeriod(),
    previous: emptyPeriod(),
    asOf: null,
    stale: false,
    gaps: [gap],
  };
}

function schemaDrift(input: GrowThePieRentInput): GrowThePieRentResult {
  return unavailable(input, {
    code: "growthepie_schema_drift",
    detail: "GrowThePie rent rows did not satisfy the requested UTC windows.",
  });
}

function sourceUnavailable(input: GrowThePieRentInput): GrowThePieRentResult {
  return unavailable(input, {
    code: "source_access_gap",
    detail: "GrowThePie L2 rent response was unavailable.",
  });
}

function markStale(result: GrowThePieRentResult): GrowThePieRentResult {
  return {
    ...result,
    status: "stale",
    stale: true,
    gaps: [
      ...result.gaps.filter((gap) => gap.code !== "source_stale"),
      {
        code: "source_stale",
        detail: "GrowThePie refresh failed; cached L2 rent data was used.",
      },
    ],
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function isCanonicalDay(value: string): boolean {
  if (!DAY.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function checkedSum(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) {
    total += value;
    if (!Number.isFinite(total) || total < 0) throw new SchemaDriftError();
  }
  return total;
}

function parseRows(body: unknown): RentRow[] {
  if (!Array.isArray(body)) throw new SchemaDriftError();
  const rows: RentRow[] = [];
  const seen = new Set<string>();
  for (const item of body) {
    const row = record(item);
    if (row === null || typeof row.metric_key !== "string") {
      throw new SchemaDriftError();
    }
    if (row.metric_key !== "rent_paid_eth") continue;
    if (
      typeof row.origin_key !== "string" ||
      row.origin_key.length === 0 ||
      typeof row.date !== "string" ||
      !isCanonicalDay(row.date) ||
      typeof row.value !== "number" ||
      !Number.isFinite(row.value) ||
      row.value < 0
    ) {
      throw new SchemaDriftError();
    }
    const key = `${row.origin_key}\u0000${row.date}`;
    if (seen.has(key)) throw new SchemaDriftError();
    seen.add(key);
    rows.push({ origin: row.origin_key, day: row.date, value: row.value });
  }
  return rows;
}

function periodTotal(rows: RentRow[]): GrowThePieRentPeriod {
  return { l2Rent: checkedSum(rows.map((row) => row.value)) };
}

function parseResponse(
  body: unknown,
  input: GrowThePieRentInput,
): GrowThePieRentResult {
  if (!isCanonicalDay(input.cutoffDay)) throw new SchemaDriftError();
  const combinedStart = shiftUtcDay(input.cutoffDay, -2 * input.windowDays);
  const currentStart = shiftUtcDay(input.cutoffDay, -input.windowDays);
  const rows = parseRows(body).filter(
    (row) => row.day >= combinedStart && row.day < input.cutoffDay,
  );
  const days = new Set(rows.map((row) => row.day));
  for (let day = combinedStart; day < input.cutoffDay; day = shiftUtcDay(day, 1)) {
    if (!days.has(day)) throw new SchemaDriftError();
  }

  const previousRows = rows.filter((row) => row.day < currentStart);
  const currentRows = rows.filter((row) => row.day >= currentStart);
  if (previousRows.length === 0 || currentRows.length === 0) {
    throw new SchemaDriftError();
  }
  const result: GrowThePieRentResult = {
    status: "valid",
    cutoffDay: input.cutoffDay,
    current: periodTotal(currentRows),
    previous: periodTotal(previousRows),
    asOf: `${shiftUtcDay(input.cutoffDay, -1)}T00:00:00Z`,
    stale: false,
    gaps: [],
  };
  if (input.includeRollups) {
    const origins = new Set(rows.map((row) => row.origin));
    result.rollups = [...origins]
      .map((name) => {
        const current = currentRows.filter((row) => row.origin === name);
        const previous = previousRows.filter((row) => row.origin === name);
        return { name, current, previous };
      })
      .filter(({ current, previous }) => current.length > 0 && previous.length > 0)
      .map(({ name, current, previous }) => ({
        name,
        current: periodTotal(current),
        previous: periodTotal(previous),
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }
  return result;
}

async function loadRent(
  input: GrowThePieRentInput,
  ctx: AdapterContext,
): Promise<GrowThePieRentResult> {
  let response: Response;
  try {
    response = await ctx.fetch(GROW_THE_PIE_RENT_URL);
  } catch {
    throw new SourceAccessError();
  }
  if (!response.ok) throw new SourceAccessError();
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new SourceAccessError();
  }
  return parseResponse(body, input);
}

export async function fetchGrowThePieRent(
  input: GrowThePieRentInput,
  ctx: AdapterContext,
): Promise<GrowThePieRentResult> {
  try {
    const result = await withCache(
      ctx.cacheFor<GrowThePieRentResult>(CACHE_SPEC),
      `${input.cutoffDay}:${input.windowDays}:${input.includeRollups}`,
      async () => loadRent(input, ctx),
    );
    return result.stale ? markStale(result) : result;
  } catch (error) {
    return error instanceof SchemaDriftError
      ? schemaDrift(input)
      : sourceUnavailable(input);
  }
}
