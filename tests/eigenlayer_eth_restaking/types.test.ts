import { describe, expect, it } from "vitest";
import {
  EIGENLAYER_CORE_CONTRACTS,
  EIGENLAYER_ETH_LST_STRATEGIES,
  EigenLayerEthRestakingExposureSnapshotSchema,
} from "../../src/eigenlayer_eth_restaking/types.js";

const hash = `0x${"ab".repeat(32)}`;
const address = (value: number) => `0x${value.toString(16).padStart(40, "0")}`;

function verified() {
  return {
    status: "verified",
    summary: "verified",
    methodology: "eigenlayer-eth-restaking-exposure-v1",
    verified_block: { number: 1, hash, timestamp: 2 },
    core_contracts: EIGENLAYER_CORE_CONTRACTS,
    strategies: EIGENLAYER_ETH_LST_STRATEGIES.map((fixed, index) => ({
      ...fixed,
      underlying_token: address(index + 1),
      decimals: 18,
      whitelisted: index % 2 === 0,
      strategy_manager: EIGENLAYER_CORE_CONTRACTS.strategy_manager,
      total_shares: String(index + 10),
      token_custody: String(index + 20),
      share_accounting_underlying: String(index + 15),
      share_quote_exceeds_custody: false,
    })),
    native_diagnostics: {
      strategy_manager_delegation: EIGENLAYER_CORE_CONTRACTS.delegation_manager,
      eigen_pod_manager_delegation: EIGENLAYER_CORE_CONTRACTS.delegation_manager,
      beacon_chain_eth_strategy: EIGENLAYER_CORE_CONTRACTS.beacon_chain_eth_strategy,
      num_pods: "12",
      burnable_eth_shares: "3",
    },
    metrics: {
      native_restaked_eth_wei: null,
      lst_restaked_eth_equivalent_wei: null,
      eigenlayer_eth_family_exposure_eth_wei: null,
      unique_net_eth_locked: null,
      combined_aave_spark_lido_sky_eigenlayer_demand: null,
      rehypothecation_ratio: null,
    },
    identities: {
      core_manager_bindings_verified: true,
      beacon_strategy_identity_verified: true,
      strategy_manager_bindings_verified: true,
      underlying_tokens_unique: true,
      token_native_amounts_not_aggregated: true,
    },
    coverage: {
      fixed_strategy_universe_complete: true,
      native_restaked_eth_complete: false,
      lst_restaked_eth_equivalent_complete: false,
      eigenlayer_eth_family_exposure_complete: false,
      unique_net_eth_locked_complete: false,
      combined_aave_spark_lido_sky_eigenlayer_demand_complete: false,
      rehypothecation_ratio_complete: false,
    },
    sources: ["ethereum_rpc"],
    source_status: [{ source: "ethereum_rpc", role: "eigenlayer_finalized_restaking_exposure_evidence", stale: false }],
    gaps: [
      { code: "native_restaked_eth_not_measured", detail: "not measured" },
      { code: "lst_restaked_eth_equivalent_not_measured", detail: "not measured" },
      { code: "eigenlayer_eth_family_exposure_not_measured", detail: "not measured" },
      { code: "unique_net_eth_locked_not_reconciled", detail: "not reconciled" },
      { code: "combined_aave_spark_lido_sky_eigenlayer_demand_not_reconciled", detail: "not reconciled" },
      { code: "rehypothecation_ratio_not_measured", detail: "not measured" },
    ],
    capabilities: { ethereum_rpc_active: true },
  };
}

function unavailable() {
  const value = verified();
  return {
    ...value,
    status: "unavailable",
    summary: "unavailable",
    verified_block: null,
    core_contracts: null,
    strategies: [],
    native_diagnostics: null,
    identities: null,
    coverage: { ...value.coverage, fixed_strategy_universe_complete: false },
    gaps: [{ code: "rpc_access_gap", detail: "bounded" }],
    capabilities: { ethereum_rpc_active: false },
  };
}

