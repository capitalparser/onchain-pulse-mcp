import type { AdapterContext } from "./base.js";
import type {
  EthValueGap,
  EthValueGapCode,
} from "../eth_value_capture/types.js";
import { buildEthValueCaptureSql } from "../queries/eth_value_capture.js";

const DUNE_API_BASE = "https://api.dune.com/api/v1";
const CACHE_SPEC = {
  name: "eth_value_dune",
  ttlMs: 30 * 60_000,
  max: 32,
};
const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_TIMEOUT_MS = 25_000;
const TERMINAL_FAILURE_STATES = new Set([
  "QUERY_STATE_FAILED",
  "QUERY_STATE_CANCELED",
  "QUERY_STATE_CANCELLED",
  "QUERY_STATE_PARTIAL",
]);
const ACTIVE_STATES = new Set([
  "QUERY_STATE_PENDING",
  "QUERY_STATE_EXECUTING",
]);
const REQUIRED_COLUMNS = [
  "row_type",
  "rollup",
  "period",
  "gross_l1_fees_eth",
  "base_fee_burn_eth",
  "blob_fee_burn_eth",
  "priority_fee_eth",
  "l2_rent_paid_eth",
  "l2_calldata_fee_eth",
  "l2_blob_fee_eth",
  "l2_verification_fee_eth",
  "base_component_present",
  "blob_component_present",
  "priority_component_present",
  "l2_reconciled",
] as const;
const EPSILON_ETH = 0.000000001;

export interface DuneEthValueInput {
  cutoffDay: string;
  windowDays: 7 | 30 | 90;
  includeRollups: boolean;
  allowExecution: boolean;
}

export interface DunePeriodValues {
  grossL1Fees: number | null;
  baseFeeBurn: number | null;
  blobFeeBurn: number | null;
  priorityFee: number | null;
  l2Rent: number | null;
  l2CalldataFee: number | null;
  l2BlobFee: number | null;
  l2VerificationFee: number | null;
}

export interface DuneRollupValues {
  name: string;
  current: DunePeriodValues;
  previous: DunePeriodValues;
}

export interface DuneEthValueResult {
  status: "valid" | "stale" | "unavailable";
  cutoffDay: string;
  current: DunePeriodValues;
  previous: DunePeriodValues;
  rollups?: DuneRollupValues[];
  asOf: string | null;
  stale: boolean;
  executionId: string | null;
  gaps: EthValueGap[];
}

export interface DuneAdapterOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
}

class DuneAdapterError extends Error {
  constructor(readonly code: "dune_execution_failed" | "dune_execution_timeout") {
    super("Dune execution was unavailable.");
  }
}

function emptyPeriod(): DunePeriodValues {
  return {
    grossL1Fees: null,
    baseFeeBurn: null,
    blobFeeBurn: null,
    priorityFee: null,
    l2Rent: null,
    l2CalldataFee: null,
    l2BlobFee: null,
    l2VerificationFee: null,
  };
}

function unavailable(
  input: DuneEthValueInput,
  code: EthValueGapCode,
  detail: string,
): DuneEthValueResult {
  return {
    status: "unavailable",
    cutoffDay: input.cutoffDay,
    current: emptyPeriod(),
    previous: emptyPeriod(),
    asOf: null,
    stale: false,
    executionId: null,
    gaps: [{ code, detail }],
  };
}

function accessUnavailable(input: DuneEthValueInput): DuneEthValueResult {
  return unavailable(
    input,
    "source_access_gap",
    "Dune execution was not authorized or DUNE_API_KEY was unavailable.",
  );
}

function failureDetail(
  code: "dune_execution_failed" | "dune_execution_timeout",
): string {
  return code === "dune_execution_timeout"
    ? "Dune execution exceeded the bounded polling timeout."
    : "Dune execution failed before a complete result was available.";
}

function toFailureCode(
  error: unknown,
): "dune_execution_failed" | "dune_execution_timeout" {
  return error instanceof DuneAdapterError
    ? error.code
    : "dune_execution_failed";
}

function markStale(
  result: DuneEthValueResult,
  failureCode?: "dune_execution_failed" | "dune_execution_timeout",
): DuneEthValueResult {
  const gaps: EthValueGap[] = [];
  if (failureCode !== undefined) {
    gaps.push({ code: failureCode, detail: failureDetail(failureCode) });
  }
  gaps.push({
    code: "source_stale",
    detail: "Dune refresh was unavailable; a cached result was used.",
  });
  for (const gap of result.gaps) {
    if (!gaps.some((candidate) => candidate.code === gap.code && candidate.detail === gap.detail)) {
      gaps.push(gap);
    }
  }
  return {
    ...result,
    status: "stale",
    stale: true,
    gaps,
  };
}

function getDuneKey(ctx: AdapterContext): string | undefined {
  return (ctx.env.byok as typeof ctx.env.byok & { dune?: string }).dune;
}

