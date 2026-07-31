import { describe, expect, it } from "vitest";
import { EthFeeCrossCheckSnapshotSchema, type EthFeeCrossCheckSnapshot } from "../../src/eth_fee_cross_check/types.js";
import { getEthFeeCrossCheck } from "../../src/tools/get_eth_fee_cross_check.js";

function verifiedSnapshot(gaps: EthFeeCrossCheckSnapshot["gaps"] = []): EthFeeCrossCheckSnapshot {
  return {
    status: "verified",
    summary: "adapter text must not become the public localized summary",
    methodology: "eth-execution-fee-cross-check-v1",
    requested_range: { start_block: 100, end_block: 100, max_blocks: 64 },
    verified_range: { start_block: 100, end_block: 100, finalized_block: 100, block_count: 1, transaction_count: 1 },
    metrics: {
      execution_fee: { wei: "50", eth: "0.00000000000000005" },
      base_fee_burn: { wei: "50", eth: "0.00000000000000005" },
      priority_fee: { wei: "0", eth: "0" },
      blob_fee_burn: { wei: "0", eth: "0" },
      gross_fee: { wei: "50", eth: "0.00000000000000005" },
      total_burn: { wei: "50", eth: "0.00000000000000005" },
    },
    identities: {
      execution_equals_base_plus_priority: true,
      gross_equals_execution_plus_blob: true,
      total_burn_equals_base_plus_blob: true,
    },
    sources: ["ethereum_execution_rpc"],
    source_status: [{ source: "ethereum_execution_rpc", role: "finalized_execution_fee_evidence", as_of: "block:100", stale: gaps.length > 0 }],
    gaps,
    capabilities: { ethereum_rpc_active: true },
  };
}

describe("getEthFeeCrossCheck", () => {
  it("localizes a verified result in English and validates the adapter boundary", () => {
    const result = getEthFeeCrossCheck({ lang: "en", adapterSnapshot: verifiedSnapshot() });

    expect(result.summary).toBe("Ethereum execution fee evidence was verified against finalized blocks.");
    expect(EthFeeCrossCheckSnapshotSchema.parse(result)).toEqual(result);
  });

  it("localizes a stale verified result in Korean", () => {
    const result = getEthFeeCrossCheck({
      lang: "ko",
      adapterSnapshot: verifiedSnapshot([{ code: "source_stale", detail: "cached evidence" }]),
    });

    expect(result.summary).toBe("새로고침 실패 후 캐시된 최종화 이더리움 실행 수수료 증거를 사용합니다.");
  });

  it("localizes an unavailable result in Korean without exposing adapter text", () => {
    const unavailable = {
      ...verifiedSnapshot(),
      status: "unavailable" as const,
      summary: "https://rpc.example/secret-error",
      verified_range: null,
      identities: null,
      metrics: {
        execution_fee: null, base_fee_burn: null, priority_fee: null,
        blob_fee_burn: null, gross_fee: null, total_burn: null,
      },
      sources: [],
      source_status: [],
      gaps: [{ code: "rpc_access_gap" as const, detail: "sanitized" }],
      capabilities: { ethereum_rpc_active: true },
    };
    const result = getEthFeeCrossCheck({ lang: "ko", adapterSnapshot: unavailable });

    expect(result.summary).toBe("이더리움 실행 수수료 증거를 현재 사용할 수 없습니다.");
    expect(JSON.stringify(result)).not.toContain("rpc.example");
  });
});
