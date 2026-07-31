import { describe, expect, it } from "vitest";
import {
  buildUnavailableLidoPooledEthBackingSnapshot,
  buildVerifiedLidoPooledEthBackingSnapshot,
} from "../../src/lido_pooled_eth_backing/metrics.js";
import { LidoPooledEthBackingSnapshotSchema, type LidoPooledEthBackingSourceStatus } from "../../src/lido_pooled_eth_backing/types.js";
import { getLidoPooledEthBacking } from "../../src/tools/get_lido_pooled_eth_backing.js";

const sourceStatus: LidoPooledEthBackingSourceStatus[] = [{ source: "ethereum_rpc", role: "lido_v4_finalized_accounting_evidence", stale: false }];
const accounting = {
  totalSupply: 37n, totalPooledEther: 37n, totalShares: 50n, externalShares: 10n, externalEther: 7n,
  bufferedEther: 3n, clValidatorsBalanceAtLastReport: 20n, clPendingBalanceAtLastReport: 4n,
  depositedSinceLastReport: 3n, depositedForCurrentReport: 2n,
};

function verified(stale = false) {
  return buildVerifiedLidoPooledEthBackingSnapshot({
    block: { number: 1, hash: `0x${"a".repeat(64)}`, timestamp: 1 }, accounting,
    sources: ["ethereum_rpc"], sourceStatus, stale,
  });
}

describe("getLidoPooledEthBacking", () => {
  it("localizes verified Lido pooled ETH backing in English and preserves every null boundary", () => {
    const result = getLidoPooledEthBacking({ lang: "en", adapterSnapshot: { ...verified(), summary: "https://rpc.example/secret" } });
    expect(result.summary).toBe("Lido pooled ETH backing was verified at a finalized Ethereum block.");
    expect(result.summary).not.toMatch(/all native stake|unique net locked|DeFi collateral|combined Aave\/Spark\/Lido demand/i);
    expect(result.metrics).toMatchObject({
      all_ethereum_native_staked_eth: null, unique_net_eth_locked: null, defi_eth_collateral: null,
      combined_aave_spark_lido_demand: null, rehypothecation_ratio: null,
    });
    expect(JSON.stringify(result)).not.toContain("rpc.example");
    expect(LidoPooledEthBackingSnapshotSchema.parse(result)).toEqual(result);
  });

  it("localizes stale evidence in Korean without broadening the measurement", () => {
    const result = getLidoPooledEthBacking({ lang: "ko", adapterSnapshot: verified(true) });
    expect(result.summary).toBe("새로고침 실패 후 캐시된 최종화 이더리움 블록의 Lido pooled ETH backing을 사용합니다.");
    expect(result.gaps.filter((gap) => gap.code === "source_stale")).toHaveLength(1);
  });

  it("localizes unavailable evidence and rejects fabricated broader data", () => {
    const unavailable = buildUnavailableLidoPooledEthBackingSnapshot({
      summary: "https://rpc.example/secret", gaps: [{ code: "rpc_access_gap", detail: "bounded" }],
      sources: ["ethereum_rpc"], sourceStatus,
    });
    expect(getLidoPooledEthBacking({ lang: "ko", adapterSnapshot: unavailable }).summary).toBe("Lido pooled ETH backing 증거를 현재 사용할 수 없습니다.");
    const fabricated = verified() as unknown as { metrics: { defi_eth_collateral: unknown } };
    fabricated.metrics.defi_eth_collateral = "1";
    expect(() => getLidoPooledEthBacking({ lang: "en", adapterSnapshot: fabricated as never })).toThrow();
  });
});
