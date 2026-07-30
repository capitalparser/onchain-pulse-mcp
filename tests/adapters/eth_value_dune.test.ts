import { afterEach, describe, expect, it, vi } from "vitest";
import { makeContext } from "../../src/adapters/base.js";
import type { EnvConfig } from "../../src/env.js";
import {
  fetchDuneEthValue,
  type DuneEthValueInput,
} from "../../src/adapters/eth_value_dune.js";

const validInput: DuneEthValueInput = {
  cutoffDay: "2026-07-29",
  windowDays: 7,
  includeRollups: false,
  allowExecution: true,
};

const currentSummary = {
  row_type: "summary",
  rollup: null,
  period: "current",
  gross_l1_fees_eth: "130",
  base_fee_burn_eth: "100",
  blob_fee_burn_eth: "10",
  priority_fee_eth: "20",
  l2_rent_paid_eth: "50",
  l2_calldata_fee_eth: "20",
  l2_blob_fee_eth: "25",
  l2_verification_fee_eth: "5",
  base_component_present: true,
  blob_component_present: true,
  priority_component_present: true,
  l2_reconciled: true,
};

const previousSummary = {
  row_type: "summary",
  rollup: null,
  period: "previous",
  gross_l1_fees_eth: "103",
  base_fee_burn_eth: "80",
  blob_fee_burn_eth: "8",
  priority_fee_eth: "15",
  l2_rent_paid_eth: "40",
  l2_calldata_fee_eth: "18",
  l2_blob_fee_eth: "17",
  l2_verification_fee_eth: "5",
  base_component_present: true,
  blob_component_present: true,
  priority_component_present: true,
  l2_reconciled: true,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function executeResponse() {
  return jsonResponse({
    execution_id: "exec-1",
    state: "QUERY_STATE_PENDING",
  });
}

function statusResponse(state: string) {
  return jsonResponse({
    execution_id: "exec-1",
    query_id: 0,
    state,
    submitted_at: "2026-07-29T00:00:00Z",
    expires_at: "2026-10-27T00:00:00Z",
  });
}

function resultsResponse(rows: unknown[]) {
  return jsonResponse({
    execution_id: "exec-1",
    query_id: 0,
    state: "QUERY_STATE_COMPLETED",
    submitted_at: "2026-07-29T00:00:00Z",
    expires_at: "2026-10-27T00:00:00Z",
    result: { rows },
  });
}

function makeDuneContext(
  fetchImpl: ReturnType<typeof vi.fn>,
  key: string | null = "test-dune-key",
) {
  const env: EnvConfig = {
    byok: {},
    lang: "en",
    historyPath: "/tmp/history.json",
  };
  if (key !== null) Object.assign(env.byok, { dune: key });
  return makeContext({ env, fetchImpl: fetchImpl as typeof fetch });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("fetchDuneEthValue execution", () => {
  it("submits once at the small tier, polls to completion, and parses both periods", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(executeResponse())
      .mockResolvedValueOnce(statusResponse("QUERY_STATE_PENDING"))
      .mockResolvedValueOnce(statusResponse("QUERY_STATE_COMPLETED"))
      .mockResolvedValueOnce(resultsResponse([currentSummary, previousSummary]));

    const result = await fetchDuneEthValue(validInput, makeDuneContext(fetchImpl), {
      pollIntervalMs: 0,
      timeoutMs: 100,
      now: () => 0,
      wait: async () => {},
    });

    expect(result).toMatchObject({
      status: "valid",
      cutoffDay: "2026-07-29",
      stale: false,
      executionId: "exec-1",
      current: {
        grossL1Fees: 130,
        baseFeeBurn: 100,
        blobFeeBurn: 10,
        priorityFee: 20,
        l2Rent: 50,
      },
      previous: {
        grossL1Fees: 103,
        baseFeeBurn: 80,
        blobFeeBurn: 8,
        priorityFee: 15,
        l2Rent: 40,
      },
      gaps: [],
    });

    const calls = fetchImpl.mock.calls as unknown as Array<
      [string | URL | Request, RequestInit | undefined]
    >;
    const executeCalls = calls.filter(([url]) =>
      String(url).endsWith("/api/v1/sql/execute"),
    );
    expect(executeCalls).toHaveLength(1);
    expect(executeCalls[0]?.[1]?.method).toBe("POST");
    expect(JSON.parse(String(executeCalls[0]?.[1]?.body))).toMatchObject({
      performance: "small",
    });
    expect(JSON.parse(String(executeCalls[0]?.[1]?.body)).sql).toContain(
      "DATE '2026-07-29'",
    );
    expect(new Headers(executeCalls[0]?.[1]?.headers).get("X-DUNE-API-KEY")).toBe(
      "test-dune-key",
    );
  });

  it("shares one execution for concurrent identical requests", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(executeResponse())
      .mockResolvedValueOnce(statusResponse("QUERY_STATE_COMPLETED"))
      .mockResolvedValueOnce(resultsResponse([currentSummary, previousSummary]));
    const ctx = makeDuneContext(fetchImpl);

    const [first, second] = await Promise.all([
      fetchDuneEthValue(validInput, ctx, { pollIntervalMs: 0, wait: async () => {} }),
      fetchDuneEthValue(validInput, ctx, { pollIntervalMs: 0, wait: async () => {} }),
    ]);

    expect(second).toEqual(first);
    expect(
      fetchImpl.mock.calls.filter(([url]) =>
        String(url).endsWith("/api/v1/sql/execute"),
      ),
    ).toHaveLength(1);
  });

  it("uses a completed authorized result from cache in free mode", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(executeResponse())
      .mockResolvedValueOnce(statusResponse("QUERY_STATE_COMPLETED"))
      .mockResolvedValueOnce(resultsResponse([currentSummary, previousSummary]));
    const ctx = makeDuneContext(fetchImpl);

    const paid = await fetchDuneEthValue(validInput, ctx, {
      pollIntervalMs: 0,
      wait: async () => {},
    });
    const free = await fetchDuneEthValue(
      { ...validInput, allowExecution: false },
      ctx,
    );

    expect(free).toEqual(paid);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does not make an HTTP call when free mode has no cache", async () => {
    const fetchImpl = vi.fn();
    const result = await fetchDuneEthValue(
      { ...validInput, allowExecution: false },
      makeDuneContext(fetchImpl),
    );

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.status).toBe("unavailable");
    expect(result.gaps.map((gap) => gap.code)).toEqual(["source_access_gap"]);
  });

  it("does not make an HTTP call when paid mode lacks a key", async () => {
    const fetchImpl = vi.fn();
    const result = await fetchDuneEthValue(
      validInput,
      makeDuneContext(fetchImpl, null),
    );

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.gaps.map((gap) => gap.code)).toEqual(["source_access_gap"]);
  });

  it.each([
    "QUERY_STATE_FAILED",
    "QUERY_STATE_CANCELED",
    "QUERY_STATE_CANCELLED",
    "QUERY_STATE_PARTIAL",
  ])("normalizes terminal state %s without resubmitting", async (state) => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(executeResponse())
      .mockResolvedValueOnce(statusResponse(state));
    const ctx = makeDuneContext(fetchImpl);

    const first = await fetchDuneEthValue(validInput, ctx, {
      pollIntervalMs: 0,
      wait: async () => {},
    });
    const second = await fetchDuneEthValue(validInput, ctx);

    expect(first.status).toBe("unavailable");
    expect(first.gaps.map((gap) => gap.code)).toEqual(["dune_execution_failed"]);
    expect(second).toEqual(first);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("times out once and caches the failure cooldown", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(executeResponse())
      .mockImplementation(async () => statusResponse("QUERY_STATE_PENDING"));
    const times = [0, 0, 10, 20];
    const ctx = makeDuneContext(fetchImpl);

    const first = await fetchDuneEthValue(validInput, ctx, {
      pollIntervalMs: 0,
      timeoutMs: 15,
      now: () => times.shift() ?? 20,
      wait: async () => {},
    });
    const second = await fetchDuneEthValue(validInput, ctx);

    expect(first.gaps.map((gap) => gap.code)).toEqual(["dune_execution_timeout"]);
    expect(second).toEqual(first);
    expect(
      fetchImpl.mock.calls.filter(([url]) =>
        String(url).endsWith("/api/v1/sql/execute"),
      ),
    ).toHaveLength(1);
  });

  it("returns a marked stale cache result after a failed refresh", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T00:00:00Z"));
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(executeResponse())
      .mockResolvedValueOnce(statusResponse("QUERY_STATE_COMPLETED"))
      .mockResolvedValueOnce(resultsResponse([currentSummary, previousSummary]))
      .mockRejectedValueOnce(new Error("upstream network secret"));
    const ctx = makeDuneContext(fetchImpl);

    const first = await fetchDuneEthValue(validInput, ctx, {
      pollIntervalMs: 0,
      wait: async () => {},
    });
    vi.advanceTimersByTime(31 * 60_000);
    const fallback = await fetchDuneEthValue(validInput, ctx, {
      pollIntervalMs: 0,
      wait: async () => {},
    });

    expect(first.status).toBe("valid");
    expect(fallback.status).toBe("stale");
    expect(fallback.asOf).toBe(first.asOf);
    expect(fallback.gaps.map((gap) => gap.code)).toEqual([
      "dune_execution_failed",
      "source_stale",
    ]);
    expect(JSON.stringify(fallback)).not.toContain("upstream network secret");
  });
});

