import { describe, expect, it } from "vitest";
import {
  buildUnavailableEigenLayerEthRestakingExposureSnapshot,
  buildVerifiedEigenLayerEthRestakingExposureSnapshot,
  EigenLayerEthRestakingDomainError,
} from "../../src/eigenlayer_eth_restaking/metrics.js";
import {
  EIGENLAYER_CORE_CONTRACTS,
  EIGENLAYER_ETH_LST_STRATEGIES,
} from "../../src/eigenlayer_eth_restaking/types.js";

const address = (value: number) => `0x${value.toString(16).padStart(40, "0")}`;

function evidence() {
  return EIGENLAYER_ETH_LST_STRATEGIES.map((fixed, index) => ({
    ...fixed,
    underlyingToken: address(index + 1),
    decimals: index === 0 ? 8 : 18,
    whitelisted: index % 2 === 0,
    strategyManager: EIGENLAYER_CORE_CONTRACTS.strategy_manager,
    totalShares: BigInt(index + 10),
    tokenCustody: BigInt(index + 20),
    shareAccountingUnderlying: BigInt(index === 0 ? 21 : index + 15),
  }));
}

const core = {
  strategyManager: EIGENLAYER_CORE_CONTRACTS.strategy_manager,
  eigenPodManager: EIGENLAYER_CORE_CONTRACTS.eigen_pod_manager,
  delegationManager: EIGENLAYER_CORE_CONTRACTS.delegation_manager,
  beaconChainEthStrategy: EIGENLAYER_CORE_CONTRACTS.beacon_chain_eth_strategy,
  strategyManagerDelegation: EIGENLAYER_CORE_CONTRACTS.delegation_manager,
  eigenPodManagerDelegation: EIGENLAYER_CORE_CONTRACTS.delegation_manager,
} as const;

describe("EigenLayer ETH restaking exposure metrics", () => {
  it("preserves twelve heterogeneous token-unit observations without fabricating totals", () => {
    const snapshot = buildVerifiedEigenLayerEthRestakingExposureSnapshot({
      block: { number: 1, hash: `0x${"ab".repeat(32)}`, timestamp: 2 },
      core,
      strategies: evidence(),
      numPods: 12n,
      burnableEthShares: 3n,
      sources: ["ethereum_rpc"],
      sourceStatus: [{ source: "ethereum_rpc", role: "eigenlayer_finalized_restaking_exposure_evidence", stale: false }],
    });

    expect(snapshot.strategies).toHaveLength(12);
    expect(snapshot.strategies[0]).toMatchObject({
      label: "stETH",
      decimals: 8,
      whitelisted: true,
      total_shares: "10",
      token_custody: "20",
      share_accounting_underlying: "21",
      share_quote_exceeds_custody: true,
    });
    expect(snapshot.native_diagnostics).toMatchObject({ num_pods: "12", burnable_eth_shares: "3" });
    expect(snapshot.metrics).toEqual({
      native_restaked_eth_wei: null,
      lst_restaked_eth_equivalent_wei: null,
      eigenlayer_eth_family_exposure_eth_wei: null,
      unique_net_eth_locked: null,
      combined_aave_spark_lido_sky_eigenlayer_demand: null,
      rehypothecation_ratio: null,
    });
    expect(snapshot.gaps).toHaveLength(6);
  });

  it("creates unavailable output with one source gap and zero partial evidence", () => {
    const snapshot = buildUnavailableEigenLayerEthRestakingExposureSnapshot({
      summary: "unavailable",
      gaps: [{ code: "rpc_access_gap", detail: "bounded" }],
      sources: ["ethereum_rpc"],
      sourceStatus: [{ source: "ethereum_rpc", role: "eigenlayer_finalized_restaking_exposure_evidence", stale: false }],
    });
    expect(snapshot).toMatchObject({
      status: "unavailable",
      verified_block: null,
      core_contracts: null,
      strategies: [],
      native_diagnostics: null,
      identities: null,
    });
  });

  it("fails closed for substituted, duplicate, malformed, or overflowed strategy evidence", () => {
    const mutations: Array<(value: ReturnType<typeof evidence>) => void> = [
      (value) => { value.reverse(); },
      (value) => { value[1]!.underlyingToken = value[0]!.underlyingToken; },
      (value) => { value[0]!.strategyManager = address(99) as typeof value[0]["strategyManager"]; },
      (value) => { value[0]!.underlyingToken = address(0); },
      (value) => { value[0]!.decimals = 256; },
      (value) => { value[0]!.totalShares = 2n ** 256n; },
    ];
    for (const mutate of mutations) {
      const strategies = evidence();
      mutate(strategies);
      expect(() => buildVerifiedEigenLayerEthRestakingExposureSnapshot({
        block: { number: 1, hash: `0x${"ab".repeat(32)}`, timestamp: 2 },
        core, strategies, numPods: 12n, burnableEthShares: 3n,
        sources: ["ethereum_rpc"],
        sourceStatus: [{ source: "ethereum_rpc", role: "eigenlayer_finalized_restaking_exposure_evidence", stale: false }],
      })).toThrow(EigenLayerEthRestakingDomainError);
    }
  });

  it("fails closed for mismatched core evidence while allowing whitelisted false", () => {
    const strategies = evidence();
    strategies[0]!.whitelisted = false;
    expect(() => buildVerifiedEigenLayerEthRestakingExposureSnapshot({
      block: { number: 1, hash: `0x${"ab".repeat(32)}`, timestamp: 2 },
      core: { ...core, strategyManagerDelegation: address(99) },
      strategies, numPods: 12n, burnableEthShares: 3n,
      sources: ["ethereum_rpc"],
      sourceStatus: [{ source: "ethereum_rpc", role: "eigenlayer_finalized_restaking_exposure_evidence", stale: false }],
    })).toThrow(EigenLayerEthRestakingDomainError);
  });

  it("adds exactly one stale marker to verified evidence", () => {
    const snapshot = buildVerifiedEigenLayerEthRestakingExposureSnapshot({
      block: { number: 1, hash: `0x${"ab".repeat(32)}`, timestamp: 2 }, core,
      strategies: evidence(), numPods: 12n, burnableEthShares: 3n,
      sources: ["ethereum_rpc"],
      sourceStatus: [{ source: "ethereum_rpc", role: "eigenlayer_finalized_restaking_exposure_evidence", stale: false }],
      stale: true,
    });
    expect(snapshot.gaps).toHaveLength(7);
    expect(snapshot.gaps.filter((gap) => gap.code === "source_stale")).toHaveLength(1);
    expect(snapshot.source_status[0]?.stale).toBe(true);
  });

  it("fails closed for unavailable evidence with unbounded text or a non-source gap", () => {
    expect(() => buildUnavailableEigenLayerEthRestakingExposureSnapshot({
      summary: "x".repeat(501), gaps: [{ code: "rpc_access_gap", detail: "bounded" }],
      sources: ["ethereum_rpc"],
      sourceStatus: [{ source: "ethereum_rpc", role: "eigenlayer_finalized_restaking_exposure_evidence", stale: false }],
    })).toThrow(EigenLayerEthRestakingDomainError);
    expect(() => buildUnavailableEigenLayerEthRestakingExposureSnapshot({
      summary: "unavailable", gaps: [{ code: "native_restaked_eth_not_measured", detail: "not a source failure" }],
    })).toThrow(EigenLayerEthRestakingDomainError);
  });
});
