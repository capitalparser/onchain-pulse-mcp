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
  ])("rejects non-exact public amount shapes", (amount) => {
    expect(ExactEthAmountSchema.safeParse(amount).success).toBe(false);
  });
});

describe("EthFeeCrossCheckSnapshotSchema", () => {
  it("accepts the verified public snapshot contract without block rows", () => {
    const candidate = validSnapshot();
    expect(EthFeeCrossCheckSnapshotSchema.parse(candidate)).toEqual(candidate);
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
    expect(EthFeeCrossCheckSnapshotSchema.parse(candidate)).toEqual(candidate);
  });
});