describe("fetchDuneEthValue row validation", () => {
  async function resultFor(rows: unknown[], includeRollups = false) {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(executeResponse())
      .mockResolvedValueOnce(statusResponse("QUERY_STATE_COMPLETED"))
      .mockResolvedValueOnce(resultsResponse(rows));
    return fetchDuneEthValue(
      { ...validInput, includeRollups },
      makeDuneContext(fetchImpl),
      { pollIntervalMs: 0, wait: async () => {} },
    );
  }

  it("nulls fee metrics and reports schema drift when a component key is absent", async () => {
    const result = await resultFor([
      { ...currentSummary, blob_component_present: false },
      previousSummary,
    ]);

    expect(result.current.baseFeeBurn).toBe(100);
    expect(result.current.blobFeeBurn).toBeNull();
    expect(result.current.grossL1Fees).toBeNull();
    expect(result.gaps.map((gap) => gap.code)).toContain("dune_schema_drift");
  });

  it("nulls L2 metrics when components do not reconcile", async () => {
    const result = await resultFor([
      { ...currentSummary, l2_reconciled: false },
      previousSummary,
    ]);

    expect(result.current.l2Rent).toBeNull();
    expect(result.current.l2BlobFee).toBeNull();
    expect(result.gaps.map((gap) => gap.code)).toContain("dune_schema_drift");
  });

  it("rejects duplicate or missing summary periods", async () => {
    const duplicate = await resultFor([currentSummary, currentSummary]);
    const missing = await resultFor([currentSummary]);

    expect(duplicate.status).toBe("unavailable");
    expect(missing.status).toBe("unavailable");
    expect(duplicate.gaps.map((gap) => gap.code)).toContain("dune_schema_drift");
    expect(missing.gaps.map((gap) => gap.code)).toContain("dune_schema_drift");
  });

  it("rejects a missing required result column", async () => {
    const { base_fee_burn_eth: _omitted, ...malformed } = currentSummary;
    const result = await resultFor([malformed, previousSummary]);

    expect(result.status).toBe("unavailable");
    expect(result.gaps.map((gap) => gap.code)).toContain("dune_schema_drift");
  });

  it("groups complete rollup periods only when requested", async () => {
    const rollupCurrent = {
      ...currentSummary,
      row_type: "rollup",
      rollup: "Base",
      gross_l1_fees_eth: null,
      base_fee_burn_eth: null,
      blob_fee_burn_eth: null,
      priority_fee_eth: null,
      base_component_present: null,
      blob_component_present: null,
      priority_component_present: null,
    };
    const rollupPrevious = { ...rollupCurrent, period: "previous" };

    const result = await resultFor(
      [currentSummary, previousSummary, rollupCurrent, rollupPrevious],
      true,
    );

    expect(result.rollups).toEqual([
      {
        name: "Base",
        current: {
          grossL1Fees: null,
          baseFeeBurn: null,
          blobFeeBurn: null,
          priorityFee: null,
          l2Rent: 50,
          l2CalldataFee: 20,
          l2BlobFee: 25,
          l2VerificationFee: 5,
        },
        previous: {
          grossL1Fees: null,
          baseFeeBurn: null,
          blobFeeBurn: null,
          priorityFee: null,
          l2Rent: 50,
          l2CalldataFee: 20,
          l2BlobFee: 25,
          l2VerificationFee: 5,
        },
      },
    ]);
  });

  it("never includes the API key or upstream body in failures", async () => {
    const key = "super-secret-dune-key";
    const fetchImpl = vi.fn(async () =>
      new Response(`body contains ${key}`, { status: 500 }),
    );
    const result = await fetchDuneEthValue(
      validInput,
      makeDuneContext(fetchImpl, key),
    );

    expect(JSON.stringify(result)).not.toContain(key);
    expect(JSON.stringify(result)).not.toContain("body contains");
  });
});