describe("EigenLayer ETH restaking exposure domain", () => {
  it("publishes the exact ordered official core and twelve-strategy universe", () => {
    expect(EIGENLAYER_CORE_CONTRACTS).toEqual({
      strategy_manager: "0x858646372CC42E1A627fcE94aa7A7033e7CF075A",
      eigen_pod_manager: "0x91E677b07F7AF907ec9a428aafA9fc14a0d3A338",
      delegation_manager: "0x39053D51B77DC0d36036Fc1fCc8Cb819df8Ef37A",
      beacon_chain_eth_strategy: "0xbeaC0eeEeeeeEEeEeEEEEeeEEeEeeeEeeEEBEaC0",
    });
    expect(EIGENLAYER_ETH_LST_STRATEGIES).toEqual([
      { label: "stETH", strategy: "0x93c4b944D05dfe6df7645A86cd2206016c51564D" },
      { label: "rETH", strategy: "0x1BeE69b7dFFfA4E2d53C2a2Df135C388AD25dCD2" },
      { label: "cbETH", strategy: "0x54945180dB7943c0ed0FEE7EdaB2Bd24620256bc" },
      { label: "ETHx", strategy: "0x9d7eD45EE2E8FC5482fa2428f15C971e6369011d" },
      { label: "ankrETH", strategy: "0x13760F50a9d7377e4F20CB8CF9e4c26586c658ff" },
      { label: "oETH", strategy: "0xa4C637e0F704745D182e4D38cAb7E7485321d059" },
      { label: "osETH", strategy: "0x57ba429517c3473B6d34CA9aCd56c0e735b94c02" },
      { label: "swETH", strategy: "0x0Fe4F44beE93503346A3Ac9EE5A26b130a5796d6" },
      { label: "wBETH", strategy: "0x7CA911E83dabf90C90dD3De5411a10F1A6112184" },
      { label: "sfrxETH", strategy: "0x8CA7A5d6f3acd3A7A8bC468a8CD0FB14B6BD28b6" },
      { label: "lsETH", strategy: "0xAe60d8180437b5C34bB956822ac2710972584473" },
      { label: "mETH", strategy: "0x298aFB19A105D59E74658C4C334Ff360BadE6dd2" },
    ]);
  });

  it("accepts one exact fresh verified token-native and native-diagnostic snapshot", () => {
    expect(EigenLayerEthRestakingExposureSnapshotSchema.safeParse(verified()).success).toBe(true);
  });

  it("rejects incoherent fixed-strategy evidence without throwing from safeParse", () => {
    const mutations: Array<(value: ReturnType<typeof verified>) => void> = [
      (value) => { value.strategies.reverse(); },
      (value) => { value.strategies[1]!.underlying_token = value.strategies[0]!.underlying_token; },
      (value) => { value.strategies[0]!.strategy_manager = address(99) as typeof value.strategies[0]["strategy_manager"]; },
      (value) => { value.strategies[0]!.underlying_token = address(0); },
    ];
    for (const mutate of mutations) {
      const value = verified();
      mutate(value);
      expect(() => EigenLayerEthRestakingExposureSnapshotSchema.safeParse(value)).not.toThrow();
      expect(EigenLayerEthRestakingExposureSnapshotSchema.safeParse(value).success).toBe(false);
    }
  });

  it("accepts uint8 token decimals and an independent share-accounting quote", () => {
    const value = verified();
    value.strategies[0]!.decimals = 8;
    value.strategies[0]!.share_accounting_underlying = "21";
    value.strategies[0]!.share_quote_exceeds_custody = true;
    expect(EigenLayerEthRestakingExposureSnapshotSchema.safeParse(value).success).toBe(true);
  });

  it("accepts exactly one unavailable source gap with zero partial evidence", () => {
    expect(EigenLayerEthRestakingExposureSnapshotSchema.safeParse(unavailable()).success).toBe(true);
  });

  it("rejects incomplete verified provenance and permanent-gap boundaries", () => {
    const mutations: Array<(value: ReturnType<typeof verified>) => void> = [
      (value) => { value.gaps.pop(); },
      (value) => { value.gaps.push({ code: "rpc_access_gap", detail: "not allowed" }); },
      (value) => { value.source_status[0]!.stale = true; },
      (value) => { value.verified_block = null as never; },
      (value) => { value.core_contracts = null as never; },
      (value) => { value.native_diagnostics = null as never; },
      (value) => { value.coverage.fixed_strategy_universe_complete = false; },
      (value) => { value.capabilities.ethereum_rpc_active = false; },
    ];
    for (const mutate of mutations) {
      const value = verified();
      mutate(value);
      expect(EigenLayerEthRestakingExposureSnapshotSchema.safeParse(value).success).toBe(false);
    }
  });

  it("accepts exactly one coherent stale marker", () => {
    const value = verified();
    value.source_status[0]!.stale = true;
    value.gaps.push({ code: "source_stale", detail: "stale" });
    expect(EigenLayerEthRestakingExposureSnapshotSchema.safeParse(value).success).toBe(true);
  });

  it("rejects malformed and overflowed public values without throwing", () => {
    const mutations: Array<(value: ReturnType<typeof verified>) => void> = [
      (value) => { value.verified_block.number = Number.MAX_SAFE_INTEGER + 1; },
      (value) => { value.verified_block.timestamp = Number.MAX_SAFE_INTEGER + 1; },
      (value) => { value.strategies[0]!.total_shares = (2n ** 256n).toString(); },
      (value) => { value.native_diagnostics.num_pods = "01"; },
      (value) => { value.strategies[0]!.decimals = -1; },
      (value) => { value.strategies[0]!.decimals = 256; },
      (value) => { value.strategies[0]!.share_quote_exceeds_custody = true; },
      (value) => { value.summary = "x".repeat(501); },
      (value) => { value.gaps[0]!.detail = "x".repeat(241); },
    ];
    for (const mutate of mutations) {
      const value = verified();
      mutate(value);
      expect(() => EigenLayerEthRestakingExposureSnapshotSchema.safeParse(value)).not.toThrow();
      expect(EigenLayerEthRestakingExposureSnapshotSchema.safeParse(value).success).toBe(false);
    }
  });

  it("rejects unavailable output containing partial or plural evidence", () => {
    const partial: any = unavailable();
    partial.strategies = verified().strategies;
    expect(EigenLayerEthRestakingExposureSnapshotSchema.safeParse(partial).success).toBe(false);

    const plural = unavailable();
    plural.gaps.push({ code: "rpc_schema_drift", detail: "second" });
    expect(EigenLayerEthRestakingExposureSnapshotSchema.safeParse(plural).success).toBe(false);
  });
});
