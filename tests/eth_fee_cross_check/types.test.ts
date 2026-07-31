import { describe, expect, it } from "vitest";
import {
  EthFeeCrossCheckSnapshotSchema,
  ExactEthAmountSchema,
  GetEthFeeCrossCheckInputSchema,
  type EthFeeCrossCheckSnapshot,
} from "../../src/eth_fee_cross_check/types.js";

function exact(wei: string, eth: string) {
  return { wei, eth };
}

function validSnapshot(): EthFeeCrossCheckSnapshot {
  return {
    status: "verified",
    summary: "Verified finalized Ethereum execution fees.",
    methodology: "eth-execution-fee-cross-check-v1",
    requested_range: { start_block: 100, end_block: 101, max_blocks: 64 },
    verified_range: {
      start_block: 100,
      end_block: 101,
      finalized_block: 102,
      block_count: 2,
      transaction_count: 3,
    },
    metrics: {
      execution_fee: exact("146", "0.000000000000000146"),
      base_fee_burn: exact("130", "0.00000000000000013"),
      priority_fee: exact("16", "0.000000000000000016"),
      blob_fee_burn: exact("21", "0.000000000000000021"),
      gross_fee: exact("167", "0.000000000000000167"),
      total_burn: exact("151", "0.000000000000000151"),
    },
    identities: {
      execution_equals_base_plus_priority: true,
      gross_equals_execution_plus_blob: true,
      total_burn_equals_base_plus_blob: true,
    },
    sources: ["Ethereum Execution JSON-RPC"],
    source_status: [
      {
        source: "ethereum_execution_rpc",
        role: "finalized block and receipt evidence",
        as_of: "2026-07-31T00:00:00Z",
        stale: false,
      },
    ],
    gaps: [],
    capabilities: { ethereum_rpc_active: true },
  };
}

function blockRow(
  blockNumber: number,
  blockHash: string,
  transactionCount: number,
  metrics: {
    executionFee: [string, string];
    baseFeeBurn: [string, string];
    priorityFee: [string, string];
    blobFeeBurn: [string, string];
    grossFee: [string, string];
    totalBurn: [string, string];
  },
) {
  return {
    block_number: blockNumber,
    block_hash: blockHash,
    transaction_count: transactionCount,
    metrics: {
      execution_fee: exact(...metrics.executionFee),
      base_fee_burn: exact(...metrics.baseFeeBurn),
      priority_fee: exact(...metrics.priorityFee),
      blob_fee_burn: exact(...metrics.blobFeeBurn),
      gross_fee: exact(...metrics.grossFee),
      total_burn: exact(...metrics.totalBurn),
    },
  };
}

function validBlockRows() {
  return [
    blockRow(100, `0x${"64".padStart(64, "0")}`, 2, {
      executionFee: ["62", "0.000000000000000062"],
      baseFeeBurn: ["50", "0.00000000000000005"],
      priorityFee: ["12", "0.000000000000000012"],
      blobFeeBurn: ["0", "0"],
      grossFee: ["62", "0.000000000000000062"],
      totalBurn: ["50", "0.00000000000000005"],
    }),
    blockRow(101, `0x${"65".padStart(64, "0")}`, 1, {
      executionFee: ["84", "0.000000000000000084"],
      baseFeeBurn: ["80", "0.00000000000000008"],
      priorityFee: ["4", "0.000000000000000004"],
      blobFeeBurn: ["21", "0.000000000000000021"],
      grossFee: ["105", "0.000000000000000105"],
      totalBurn: ["101", "0.000000000000000101"],
    }),
  ];
}

describe("GetEthFeeCrossCheckInputSchema", () => {
  it("accepts an inclusive 64-block range and applies include_blocks=false", () => {
    expect(GetEthFeeCrossCheckInputSchema.parse({ start_block: 0, end_block: 63 })).toEqual({
      start_block: 0,
      end_block: 63,
      include_blocks: false,
    });
  });

  it.each([
    [{ start_block: 1, end_block: 0 }],
    [{ start_block: 0, end_block: 64 }],
    [{ start_block: -1, end_block: 0 }],
    [{ start_block: 0.5, end_block: 1 }],
    [{ start_block: Number.MAX_SAFE_INTEGER + 1, end_block: Number.MAX_SAFE_INTEGER + 1 }],
    [{ start_block: 1, end_block: 1, extra: true }],
  ])("rejects invalid bounded ranges: %j", (input) => {
    expect(() => GetEthFeeCrossCheckInputSchema.parse(input)).toThrow();
  });
});

describe("ExactEthAmountSchema", () => {
  it("accepts canonical unsigned wei and an exact decimal ETH representation", () => {
    expect(ExactEthAmountSchema.parse(exact("1000000000000000001", "1.000000000000000001"))).toEqual(
      exact("1000000000000000001", "1.000000000000000001"),
    );
  });

  it.each([
    exact("01", "0.000000000000000001"),
    exact("-1", "-0.000000000000000001"),
    exact("1", "1.0000000000000000000"),
    exact("1", "1e-18"),
    exact("1", "0.000000000000000002"),
  ])("rejects non-exact public amount shapes", (amount) => {
    expect(ExactEthAmountSchema.safeParse(amount).success).toBe(false);
  });
});