async function duneJson(
  ctx: AdapterContext,
  apiKey: string,
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  let response: Response;
  try {
    response = await ctx.fetch(`${DUNE_API_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-DUNE-API-KEY": apiKey,
        ...init?.headers,
      },
    });
  } catch {
    throw new DuneAdapterError("dune_execution_failed");
  }
  if (!response.ok) {
    throw new DuneAdapterError("dune_execution_failed");
  }
  try {
    return await response.json();
  } catch {
    throw new DuneAdapterError("dune_execution_failed");
  }
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value)) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function closeEnough(left: number, right: number): boolean {
  return Math.abs(left - right) <= EPSILON_ETH;
}

function hasRequiredColumns(row: Record<string, unknown>): boolean {
  return REQUIRED_COLUMNS.every((column) =>
    Object.prototype.hasOwnProperty.call(row, column),
  );
}

interface NormalizedPeriod {
  values: DunePeriodValues;
  drift: boolean;
}

function normalizeSummary(row: Record<string, unknown>): NormalizedPeriod {
  const basePresent = row.base_component_present === true;
  const blobPresent = row.blob_component_present === true;
  const priorityPresent = row.priority_component_present === true;
  const rawBase = finiteNumber(row.base_fee_burn_eth);
  const rawBlob = finiteNumber(row.blob_fee_burn_eth);
  const rawPriority = finiteNumber(row.priority_fee_eth);
  const rawGross = finiteNumber(row.gross_l1_fees_eth);

  const baseFeeBurn = basePresent ? rawBase : null;
  const blobFeeBurn = blobPresent ? rawBlob : null;
  const priorityFee = priorityPresent ? rawPriority : null;
  const componentsValid =
    baseFeeBurn !== null &&
    blobFeeBurn !== null &&
    priorityFee !== null;
  const grossL1Fees =
    componentsValid &&
    rawGross !== null &&
    closeEnough(rawGross, baseFeeBurn + blobFeeBurn + priorityFee)
      ? rawGross
      : null;

  const rawL2Rent = finiteNumber(row.l2_rent_paid_eth);
  const rawL2Calldata = finiteNumber(row.l2_calldata_fee_eth);
  const rawL2Blob = finiteNumber(row.l2_blob_fee_eth);
  const rawL2Verification = finiteNumber(row.l2_verification_fee_eth);
  const l2Valid =
    row.l2_reconciled === true &&
    rawL2Rent !== null &&
    rawL2Calldata !== null &&
    rawL2Blob !== null &&
    rawL2Verification !== null &&
    closeEnough(
      rawL2Rent,
      rawL2Calldata + rawL2Blob + rawL2Verification,
    );

  return {
    values: {
      grossL1Fees,
      baseFeeBurn,
      blobFeeBurn,
      priorityFee,
      l2Rent: l2Valid ? rawL2Rent : null,
      l2CalldataFee: l2Valid ? rawL2Calldata : null,
      l2BlobFee: l2Valid ? rawL2Blob : null,
      l2VerificationFee: l2Valid ? rawL2Verification : null,
    },
    drift:
      !basePresent ||
      !blobPresent ||
      !priorityPresent ||
      !componentsValid ||
      grossL1Fees === null ||
      !l2Valid,
  };
}

function normalizeRollup(row: Record<string, unknown>): NormalizedPeriod {
  const rawL2Rent = finiteNumber(row.l2_rent_paid_eth);
  const rawL2Calldata = finiteNumber(row.l2_calldata_fee_eth);
  const rawL2Blob = finiteNumber(row.l2_blob_fee_eth);
  const rawL2Verification = finiteNumber(row.l2_verification_fee_eth);
  const valid =
    row.l2_reconciled === true &&
    rawL2Rent !== null &&
    rawL2Calldata !== null &&
    rawL2Blob !== null &&
    rawL2Verification !== null &&
    closeEnough(
      rawL2Rent,
      rawL2Calldata + rawL2Blob + rawL2Verification,
    );

  return {
    values: {
      ...emptyPeriod(),
      l2Rent: valid ? rawL2Rent : null,
      l2CalldataFee: valid ? rawL2Calldata : null,
      l2BlobFee: valid ? rawL2Blob : null,
      l2VerificationFee: valid ? rawL2Verification : null,
    },
    drift: !valid,
  };
}

function schemaDriftGap(): EthValueGap {
  return {
    code: "dune_schema_drift",
    detail: "Dune result rows did not satisfy the ETH value-capture schema.",
  };
}

function normalizeRows(args: {
  rows: unknown[];
  input: DuneEthValueInput;
  executionId: string;
  asOf: string;
}): DuneEthValueResult {
  const summary = new Map<string, NormalizedPeriod>();
  const rollupPeriods = new Map<
    string,
    Partial<Record<"current" | "previous", NormalizedPeriod>>
  >();
  let fatal = false;
  let drift = false;

  for (const value of args.rows) {
    const row = objectRecord(value);
    if (row === null || !hasRequiredColumns(row)) {
      fatal = true;
      continue;
    }
    const period =
      row.period === "current" || row.period === "previous"
        ? row.period
        : null;
    if (period === null) {
      fatal = true;
      continue;
    }

    if (row.row_type === "summary") {
      if (summary.has(period)) {
        fatal = true;
        continue;
      }
      const normalized = normalizeSummary(row);
      drift ||= normalized.drift;
      summary.set(period, normalized);
      continue;
    }

    if (row.row_type === "rollup" && args.input.includeRollups) {
      if (typeof row.rollup !== "string" || row.rollup.length === 0) {
        fatal = true;
        continue;
      }
      const periods = rollupPeriods.get(row.rollup) ?? {};
      if (periods[period] !== undefined) {
        fatal = true;
        continue;
      }
      const normalized = normalizeRollup(row);
      drift ||= normalized.drift;
      periods[period] = normalized;
      rollupPeriods.set(row.rollup, periods);
      continue;
    }

    fatal = true;
  }

  const current = summary.get("current");
  const previous = summary.get("previous");
  if (current === undefined || previous === undefined) fatal = true;

  if (fatal) {
    return {
      ...unavailable(
        args.input,
        "dune_schema_drift",
        schemaDriftGap().detail,
      ),
      asOf: args.asOf,
      executionId: args.executionId,
    };
  }

  const rollups: DuneRollupValues[] = [];
  if (args.input.includeRollups) {
    for (const [name, periods] of [...rollupPeriods.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      if (periods.current === undefined || periods.previous === undefined) {
        drift = true;
        continue;
      }
      rollups.push({
        name,
        current: periods.current.values,
        previous: periods.previous.values,
      });
    }
  }

  return {
    status: "valid",
    cutoffDay: args.input.cutoffDay,
    current: current!.values,
    previous: previous!.values,
    ...(args.input.includeRollups ? { rollups } : {}),
    asOf: args.asOf,
    stale: false,
    executionId: args.executionId,
    gaps: drift ? [schemaDriftGap()] : [],
  };
}

function executionIdFrom(body: unknown): string {
  const record = objectRecord(body);
  const executionId = record?.execution_id;
  if (typeof executionId !== "string" || executionId.length === 0) {
    throw new DuneAdapterError("dune_execution_failed");
  }
  return executionId;
}

function stateFrom(body: unknown): string {
  const state = objectRecord(body)?.state;
  if (typeof state !== "string") {
    throw new DuneAdapterError("dune_execution_failed");
  }
  return state;
}

function rowsFrom(body: unknown): unknown[] {
  const result = objectRecord(objectRecord(body)?.result);
  if (!Array.isArray(result?.rows)) {
    throw new DuneAdapterError("dune_execution_failed");
  }
  return result.rows;
}

async function executeOnce(
  input: DuneEthValueInput,
  ctx: AdapterContext,
  apiKey: string,
  options: DuneAdapterOptions,
): Promise<DuneEthValueResult> {
  const now = options.now ?? Date.now;
  const wait =
    options.wait ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const submitted = await duneJson(ctx, apiKey, "/sql/execute", {
    method: "POST",
    body: JSON.stringify({
      sql: buildEthValueCaptureSql(input),
      performance: "small",
    }),
  });
  const executionId = executionIdFrom(submitted);
  const startedAt = now();

  while (true) {
    const status = await duneJson(
      ctx,
      apiKey,
      `/execution/${encodeURIComponent(executionId)}/status`,
    );
    const state = stateFrom(status);
    if (state === "QUERY_STATE_COMPLETED") break;
    if (TERMINAL_FAILURE_STATES.has(state) || !ACTIVE_STATES.has(state)) {
      throw new DuneAdapterError("dune_execution_failed");
    }
    if (now() - startedAt >= timeoutMs) {
      throw new DuneAdapterError("dune_execution_timeout");
    }
    await wait(pollIntervalMs);
  }

  const result = await duneJson(
    ctx,
    apiKey,
    `/execution/${encodeURIComponent(executionId)}/results`,
  );
  return normalizeRows({
    rows: rowsFrom(result),
    input,
    executionId,
    asOf: new Date(now()).toISOString(),
  });
}

export async function fetchDuneEthValue(
  input: DuneEthValueInput,
  ctx: AdapterContext,
  options: DuneAdapterOptions = {},
): Promise<DuneEthValueResult> {
  const key = `${input.cutoffDay}:${input.windowDays}:${
    input.includeRollups ? "rollups" : "summary"
  }`;
  const cache = ctx.cacheFor<DuneEthValueResult>(CACHE_SPEC);
  const fresh = cache.get(key);
  if (fresh !== undefined) return fresh;

  const stale = cache.getStale(key);
  if (!input.allowExecution) {
    return stale === undefined ? accessUnavailable(input) : markStale(stale);
  }

  const apiKey = getDuneKey(ctx);
  if (apiKey === undefined || apiKey.length === 0) {
    return accessUnavailable(input);
  }

  try {
    return await cache.getOrLoad(key, () =>
      executeOnce(input, ctx, apiKey, options),
    );
  } catch (error) {
    const failureCode = toFailureCode(error);
    const fallback =
      stale === undefined
        ? unavailable(input, failureCode, failureDetail(failureCode))
        : markStale(stale, failureCode);
    cache.set(key, fallback);
    return fallback;
  }
}
