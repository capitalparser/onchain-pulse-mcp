import { describe, expect, it } from "vitest";
import {
  buildUnavailableEigenLayerEthRestakingExposureSnapshot,
  buildVerifiedEigenLayerEthRestakingExposureSnapshot,
} from "../../src/eigenlayer_eth_restaking/metrics.js";
import {
  EIGENLAYER_CORE_CONTRACTS,
  EIGENLAYER_ETH_LST_STRATEGIES,
  type EigenLayerRestakingSourceStatus,
} from "../../src/eigenlayer_eth_restaking/types.js";
import { getEigenLayerEthRestakingExposure } from "../../src/tools/get_eigenlayer_eth_restaking_exposure.js";

const address = (value: number) => `0x${value.toString(16).padStart(40, "0")}`;
const sourceStatus: EigenLayerRestakingSourceStatus[] = [{
  source: "ethereum_rpc",
  role: "eigenlayer_finalized_restaking_exposure_evidence",
  stale: false,
}];
const core = {
  strategyManager: EIGENLAYER_CORE_CONTRACTS.strategy_manager,
  eigenPodManager: EIGENLAYER_CORE_CONTRACTS.eigen_pod_manager,
  delegationManager: EIGENLAYER_CORE_CONTRACTS.delegation_manager,
  beaconChainEthStrategy: EIGENLAYER_CORE_CONTRACTS.beacon_chain_eth_strategy,
  strategyManagerDelegation: EIGENLAYER_CORE_CONTRACTS.delegation_manager,
  eigenPodManagerDelegation: EIGENLAYER_CORE_CONTRACTS.delegation_manager,
} as const;

function verified(stale = false) {
  return buildVerifiedEigenLayerEthRestakingExposureSnapshot({
    block: { number: 1, hash: `0x${"a".repeat(64)}`, timestamp: 1 },
    core,
    strategies: EIGENLAYER_ETH_LST_STRATEGIES.map((fixed, index) => ({
      ...fixed,
      underlyingToken: address(index + 1),
      decimals: index === 0 ? 8 : 18,
      whitelisted: index % 2 === 0,
      strategyManager: EIGENLAYER_CORE_CONTRACTS.strategy_manager,
      totalShares: BigInt(index + 10),
      tokenCustody: BigInt(index + 20),
      shareAccountingUnderlying: BigInt(index === 0 ? 21 : index + 15),
    })),
    numPods: 12n,
    burnableEthShares: 3n,
    sources: ["ethereum_rpc"],
    sourceStatus,
    stale,
  });
}

describe("getEigenLayerEthRestakingExposure", () => {
  it("localizes and sanitizes verified exposure without widening the measurement", () => {
    const result = getEigenLayerEthRestakingExposure({
      lang: "en",
      adapterSnapshot: { ...verified(), summary: "https://rpc.example/credential-secret" },
    });
    expect(result.summary).toContain("Fixed legacy EigenLayer ETH-family LST strategy token-unit exposure and native-restaking diagnostics were verified");
    expect(result.summary).toMatch(/does not measure a native-restaked ETH total, an ETH-equivalent LST total, unique or net ETH locked, combined Aave\/Spark\/Lido\/Sky\/EigenLayer demand, or a rehypothecation ratio/i);
    expect(result.summary).toContain("not executable withdrawal capacity");
    expect(JSON.stringify(result)).not.toContain("credential-secret");
    expect(result.metrics).toEqual({
      native_restaked_eth_wei: null,
      lst_restaked_eth_equivalent_wei: null,
      eigenlayer_eth_family_exposure_eth_wei: null,
      unique_net_eth_locked: null,
      combined_aave_spark_lido_sky_eigenlayer_demand: null,
      rehypothecation_ratio: null,
    });
  });

  it("localizes verified, stale, and unavailable evidence in English and Korean", () => {
    const unavailable = buildUnavailableEigenLayerEthRestakingExposureSnapshot({
      summary: "https://rpc.example/credential-secret",
      gaps: [{ code: "rpc_access_gap", detail: "bounded" }],
      sources: ["ethereum_rpc"],
      sourceStatus,
    });
    const cases = [
      getEigenLayerEthRestakingExposure({ lang: "en", adapterSnapshot: { ...verified(), summary: "https://rpc.example/credential-secret" } }),
      getEigenLayerEthRestakingExposure({ lang: "en", adapterSnapshot: { ...verified(true), summary: "https://rpc.example/credential-secret" } }),
      getEigenLayerEthRestakingExposure({ lang: "en", adapterSnapshot: unavailable }),
      getEigenLayerEthRestakingExposure({ lang: "ko", adapterSnapshot: { ...verified(), summary: "https://rpc.example/credential-secret" } }),
      getEigenLayerEthRestakingExposure({ lang: "ko", adapterSnapshot: { ...verified(true), summary: "https://rpc.example/credential-secret" } }),
      getEigenLayerEthRestakingExposure({ lang: "ko", adapterSnapshot: unavailable }),
    ];
    for (const result of cases) {
      expect(result.summary).toMatch(/fixed legacy EigenLayer ETH-family LST strategy token-unit exposure and native-restaking diagnostics|고정된 레거시 EigenLayer ETH 계열 LST 전략 토큰 단위 익스포저와 네이티브 재스테이킹 진단/i);
      expect(JSON.stringify(result)).not.toContain("credential-secret");
    }
    expect(cases[1]!.summary).toContain("used after refresh failure");
    expect(cases[2]!.summary).toContain("are unavailable");
    for (const result of cases.slice(0, 3)) {
      expect(result.summary).toMatch(/native-restaked ETH total/);
      expect(result.summary).toMatch(/ETH-equivalent LST total/);
      expect(result.summary).toMatch(/unique or net ETH locked/);
      expect(result.summary).toMatch(/Aave\/Spark\/Lido\/Sky\/EigenLayer demand/);
      expect(result.summary).toMatch(/rehypothecation ratio/);
      expect(result.summary).toMatch(/not executable withdrawal capacity/);
    }
    for (const result of cases.slice(3)) {
      expect(result.summary).toMatch(/네이티브 재스테이킹 ETH 총량/);
      expect(result.summary).toMatch(/ETH 환산 LST 총량/);
      expect(result.summary).toMatch(/고유 또는 순 ETH 락업/);
      expect(result.summary).toMatch(/Aave\/Spark\/Lido\/Sky\/EigenLayer 통합 수요/);
      expect(result.summary).toMatch(/재담보화 비율/);
      expect(result.summary).toMatch(/실행 가능한 출금 용량/);
    }
  });
});