describe("EthFeeCrossCheckSnapshotSchema", () => {
  it("accepts the verified public snapshot contract without block rows", () => {
    const candidate = validSnapshot();
    expect(EthFeeCrossCheckSnapshotSchema.parse(candidate)).toEqual(candidate);
  });

  it("accepts block rows only when they exactly reconcile with verified range and aggregate metrics", () => {
    const candidate = validSnapshot() as unknown as Record<string, unknown>;
    candidate.blocks = validBlockRows();
    expect(EthFeeCrossCheckSnapshotSchema.parse(candidate)).toEqual(candidate);
  });

  it.each([
    ["an unordered requested range", (candidate: Record<string, unknown>) => {
      (candidate.requested_range as Record<string, unknown>).end_block = 99;
    }],
    ["a requested range above the 64-block cap", (candidate: Record<string, unknown>) => {
      (candidate.requested_range as Record<string, unknown>).end_block = 164;
    }],
    ["a verified start that differs from request", (candidate: Record<string, unknown>) => {
      (candidate.verified_range as Record<string, unknown>).start_block = 99;
    }],
    ["a verified end that differs from request", (candidate: Record<string, unknown>) => {
      (candidate.verified_range as Record<string, unknown>).end_block = 100;
    }],
    ["a finalized head below the verified end", (candidate: Record<string, unknown>) => {
      (candidate.verified_range as Record<string, unknown>).finalized_block = 100;
    }],
    ["an incorrect inclusive block count", (candidate: Record<string, unknown>) => {
      (candidate.verified_range as Record<string, unknown>).block_count = 1;
    }],
    ["true identity flags with non-identity aggregate amounts", (candidate: Record<string, unknown>) => {
      (candidate.metrics as Record<string, unknown>).gross_fee = exact("168", "0.000000000000000168");
    }],
  ])("rejects %s", (_name, mutate) => {
    const candidate = validSnapshot() as unknown as Record<string, unknown>;
    mutate(candidate);
    expect(EthFeeCrossCheckSnapshotSchema.safeParse(candidate).success).toBe(false);
  });

  it.each([
    ["empty block rows", (candidate: Record<string, unknown>) => { candidate.blocks = []; }],
    ["rows in reverse order", (candidate: Record<string, unknown>) => { candidate.blocks = validBlockRows().reverse(); }],
    ["a row transaction count that does not reconcile", (candidate: Record<string, unknown>) => {
      const rows = validBlockRows();
      rows[1]!.transaction_count = 2;
      candidate.blocks = rows;
    }],
    ["row metrics that do not reconcile", (candidate: Record<string, unknown>) => {
      const rows = validBlockRows();
      rows[1]!.metrics.gross_fee = exact("106", "0.000000000000000106");
      candidate.blocks = rows;
    }],
  ])("rejects %s", (_name, mutate) => {
    const candidate = validSnapshot() as unknown as Record<string, unknown>;
    mutate(candidate);
    expect(EthFeeCrossCheckSnapshotSchema.safeParse(candidate).success).toBe(false);
  });

  it("rejects partial metrics for an unavailable response", () => {
    const candidate = validSnapshot() as unknown as Record<string, unknown>;
    candidate.status = "unavailable";
    candidate.verified_range = null;
    candidate.identities = null;
    candidate.metrics = {
      execution_fee: exact("1", "0.000000000000000001"),
      base_fee_burn: null,
      priority_fee: null,
      blob_fee_burn: null,
      gross_fee: null,
      total_burn: null,
    };
    expect(EthFeeCrossCheckSnapshotSchema.safeParse(candidate).success).toBe(false);
  });

  it("accepts an unavailable response only with null metrics and no block rows", () => {
    const candidate = validSnapshot() as unknown as Record<string, unknown>;
    candidate.status = "unavailable";
    candidate.verified_range = null;
    candidate.identities = null;
    candidate.metrics = {
      execution_fee: null,
      base_fee_burn: null,
      priority_fee: null,
      blob_fee_burn: null,
      gross_fee: null,
      total_burn: null,
    };
    candidate.gaps = [{ code: "rpc_access_gap", detail: "Provider is unavailable." }];
    candidate.sources = [];
    candidate.source_status = [];
    expect(EthFeeCrossCheckSnapshotSchema.parse(candidate)).toEqual(candidate);
  });

  it.each([
    ["no bounded gap", (candidate: Record<string, unknown>) => { candidate.gaps = []; }],
    ["source provenance", (candidate: Record<string, unknown>) => {
      candidate.gaps = [{ code: "rpc_access_gap", detail: "Provider is unavailable." }];
    }],
  ])("rejects unavailable output with %s", (_name, mutate) => {
    const candidate = validSnapshot() as unknown as Record<string, unknown>;
    candidate.status = "unavailable";
    candidate.verified_range = null;
    candidate.identities = null;
    candidate.metrics = {
      execution_fee: null,
      base_fee_burn: null,
      priority_fee: null,
      blob_fee_burn: null,
      gross_fee: null,
      total_burn: null,
    };
    mutate(candidate);
    expect(EthFeeCrossCheckSnapshotSchema.safeParse(candidate).success).toBe(false);
  });
});
